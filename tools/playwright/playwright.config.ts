import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5000 },
  webServer: {
    command:
      'pnpm exec concurrently --kill-others-on-fail "pnpm exec cross-env FRONTEND_PORT=4100 DEV_SERVER_ORIGIN=http://127.0.0.1:4200 DISABLE_NEST_VITE_DEV_SERVER=true DISABLE_REDIS_CLIENT=true USE_EMBEDDED_E2E_BACKEND=true pnpm run serve:ssr:e2e" "pnpm exec cross-env FRONTEND_PORT=4100 pnpm exec nx run frontend:serve --host=127.0.0.1"',
    cwd: "../..",
    url: "http://127.0.0.1:4200",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4200",
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  reporter: [["html", { outputFolder: "playwright-report" }]],
});
