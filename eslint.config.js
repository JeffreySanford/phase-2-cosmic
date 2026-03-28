const nx = require("@nx/eslint-plugin");

module.exports = [
  ...nx.configs["flat/base"],
  ...nx.configs["flat/typescript"],
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: true,
          allow: ["^.*/eslint(\\.base)?\\.config\\.[cm]?js$"],
          depConstraints: [
            {
              sourceTag: "*",
              onlyDependOnLibsWithTags: ["*"],
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // disabling to avoid lint crash on inline Angular templates
      "@typescript-eslint/ban-ts-comment": "off",
      // project uses NgModule architecture; standalone: false is required
      "@angular-eslint/prefer-standalone": "off",
    },
  },
  {
    files: ["apps/cosmic-forge-api/src/**/*.ts"],
    rules: {
      // This backend app is a standalone Nest service under apps/.
      // Nx module-boundary checks are useful for workspace imports, but in this
      // project they incorrectly classify npm imports such as @nestjs/common.
      "@nx/enforce-module-boundaries": "off",
    },
  },
  {
    files: ["apps/cosmic-forge-worker/src/**/*.ts"],
    rules: {
      // Same issue as the Forge API app: this standalone backend app imports npm
      // packages directly and should not be blocked by the workspace boundary rule.
      "@nx/enforce-module-boundaries": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.jsx"],
    rules: {},
  },
  {
    // disable problematic rule for HTML templates (including inline-generated)
    files: ["**/*.html"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
];
