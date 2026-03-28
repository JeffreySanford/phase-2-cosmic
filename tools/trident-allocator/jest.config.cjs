module.exports = {
  rootDir: "../..",
  testEnvironment: "node",
  testRunner: "jest-circus/runner",
  modulePaths: ["<rootDir>/node_modules"],
  roots: ["<rootDir>/tools/trident-allocator"],
  testMatch: ["<rootDir>/tools/trident-allocator/**/allocator.test.js"],
};
