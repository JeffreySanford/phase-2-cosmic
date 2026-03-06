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
