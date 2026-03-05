const cypress = require("eslint-plugin-cypress/flat");
const baseConfig = require("../../eslint.config.js");

module.exports = [
  ...baseConfig,
  cypress.configs["recommended"],
  {
    // Override or add rules here
    rules: {},
  },
];
