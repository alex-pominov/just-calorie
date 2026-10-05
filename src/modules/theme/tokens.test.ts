import fs from 'node:fs';
import path from 'node:path';

import tokens from './tokens';
import { colors } from './index';

const ROOT = path.resolve(__dirname, '../../..');

// The PostScript name (name ID 6) is what iOS matches a fontFamily against.
function postScriptName(fontFile: string): string | undefined {
  const font = fs.readFileSync(fontFile);
  const tableCount = font.readUInt16BE(4);

  for (let table = 0; table < tableCount; table++) {
    const record = 12 + table * 16;

    if (font.toString('latin1', record, record + 4) !== 'name') continue;

    const nameTable = font.readUInt32BE(record + 8);
    const strings = nameTable + font.readUInt16BE(nameTable + 4);

    for (let entry = 0; entry < font.readUInt16BE(nameTable + 2); entry++) {
      const at = nameTable + 6 + entry * 12;

      if (font.readUInt16BE(at + 6) !== 6) continue;

      const start = strings + font.readUInt16BE(at + 10);
      const bytes = font.subarray(start, start + font.readUInt16BE(at + 8));

      return font.readUInt16BE(at) === 3 ? bytes.swap16().toString('utf16le') : bytes.toString('latin1');
    }
  }

  return undefined;
}

function expoFontPluginFiles(): unknown {
  const appJson: { expo: { plugins: unknown[] } } = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const entry = appJson.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-font');

  return Array.isArray(entry) ? (entry[1] as { fonts: string[] }).fonts : undefined;
}

describe('design tokens', () => {
  it('writes every colour as #RRGGBB or rgba() with an alpha strictly between 0 and 1', () => {
    const malformed = Object.entries(tokens.colors).filter(
      ([, value]) => !/^#[0-9A-F]{6}$/.test(value) && !/^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0\.\d+\)$/.test(value),
    );

    expect(malformed).toEqual([]);
  });

  it('derives each tint from its base colour', () => {
    expect(colors['white-50']).toBe('rgba(255, 255, 255, 0.08)');
    expect(colors['over-surface']).toBe('rgba(255, 94, 97, 0.24)');
    expect(colors['on-track-surface']).toBe('rgba(219, 255, 102, 0.2)');
  });

  it('keeps spacing on the 4px grid except the named off-grid steps', () => {
    const offGrid = Object.entries(tokens.spacing)
      .filter(([, value]) => Number.parseInt(value, 10) % 4 !== 0)
      .map(([key]) => key);

    expect(offGrid).toEqual(['0.5', '1.5']);
  });

  it('embeds exactly one TTF per font family, named and registered by its PostScript name', () => {
    const families = Object.values(tokens.fontFamily).map(([family]) => family);

    const embedded = families.map((family) => {
      const file = path.join(ROOT, 'src/assets/fonts', `${family}.ttf`);

      return { family, postScript: fs.existsSync(file) ? postScriptName(file) : 'missing file' };
    });

    expect(embedded).toEqual(families.map((family) => ({ family, postScript: family })));
    expect(expoFontPluginFiles()).toEqual(families.map((family) => `./src/assets/fonts/${family}.ttf`));
  });

  it('types colour names, so a name outside the design does not compile', () => {
    // @ts-expect-error -- 'blue' is not a design colour; the token type must reject it
    const offDesign: string = colors.blue;

    expect(offDesign).toBeUndefined();
  });
});
