// TS 6 (TS2882) needs a declaration for app/_layout.tsx's side-effect import of global.css.
// expo-env.d.ts also provides one, but it is generated and gitignored, so a fresh checkout lacks it.
declare module '*.css';
