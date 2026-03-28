const { createCjsPreset } = require("jest-preset-angular/presets");
const preset = createCjsPreset({
  diagnostics: false,
  tsconfig: "<rootDir>/libs/ui-theme/tsconfig.spec.json",
});

module.exports = {
  ...preset,
  rootDir: "../..",
  displayName: "ui-theme",
  modulePaths: ["<rootDir>/node_modules"],
  resolver: "<rootDir>/scripts/jest-custom-resolver.cjs",
  snapshotSerializers: [
    require.resolve("jest-preset-angular/build/serializers/html-comment"),
    require.resolve("jest-preset-angular/build/serializers/ng-snapshot"),
    require.resolve("jest-preset-angular/build/serializers/no-ng-attributes"),
  ],
  transform: {
    "^.+\\.(ts|js|mjs|html|svg)$": [
      require.resolve("jest-preset-angular"),
      preset.transform["^.+\\.(ts|js|mjs|html|svg)$"][1],
    ],
  },
  roots: ["<rootDir>/libs/ui-theme/src"],
  setupFilesAfterEnv: ["<rootDir>/libs/ui-theme/src/test-setup.ts"],
  testMatch: ["<rootDir>/libs/ui-theme/src/**/*.spec.ts"],
};
