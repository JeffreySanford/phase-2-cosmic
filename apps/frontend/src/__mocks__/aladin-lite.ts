// Minimal manual mock for aladin-lite used in unit tests.
// The jest runtime isn't available during the normal build/serve step, so
// avoid referencing the bare `jest` identifier which the TypeScript compiler
// resolves at build time. Read `jest` from the global object instead and
// fall back to a simple no-op implementation.

const noop = () => ({});
type MaybeJest = { fn?: (fn: () => unknown) => unknown } | undefined;
const jestGlobal = (globalThis as unknown as { jest?: MaybeJest }).jest;
const aladinFn =
  typeof jestGlobal !== "undefined" && typeof jestGlobal.fn === "function"
    ? (jestGlobal.fn as (fn: () => unknown) => unknown)(noop)
    : noop;

const aladin = {
  aladin: aladinFn,
};

// Jest expects a CommonJS export as well
export default aladin;
module.exports = aladin;
