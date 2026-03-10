const nx = require("@nx/eslint-plugin");
const baseConfig = require("../../eslint.config.js");

module.exports = [
  ...baseConfig,
  ...nx.configs["flat/angular"],
  ...nx.configs["flat/angular-template"],
  {
    files: ["**/*.ts"],
    rules: {
      "@nx/enforce-module-boundaries": "off",
      // Project uses NgModule architecture; standalone: false is intentional
      "@angular-eslint/prefer-standalone": "off",
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "lib",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "lib",
          style: "kebab-case",
        },
      ],
    },
  },
  {
    files: ["**/*.html"],
    // Override or add rules here
    rules: {},
  },
];
