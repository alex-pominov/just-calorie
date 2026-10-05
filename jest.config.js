// The day-key tests prove local-midnight handling only where local and UTC dates differ: under TZ=UTC a
// UTC-based bug passes them silently. Pinned so every machine runs them in the same non-UTC zone.
process.env.TZ = 'America/New_York';

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/ios',
  clearMocks: true,
  // Tests live beside their code in src/. A test under app/ would be a route, so app/ is never collected.
  testMatch: ['<rootDir>/src/**/*.{test,spec}.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/build/', '/.expo/', '/coverage/'],
  // Skia draws through a native module that no Jest environment has; tests render the bowl's canvas empty.
  moduleNameMapper: { '^@shopify/react-native-skia$': '<rootDir>/tests/skia.mock.tsx' },
  // Worklets' own resolver picks its JS build, so Reanimated runs for real in Jest: without it, importing
  // Reanimated reads a native module that is not there and every suite rendering the bowl fails to load.
  resolver: 'react-native-worklets/jest/resolver',
  reporters: ['default', ['jest-junit', { outputDirectory: 'coverage', outputName: 'junit.xml', addFileAttribute: 'true' }]],
};
