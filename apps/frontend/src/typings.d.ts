declare module "aladin-lite" {
  /**
   * Default export is an object with a handful of helper methods.  The
   * most commonly-used is `aladin()` which constructs a viewer instance.
   * We provide minimal typing so that code compiles; anything else can be
   * accessed via `any`.
   */
  interface AladinLib {
    aladin: (container: string | HTMLElement, options?: unknown) => unknown;
    [key: string]: unknown;
  }
  const aladin: AladinLib;
  export default aladin;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "d3" {
  const d3: any;
  export = d3;
}
