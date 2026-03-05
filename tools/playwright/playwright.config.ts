import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5000 },
  use: {
    baseURL: "http://localhost:4200",
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  reporter: [["html", { outputFolder: "playwright-report" }]],
});
