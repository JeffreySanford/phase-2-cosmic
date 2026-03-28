const path = require("path");

module.exports = (request, options) => {
  if (request === "source-map") {
    return path.join(options.rootDir, "node_modules", "source-map", "source-map.js");
  }

  if (request === "jest-preset-angular/setup-env/zone") {
    return path.join(
      options.rootDir,
      "node_modules",
      "jest-preset-angular",
      "setup-env",
      "zone",
      "index.js"
    );
  }

  return options.defaultResolver(request, options);
};
