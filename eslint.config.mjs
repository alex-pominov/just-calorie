import fs from 'node:fs';
import path from 'node:path';
import globals from 'globals';
import expoConfig from 'eslint-config-expo/flat.js';
import { defineConfig, globalIgnores } from 'eslint/config';

// Boundary rules for the folder kinds in README.md, built from the directory
// layout at load time: a new feature, module or component category is fenced the
// day its folder exists. ESLint REPLACES a rule's options across matching config
// objects, so every override below MUST restate the global patterns, or the
// files it matches silently lose them.

const TS_FILES = '**/*.{ts,tsx}';

function listSubdirs(relDir) {
  if (!fs.existsSync(relDir)) return [];

  return fs
    .readdirSync(relDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

// Applied only where "it erases at compile time" is the whole justification
// for a ban: the SDK gateway (no runtime coupling) and the self-import ban (a
// type import cannot form a require cycle). Never to the deep-import or
// layering bans, where a type in a signature is a real dependency.
const allowTypes = (patterns) => patterns.map((pattern) => ({ ...pattern, allowTypeImports: true }));

// Public-API boundaries are crossed through the folder's index.ts only.
const DEEP_IMPORT_BANS = [
  {
    group: ['@/features/*/*'],
    message: "Cross-feature imports must go through '@/features/<name>' (the public-API index.ts), not deep paths.",
  },
  {
    group: ['@/modules/*/*'],
    message: "Cross-module imports must go through '@/modules/<name>' (the public-API index.ts), not deep paths.",
  },
  {
    group: ['@/components/*/*'],
    message: "Component imports must go through '@/components/<category>' (the category public API), not deep paths.",
  },
  {
    group: ['@/assets/icons/*'],
    message: "Icon imports must go through '@/assets/icons' (the category index.ts), not per-icon file paths.",
  },
];

// Each native SDK below is importable ONLY inside its owning module — the
// module is the gateway, and consumers import what they need from its index.ts.
const SDK_GATEWAYS = {
  'expo-sqlite': 'modules/database',
  // The Keychain holds ChatGPT tokens, so only the sign-in module may reach it.
  'expo-secure-store': 'modules/chatgpt-auth',
  'expo-auth-session': 'modules/chatgpt-auth',
};

function sdkBans(ownModule) {
  return allowTypes(
    Object.entries(SDK_GATEWAYS)
      .filter(([, owner]) => owner !== ownModule)
      .map(([pkg, owner]) => ({
        group: [pkg, `${pkg}/**`],
        message: `'${pkg}' is gated behind src/${owner}/ — import what you need from '@/${owner}' instead (or export it from there). Type-only imports are exempt.`,
      })),
  );
}

const FEATURE_IMPORT = ['@/features/*', '@/features/*/**'];

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

// `require()` and `import()` are not import declarations, so no-restricted-imports never sees them;
// without these selectors the SDK gateway is one dynamic import away from meaning nothing.
function sdkCallBans(ownModule) {
  return Object.entries(SDK_GATEWAYS)
    .filter(([, owner]) => owner !== ownModule)
    .flatMap(([pkg, owner]) => {
      const specifier = `/^${escapeRegExp(pkg)}([^-a-z0-9_.]|$)/`;
      const message = `'${pkg}' is gated behind src/${owner}/ — import what you need from '@/${owner}' instead.`;

      return [
        { selector: `CallExpression[callee.name='require'][arguments.0.value=${specifier}]`, message },
        { selector: `ImportExpression[source.value=${specifier}]`, message },
      ];
    });
}

// A boundary is one feature, module or component category; any other src/ folder is one atom
// boundary. The same reduction scripts/check-cycles.mjs uses.
const SRC_ROOT = path.resolve('src');
const BOUNDARY_PARENTS = new Set(['features', 'modules', 'components']);

function boundaryOf(absolutePath) {
  const parts = path.relative(path.dirname(SRC_ROOT), absolutePath).split(path.sep);

  if (parts[0] !== 'src') return parts[0];
  if (BOUNDARY_PARENTS.has(parts[1]) && parts.length > 3) return `src/${parts[1]}/${parts[2]}`;

  return `src/${parts[1]}`;
}

// The @/ patterns only see alias specifiers; a relative path can walk into another boundary's
// interior unnoticed. This resolves every relative specifier and refuses one that lands in a
// different boundary under src/.
const boundaryPlugin = {
  rules: {
    'no-relative-cross-boundary': {
      meta: {
        type: 'problem',
        messages: {
          crossing: "'{{source}}' leaves {{from}} for {{to}}. Cross a boundary through its public index with an '@/' import.",
        },
      },
      create(context) {
        const from = boundaryOf(context.filename);
        const check = (node) => {
          if (node?.type !== 'Literal' || typeof node.value !== 'string' || !node.value.startsWith('.')) return;

          const target = path.resolve(path.dirname(context.filename), node.value);

          if (!target.startsWith(SRC_ROOT + path.sep)) return;

          const to = boundaryOf(target);

          if (to !== from) context.report({ node, messageId: 'crossing', data: { source: node.value, from, to } });
        };

        return {
          ImportDeclaration: (node) => check(node.source),
          ExportNamedDeclaration: (node) => check(node.source),
          ExportAllDeclaration: (node) => check(node.source),
          ImportExpression: (node) => check(node.source),
          'CallExpression[callee.name="require"]': (node) => check(node.arguments[0]),
        };
      },
    },
  },
};

function restrictedImports(patterns) {
  return { '@typescript-eslint/no-restricted-imports': ['error', { patterns }] };
}

function boundaryOverride(parentDir, name) {
  const ownModule = parentDir === 'modules' ? `modules/${name}` : undefined;
  const patterns = [
    ...sdkBans(ownModule),
    ...DEEP_IMPORT_BANS,
    ...allowTypes([
      {
        group: [`@/${parentDir}/${name}`, `@/${parentDir}/${name}/**`],
        message: `Files inside ${parentDir}/${name} must not import from '@/${parentDir}/${name}'. Use a relative path — the public index.ts is for cross-boundary consumers, and a self-import creates a require cycle.`,
      },
    ]),
  ];

  // Modules and shared components sit below features; features consume them, never the reverse.
  // Not type-exempt: a signature naming a feature type is a real dependency.
  if (parentDir === 'modules' || parentDir === 'components') {
    patterns.push({
      group: FEATURE_IMPORT,
      message: `${parentDir === 'modules' ? 'Modules' : 'Shared components'} must not depend on features — features consume them, not the reverse. Move the shared piece down, or take the feature-owned piece from the caller. This applies to type-only imports too.`,
    });
  }

  return {
    files: [`src/${parentDir}/${name}/${TS_FILES}`],
    rules: { ...restrictedImports(patterns), 'no-restricted-syntax': ['error', ...sdkCallBans(ownModule)] },
  };
}

const boundaryOverrides = [
  ...listSubdirs('src/features').map((name) => boundaryOverride('features', name)),
  ...listSubdirs('src/modules').map((name) => boundaryOverride('modules', name)),
  ...listSubdirs('src/components')
    .filter((name) => fs.existsSync(path.join('src/components', name, 'index.ts')))
    .map((name) => boundaryOverride('components', name)),
];

export default defineConfig([
  globalIgnores(['node_modules/**', 'ios/**', '.expo/**', 'build/**', 'coverage/**', 'dist/**', '.worktrees/**']),

  expoConfig,

  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },

  // Config files and scripts run in Node.
  {
    files: ['*.config.{js,mjs}', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // Makes the type-import exemptions above predictable: a type written as
  // `import { Foo }` would otherwise be banned by a rule that allows `import type { Foo }`.
  {
    files: [TS_FILES],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }],
    },
  },

  // Everything in app/ and src/: the SDK gateway, the deep-import bans and the relative-path fence.
  {
    files: [`app/${TS_FILES}`, `src/${TS_FILES}`],
    plugins: { boundaries: boundaryPlugin },
    rules: {
      ...restrictedImports([...sdkBans(), ...DEEP_IMPORT_BANS]),
      'no-restricted-syntax': ['error', ...sdkCallBans()],
      'boundaries/no-relative-cross-boundary': 'error',
    },
  },

  // Atoms sit below features in the layer order and must not import them.
  {
    files: [`src/hooks/${TS_FILES}`, `src/utils/${TS_FILES}`, `src/config/${TS_FILES}`],
    rules: restrictedImports([
      ...sdkBans(),
      ...DEEP_IMPORT_BANS,
      {
        group: FEATURE_IMPORT,
        message:
          'Atoms (src/hooks, src/utils, src/config) sit below features and must not import them. Move the code into the owning feature, or inject the feature-owned piece from the caller. This applies to type-only imports too.',
      },
    ]),
  },

  ...boundaryOverrides,

  // Tests may cross boundaries to reach fixtures; they opt out of the import gate.
  {
    files: [`**/*.{test,spec}.{ts,tsx}`, `tests/${TS_FILES}`],
    languageOptions: { globals: globals.jest },
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
      'boundaries/no-relative-cross-boundary': 'off',
    },
  },
]);
