import fs from 'node:fs';
import path from 'node:path';
import resolveConfig from 'tailwindcss/resolveConfig';

import tokens from './tokens';
import tailwindConfig from '../../../tailwind.config';

const ROOT = path.resolve(__dirname, '../../..');

// Metro resolves the theme with NativeWind's NATIVE preset, which extends more scales than its web one.
const resolveThemeAsMetroDoes = () => {
  process.env.NATIVEWIND_OS = 'ios';

  return resolveConfig(tailwindConfig).theme;
};
const THEME_DIR = path.join('src', 'modules', 'theme');
const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|json)$/;
const ROOT_FILE = /\.(?:js|mjs|cjs|json|css)$/;
const COLOUR_LITERAL = /#[0-9A-Fa-f]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/g;

// The CSS colour names React Native accepts; a string literal holding one is a colour written outside
// the tokens. coral and lime are also token names, so an index into `colors[...]` is exempt.
const CSS_COLOUR_NAMES = (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet ' +
  'brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan ' +
  'darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta ' +
  'darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue ' +
  'darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey ' +
  'dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray ' +
  'green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush ' +
  'lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen ' +
  'lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey ' +
  'lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue ' +
  'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
  'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive ' +
  'olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred ' +
  'papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue ' +
  'saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray ' +
  'slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
  'whitesmoke yellow yellowgreen'
)
  .trim()
  .split(' ');

const COLOUR_KEY = String.raw`(?:fill|stroke|color|\w+Color)`;
const STYLE_KEY = String.raw`(?:(?:min|max)?(?:Width|Height)|width|height|top|right|bottom|left|start|end|inset|gap|rowGap|columnGap|elevation|fontSize|lineHeight|fontFamily|fontWeight|letterSpacing|shadowRadius|shadowOffset|(?:padding|margin)(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?|border(?:Top|Bottom|Left|Right|Start|End)?Width|border(?:(?:Top|Bottom)(?:Left|Right|Start|End))?Radius)`;

const DESIGN_LITERALS: readonly { kind: string; pattern: RegExp }[] = [
  { kind: 'hex colour', pattern: /#[0-9A-Fa-f]{3,8}\b/g },
  { kind: 'colour function', pattern: /\b(?:rgba?|hsla?)\(/g },
  { kind: 'platform colour', pattern: /\b(?:PlatformColor|DynamicColorIOS)\s*\(/g },
  {
    kind: 'literal colour value',
    pattern: new RegExp(String.raw`\b${COLOUR_KEY}\s*[=:]\s*\{?\s*(['"\`])(?!(?:none|transparent|currentColor)\1)`, 'g'),
  },
  {
    kind: 'named colour',
    pattern: new RegExp(String.raw`(?<!colors\[)(['"\`])(?:${CSS_COLOUR_NAMES.join('|')})\1`, 'gi'),
  },
  { kind: 'arbitrary class value', pattern: /[A-Za-z0-9]-\[[^\]\s]+\]/g },
  { kind: 'arbitrary property class', pattern: /\[[a-z-]+:[^\]\s]+\]/g },
  { kind: 'inline design style', pattern: new RegExp(String.raw`\b${STYLE_KEY}\s*:\s*['"\`\d-]`, 'g') },
];

// A design value parked in a same-file constant (`const GAP = 7; columnGap: GAP`). A constant imported
// from another file is out of reach without type information.
function literalConstantUses(source: string): string[] {
  const constants = [...source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:-?\d|['"`])/g)].map((match) => match[1]);

  return constants.flatMap((name) =>
    [...source.matchAll(new RegExp(String.raw`\b(?:${STYLE_KEY}|${COLOUR_KEY})\s*[=:]\s*\{?\s*${name}\b`, 'g'))].map(
      (match) => `design value in a constant: ${match[0].trim()}`,
    ),
  );
}

function findDesignLiterals(source: string): string[] {
  return [
    ...DESIGN_LITERALS.flatMap(({ kind, pattern }) =>
      [...source.matchAll(pattern)].map((match) => `${kind}: ${match[0].trim()}`),
    ),
    ...literalConstantUses(source),
  ];
}

function sourceFilesOutsideTheme(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);

    if (entry.isDirectory()) return relative === THEME_DIR ? [] : sourceFilesOutsideTheme(relative);

    return SOURCE_FILE.test(entry.name) ? [relative] : [];
  });
}

function rootFiles(): string[] {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ROOT_FILE.test(entry.name))
    .map((entry) => entry.name);
}

describe('no second source for design values', () => {
  it.each([
    ['hex colour', "fill='#FF5E61'"],
    ['hex colour', 'color="#fff"'],
    ['colour function', "backgroundColor: 'rgba(255, 255, 255, 0.08)'"],
    ['literal colour value', "fill='white'"],
    ['literal colour value', "{ shadowColor: 'black' }"],
    ['literal colour value', '{ color: `white` }'],
    ['arbitrary class value', 'className="w-[13px] px-4"'],
    ['arbitrary class value', "cn('bg-[#111113]')"],
    ['arbitrary class value', 'className="active:w-[13px]"'],
    ['arbitrary class value', 'className="ios:text-[15px]"'],
    ['arbitrary class value', 'className="!h-[13px]"'],
    ['arbitrary class value', 'className="-mt-[3px]"'],
    ['inline design style', 'style={{ fontSize: 14 }}'],
    ['inline design style', 'style={{ paddingHorizontal: 12 }}'],
    ['inline design style', "{ borderRadius: '8px' }"],
    ['inline design style', 'style={{ paddingStart: 13 }}'],
    ['inline design style', 'style={{ width: 37, height: 37 }}'],
    ['inline design style', 'style={{ top: 3 }}'],
    ['inline design style', 'style={{ borderWidth: 1 }}'],
    ['inline design style', 'style={{ fontFamily: `Inter` }}'],
    ['named colour', "const BRAND = 'tomato';"],
    ['named colour', '<StatusBar backgroundColor="black" />'],
    ['platform colour', "{ color: PlatformColor('systemBlue') }"],
    ['platform colour', 'DynamicColorIOS({ light: a, dark: b })'],
    ['arbitrary property class', 'className="[color:tomato]"'],
    ['arbitrary property class', 'className="[width:13px]"'],
    ['design value in a constant', 'const GAP = 7;\nconst box = { columnGap: GAP };'],
    ['design value in a constant', "const BRAND = 'x';\n<Text style={{ color: BRAND }} />"],
    ['hex colour', '{ "brand": "#ABCDEF" }'],
  ])('flags a %s in %s', (kind, source) => {
    expect(findDesignLiterals(source)).toContainEqual(expect.stringMatching(new RegExp(`^${kind}: `)));
  });

  it('stays silent on design values reached through the tokens', () => {
    const tokenUse = [
      'className="flex-1 gap-2 rounded-full bg-coral px-4 text-label font-manrope-bold text-primary active:bg-white-50"',
      "cn('h-9 w-9', isToday && 'bg-surface-selected')",
      "fill={colors.primary} contentStyle={{ backgroundColor: colors['ink-900'] }} style={{ flex: 1 }}",
      'accessibilityState={{ selected: true }} color={colors.coral} tintColor={colors.lime} colorScheme="dark"',
      '<Svg width={163} height={22} viewBox="0 0 163 22" fill="none">',
      'interface IconProps { size?: number | undefined; color?: string | undefined }',
      "const tint = colors['lime']; const LINE = 'font-manrope-medium text-body'; const MAX_KCAL = 10_000;",
      '<Text className={LINE}>{kcal <= MAX_KCAL}</Text> style={{ paddingTop: insets.top }}',
      'type Index = { [key: string]: number };',
    ].join('\n');

    expect(findDesignLiterals(tokenUse)).toEqual([]);
  });

  it('finds no design literal in src/, app/ or the root config files outside the theme module', () => {
    const files = [...sourceFilesOutsideTheme('src'), ...sourceFilesOutsideTheme('app'), ...rootFiles()];

    const findings = files.flatMap((file) =>
      findDesignLiterals(fs.readFileSync(path.join(ROOT, file), 'utf8')).map((finding) => `${file} — ${finding}`),
    );

    expect(files).toEqual(
      expect.arrayContaining(['app/_layout.tsx', 'src/providers/RootProvider.tsx', 'tailwind.config.js', 'global.css', 'app.json']),
    );
    expect(findings).toEqual([]);
  });

  it('replaces every design scale in the Tailwind theme with the tokens and extends none', () => {
    const theme = resolveThemeAsMetroDoes();

    expect(tailwindConfig.theme).not.toHaveProperty('extend');
    expect({
      colors: theme.colors,
      spacing: theme.spacing,
      borderRadius: theme.borderRadius,
      fontSize: theme.fontSize,
      fontFamily: theme.fontFamily,
    }).toEqual({
      colors: tokens.colors,
      spacing: tokens.spacing,
      borderRadius: tokens.borderRadius,
      fontSize: tokens.fontSize,
      fontFamily: tokens.fontFamily,
    });
    expect([theme.fontWeight, theme.lineHeight, theme.letterSpacing, theme.boxShadow, theme.dropShadow]).toEqual([
      {},
      {},
      {},
      {},
      {},
    ]);
  });

  it('leaves no colour outside the tokens reachable through any Tailwind theme scale', () => {
    const theme = resolveThemeAsMetroDoes();
    const tokenColours = new Set<string>(Object.values(tokens.colors));

    const stray = [...JSON.stringify(theme).matchAll(COLOUR_LITERAL)]
      .map((match) => match[0])
      .filter((colour) => !tokenColours.has(colour));

    expect([...new Set(stray)]).toEqual([]);
  });
});
