const cypress = require("eslint-plugin-cypress/flat");
const baseConfig = require("../../eslint.config.js");

module.exports = [
  ...baseConfig,
  cypress.configs["recommended"],
  {
    rules: {
      "@nx/enforce-module-boundaries": "off",
    },
  },
];
