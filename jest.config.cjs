// allow `npx jest` to load the TypeScript configuration
// since our primary jest.config.ts is written in TS and Nx
// handles it internally.  When running jest directly it
// would otherwise fall back to a default config and emit
// the "jest-circus/build/runner.js not found" validation
// error.

require('ts-node').register({
  project: __dirname + '/tsconfig.json',
});

// `jest.config.ts` exports an async function, so we need to
// handle the Promise it returns.
const cfg = require('./jest.config.ts');

module.exports = (async () => {
  const result = typeof cfg === 'function' ? await cfg() : cfg;
  // if the exported object is in `default` property (ESM), unwrap
  return result.default || result;
})();
