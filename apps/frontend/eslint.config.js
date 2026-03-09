const nx = require("@nx/eslint-plugin");
const baseConfig = require("../../eslint.config.js");

module.exports = [
  ...baseConfig,
  ...nx.configs["flat/angular"],
  {
    files: ["**/*.ts"],
    rules: {
      "@nx/enforce-module-boundaries": "off",
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
    },
  },
  {
    files: ["**/*.html"],
    languageOptions: {
      parser: require("@angular-eslint/template-parser"),
    },
    plugins: {
      "@angular-eslint/template": require("@angular-eslint/eslint-plugin-template"),
    },
    rules: {
      // Add template-specific rules as needed. Example:
      "@angular-eslint/template/no-negated-async": "error",
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }],
    },
  },
];
