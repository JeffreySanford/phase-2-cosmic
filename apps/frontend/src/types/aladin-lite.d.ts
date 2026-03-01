// This file only declares the dist ESM path to avoid implicit `any` when
// importing 'aladin-lite/dist/aladin.js'. The main module typings are
// already provided in `apps/frontend/src/typings.d.ts` to avoid duplicate
// declarations for the primary module name.

declare module 'aladin-lite/dist/aladin.js' {
  import aladinDefault from 'aladin-lite';
  // Re-export the default from the main module so consumers get the same shape.
  const _default: typeof aladinDefault;
  export default _default;
  export const aladin: typeof aladinDefault;
  export function init(): Promise<void>;
}
