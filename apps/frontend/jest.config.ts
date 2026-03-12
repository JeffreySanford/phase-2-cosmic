import { createCjsPreset } from "jest-preset-angular/presets";

const nxPreset = require("../../jest.preset.js");

export default {
  ...nxPreset,
  ...createCjsPreset({
    diagnostics: false,
    tsconfig: "<rootDir>/apps/frontend/tsconfig.spec.json",
  }),
  // explicitly declare runner to work around direct jest invocation
  testRunner: "jest-circus/runner",
  rootDir: "../..",
  displayName: "frontend",
  modulePaths: ["<rootDir>/node_modules"],
  moduleNameMapper: {
    "^source-map$": "<rootDir>/node_modules/source-map/source-map.js",
  },
  roots: ["<rootDir>/apps/frontend/src"],
  setupFilesAfterEnv: ["<rootDir>/apps/frontend/src/test-setup.ts"],
  testMatch: ["<rootDir>/apps/frontend/src/**/*.spec.ts"],
};
