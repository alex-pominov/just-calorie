import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { compileFunction } from 'node:vm';

import type { NodePath } from '@babel/core';
import { parseSync, transformSync, traverse, types } from '@babel/core';

import { bowlState } from '../features/today/services/bowl-counts.service';
import type * as BowlWorldModule from '../features/today/services/bowl-world.service';

// Metro runs each worklet through react-native-worklets' Babel plugin, which turns it into `var f = f_Factory({ ...the
// values it captures })`, run in source order: a worklet that captures one declared below it holds `undefined` on the UI
// thread. Jest's own transform keeps plain hoisted functions, so only a test that builds the module as Metro does sees it.

const ROOT = resolve(__dirname, '../..');
const SRC = join(ROOT, 'src');
const WORKLET_DIRECTIVE = /['"]worklet['"]/;
/** What Metro tells Babel about itself when it bundles for the iOS dev client. */
const METRO_CALLER = { name: 'metro', bundler: 'metro', platform: 'ios' };
const METRO_BUILD = { cwd: ROOT, envName: 'development', caller: METRO_CALLER };
/** The modules the bowl's frame loop runs on the UI thread: the scan must find each of them, or it has gone blind. */
const BOWL_WORKLET_MODULES = [
  'src/features/today/components/Bowl.tsx',
  'src/features/today/hooks/useBowlWorld.ts',
  'src/features/today/services/bowl-physics.service.ts',
  'src/features/today/services/bowl-plan.service.ts',
  'src/features/today/services/bowl-world.service.ts',
];

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      return sourceFilesUnder(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The module's code as Metro bundles it for the iOS dev client. */
function builtAsMetroDoes(file: string): string {
  const code = transformSync(readFileSync(file, 'utf8'), { ...METRO_BUILD, filename: file })?.code;

  if (code == null) {
    throw new Error(`Babel produced no code for ${file}`);
  }
  return code;
}

const rootName = (value: types.Node): string | null => {
  if (types.isIdentifier(value)) {
    return value.name;
  }
  return types.isMemberExpression(value) ? rootName(value.object) : null;
};

/** True when `name`, read where the factory runs, is a variable of the same function whose declaration has not finished. */
function isUnassignedWhenRun(factoryCall: NodePath<types.CallExpression>, name: string): boolean {
  const binding = factoryCall.scope.getBinding(name);

  if (binding === undefined || !['var', 'let', 'const'].includes(binding.kind)) {
    return false;
  }
  const runsIn = factoryCall.scope.getFunctionParent() ?? factoryCall.scope.getProgramParent();
  const declaredIn = binding.scope.getFunctionParent() ?? binding.scope.getProgramParent();

  return runsIn === declaredIn && (binding.path.node.end ?? 0) > (factoryCall.node.start ?? 0);
}

/** Each worklet factory in the module as Metro builds it, and each value one captures before that value exists. */
function scanWorklets(file: string): { factories: number; capturedTooEarly: string[] } {
  const ast = parseSync(builtAsMetroDoes(file), { filename: `${file}.metro.js`, configFile: false, babelrc: false });
  const capturedTooEarly: string[] = [];
  let factories = 0;

  if (ast === null) {
    throw new Error(`Babel could not parse what it built from ${file}`);
  }
  traverse(ast, {
    CallExpression(call) {
      const [closure] = call.node.arguments;
      const factory = call.node.callee;

      if (!types.isFunctionExpression(factory) || factory.id?.name.endsWith('Factory') !== true || !types.isObjectExpression(closure)) {
        return;
      }
      factories += 1;
      for (const property of closure.properties) {
        const name = types.isObjectProperty(property) ? rootName(property.value) : null;

        if (name !== null && isUnassignedWhenRun(call, name)) {
          capturedTooEarly.push(`${relative(ROOT, file)}: ${factory.id.name} captures ${name} before it is assigned`);
        }
      }
    },
  });

  return { factories, capturedTooEarly };
}

/** Loads a module, and the project modules it imports, as Metro builds them, so its worklets run as the UI thread runs them. */
function loadAsMetroBuildsIt(file: string, loaded = new Map<string, object>()): object {
  const known = loaded.get(file);

  if (known !== undefined) {
    return known;
  }
  const module = { exports: {} };
  const requireFromFile = createRequire(file);
  const requireAsMetro = (id: string): unknown => {
    const local = ['.ts', '.tsx'].map((extension) => resolve(dirname(file), `${id}${extension}`)).find((path) => existsSync(path));

    return id.startsWith('.') && local !== undefined ? loadAsMetroBuildsIt(local, loaded) : requireFromFile(id);
  };
  loaded.set(file, module.exports);
  compileFunction(builtAsMetroDoes(file), ['exports', 'require', 'module', 'global'])(module.exports, requireAsMetro, module, globalThis);

  return module.exports;
}

const countsFor = (totalKcal: number) => bowlState({ totalKcal, addedCarryOverKcal: 0, capKcal: 1200 }).counts;
// Loading the project's Babel presets once, while the file loads, keeps that cost out of every test's budget.
transformSync('', { ...METRO_BUILD, filename: join(SRC, 'preset-load.ts') });
const WORKLET_MODULES = sourceFilesUnder(SRC)
  .filter((file) => WORKLET_DIRECTIVE.test(readFileSync(file, 'utf8')))
  .map((file) => relative(ROOT, file));

describe('the worklets as Metro builds them for the UI thread', () => {
  it('are looked for in every module the bowl runs on the UI thread', () => {
    expect(WORKLET_MODULES).toEqual(expect.arrayContaining(BOWL_WORKLET_MODULES));
  });

  it.each(WORKLET_MODULES)('capture only values that exist when each worklet is made, in %s', (module) => {
    const { factories, capturedTooEarly } = scanWorklets(join(ROOT, module));

    expect({ hasWorklets: factories > 0, capturedTooEarly }).toEqual({ hasWorklets: true, capturedTooEarly: [] });
  });

  it.each([
    [1200, 1250],
    [0, 1250],
  ])('pour a change from %p to %p kcal, a little over the cap, without throwing', (from, to) => {
    const world = loadAsMetroBuildsIt(join(SRC, 'features/today/services/bowl-world.service.ts')) as typeof BowlWorldModule;
    const bowl = world.createWorld(7, 20.5);
    world.retargetWorld(bowl, countsFor(from));
    Array.from({ length: 180 }).forEach(() => world.advanceWorld(bowl, 1 / 60));

    world.retargetWorld(bowl, countsFor(to));
    Array.from({ length: 180 }).forEach(() => world.advanceWorld(bowl, 1 / 60));

    expect(world.presentCounts(bowl)).toEqual(countsFor(to));
  });
});
