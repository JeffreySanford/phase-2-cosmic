const jestResolve = require("jest-resolve");
const fs = require("fs");
const path = require("path");
const Module = require("module");

process.setMaxListeners(50);

const originalFindNodeModule = jestResolve.default.findNodeModule;
const originalResolveModule = jestResolve.default.prototype.resolveModule;
const originalResolveModuleAsync = jestResolve.default.prototype.resolveModuleAsync;
const originalResolveModuleFromDirIfExists =
  jestResolve.default.prototype.resolveModuleFromDirIfExists;
const originalResolveModuleFromDirIfExistsAsync =
  jestResolve.default.prototype.resolveModuleFromDirIfExistsAsync;
const originalResolveFilename = Module._resolveFilename;

const forcedRuntimeResolutions = new Map([
  [
    "jest-preset-angular/setup-env/zone",
    require.resolve("jest-preset-angular/setup-env/zone/index.js"),
  ],
]);

const normalizeResolvedPath = (resolved) => {
  if (typeof resolved !== "string") {
    return resolved;
  }

  if (!resolved.endsWith(".d.ts")) {
    return resolved;
  }

  const jsCandidate = resolved.slice(0, -5) + ".js";
  if (fs.existsSync(jsCandidate)) {
    return jsCandidate;
  }

  const mjsCandidate = resolved.slice(0, -5) + ".mjs";
  if (fs.existsSync(mjsCandidate)) {
    return mjsCandidate;
  }

  return resolved;
};

const resolveRelativeFile = (request, basedir) => {
  if (!request || !basedir) {
    return null;
  }

  if (!request.startsWith(".") && !path.isAbsolute(request)) {
    return null;
  }

  const absoluteBase = path.resolve(basedir, request);
  const candidates = [
    absoluteBase,
    `${absoluteBase}.ts`,
    `${absoluteBase}.tsx`,
    `${absoluteBase}.js`,
    `${absoluteBase}.jsx`,
    `${absoluteBase}.mjs`,
    `${absoluteBase}.cjs`,
    `${absoluteBase}.json`,
    path.join(absoluteBase, "index.ts"),
    path.join(absoluteBase, "index.tsx"),
    path.join(absoluteBase, "index.js"),
    path.join(absoluteBase, "index.jsx"),
    path.join(absoluteBase, "index.mjs"),
    path.join(absoluteBase, "index.cjs"),
    path.join(absoluteBase, "index.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
};

const fallbackResolve = (request, basedir) => {
  const relativeResolved = resolveRelativeFile(request, basedir || process.cwd());
  if (relativeResolved) {
    return normalizeResolvedPath(relativeResolved);
  }

  try {
    return normalizeResolvedPath(
      require.resolve(request, { paths: [basedir || process.cwd()] })
    );
  } catch {
    return null;
  }
};

jestResolve.default.findNodeModule = (request, options) => {
  const resolved = normalizeResolvedPath(originalFindNodeModule(request, options));
  if (resolved) {
    return resolved;
  }

  return fallbackResolve(request, options?.basedir) || resolved;
};

jestResolve.default.prototype.resolveModuleFromDirIfExists = function (
  dirname,
  moduleName,
  options
) {
  const resolved = normalizeResolvedPath(
    originalResolveModuleFromDirIfExists.call(this, dirname, moduleName, options)
  );
  return resolved || fallbackResolve(moduleName, dirname);
};

jestResolve.default.prototype.resolveModuleFromDirIfExistsAsync = async function (
  dirname,
  moduleName,
  options
) {
  const resolved = normalizeResolvedPath(
    await originalResolveModuleFromDirIfExistsAsync.call(this, dirname, moduleName, options)
  );
  return resolved || fallbackResolve(moduleName, dirname);
};

jestResolve.default.prototype.resolveModule = function (from, moduleName, options) {
  try {
    return normalizeResolvedPath(
      originalResolveModule.call(this, from, moduleName, options)
    );
  } catch (error) {
    const basedir =
      from && typeof from === "string" ? path.dirname(from) : process.cwd();
    const resolved = fallbackResolve(moduleName, basedir);
    if (resolved) {
      return resolved;
    }
    throw error;
  }
};

jestResolve.default.prototype.resolveModuleAsync = async function (
  from,
  moduleName,
  options
) {
  try {
    return normalizeResolvedPath(
      await originalResolveModuleAsync.call(this, from, moduleName, options)
    );
  } catch (error) {
    const basedir =
      from && typeof from === "string" ? path.dirname(from) : process.cwd();
    const resolved = fallbackResolve(moduleName, basedir);
    if (resolved) {
      return resolved;
    }
    throw error;
  }
};

Module._resolveFilename = function (request, parent, isMain, options) {
  const forced = forcedRuntimeResolutions.get(request);
  if (forced) {
    return forced;
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require("../node_modules/jest/bin/jest");
