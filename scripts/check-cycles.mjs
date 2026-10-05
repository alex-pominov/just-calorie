#!/usr/bin/env node
/* global console, process */
// Import-cycle gate. Runs madge over src/ + app/ and fails on any require
// cycle whose boundary group is not explicitly listed in ALLOWED_CYCLES.
//
// A "boundary" is the architectural unit a file belongs to:
//   src/features/<name>/**   -> features/<name>
//   src/modules/<name>/**    -> modules/<name>
//   src/components/<cat>/**  -> components/<cat>
//   src/<atomDir>/**         -> <atomDir>           (hooks, utils, config, providers, ...)
//   app/**                   -> app
//
// A madge file-level cycle is reduced to its set of boundaries. Cycles whose
// boundary set exactly matches an ALLOWED_CYCLES entry pass; everything else
// (including single-boundary cycles between files inside one feature/module)
// fails the build.
//
// ALLOWED_CYCLES is permanently empty as of Phase 3 of the 2026-06-11
// refactor. Any new entry is a regression — break the cycle instead.
import madge from 'madge';

export const ALLOWED_CYCLES = [];

const BOUNDARY_PARENTS = new Set(['components', 'features', 'modules']);

function boundaryOf(file) {
  const parts = file.split('/');

  if (parts[0] === 'src' && BOUNDARY_PARENTS.has(parts[1]) && parts.length > 3) {
    return `${parts[1]}/${parts[2]}`;
  }

  if (parts[0] === 'src') return parts[1];

  return parts[0];
}

function keyOf(boundaries) {
  return [...new Set(boundaries)].sort().join(' <-> ');
}

const allowedKeys = new Set(ALLOWED_CYCLES.map(keyOf));

const result = await madge(['src', 'app'], {
  tsConfig: 'tsconfig.json',
  fileExtensions: ['ts', 'tsx'],
  detectiveOptions: {
    ts: { skipTypeImports: true },
    tsx: { skipTypeImports: true },
  },
});

const fileCount = Object.keys(result.obj()).length;

if (fileCount === 0) {
  console.error('[check-cycles] FAIL: madge examined 0 files under src/ and app/ — the gate cannot reach an answer.');
  process.exit(1);
}

const cycles = result.circular();
const disallowed = [];
const seenAllowedKeys = new Set();

for (const cycle of cycles) {
  const key = keyOf(cycle.map(boundaryOf));

  if (allowedKeys.has(key)) {
    seenAllowedKeys.add(key);
  } else {
    disallowed.push({ key, cycle });
  }
}

for (const key of allowedKeys) {
  if (!seenAllowedKeys.has(key)) {
    console.warn(
      `[check-cycles] WARNING: allowed cycle [${key}] no longer occurs — remove its entry from ALLOWED_CYCLES in scripts/check-cycles.mjs.`,
    );
  }
}

if (disallowed.length > 0) {
  console.error(`[check-cycles] FAIL: ${disallowed.length} disallowed import cycle(s):\n`);

  for (const { key, cycle } of disallowed) {
    console.error(`  [${key}]`);
    console.error(`    ${cycle.join('\n    -> ')}\n`);
  }

  console.error('[check-cycles] Break the cycle. ALLOWED_CYCLES is reserved for known transitional cycles only.');
  process.exit(1);
}

console.log(
  `[check-cycles] OK: ${fileCount} file(s) examined; ${cycles.length} file-level cycle(s), all inside the ${allowedKeys.size} allowed group(s); 0 disallowed.`,
);
