import { createCjsPreset } from "jest-preset-angular/presets";

const nxPreset = require("../../jest.preset.js");

export default {
  ...nxPreset,
  ...createCjsPreset({
    diagnostics: false,
    tsconfig: "<rootDir>/libs/ui-theme/tsconfig.spec.json",
  }),
  rootDir: "../..",
  displayName: "ui-theme",
  modulePaths: ["<rootDir>/node_modules"],
  moduleNameMapper: {
    "^source-map$": "<rootDir>/node_modules/source-map/source-map.js",
  },
  roots: ["<rootDir>/libs/ui-theme/src"],
  setupFilesAfterEnv: ["<rootDir>/libs/ui-theme/src/test-setup.ts"],
  testMatch: ["<rootDir>/libs/ui-theme/src/**/*.spec.ts"],
};
