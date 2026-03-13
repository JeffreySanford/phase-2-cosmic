import { nxE2EPreset } from "@nx/cypress/plugins/cypress-preset";

import { defineConfig } from "cypress";

const e2eBackendPort = process.env.FRONTEND_PORT ?? "4100";
const e2eProxyServeCommand = `cross-env FRONTEND_PORT=${e2eBackendPort} pnpm exec nx run frontend:serve --host=127.0.0.1`;
const e2eSsrServeCommand = `cross-env FRONTEND_PORT=${e2eBackendPort} DEV_SERVER_ORIGIN=http://127.0.0.1:4200 DISABLE_NEST_VITE_DEV_SERVER=true DISABLE_REDIS_CLIENT=true USE_EMBEDDED_E2E_BACKEND=true pnpm run serve:ssr`;
const e2eConcurrentCommand = `pnpm exec concurrently --kill-others-on-fail --success first "${e2eSsrServeCommand}" "${e2eProxyServeCommand}"`;

export default defineConfig({
  e2e: {
    ...nxE2EPreset(__filename, {
      cypressDir: "src",
      webServerCommands: {
        default: e2eConcurrentCommand,
        production: `cross-env FRONTEND_PORT=${e2eBackendPort} pnpm run serve:ssr`,
      },
      webServerConfig: {
        timeout: 180000,
      },
      ciWebServerCommand: e2eConcurrentCommand,
      ciBaseUrl: "http://127.0.0.1:4200",
    }),
    // Support file for custom commands
    supportFile: "src/support/e2e.ts",
    // Ensure Cypress looks for specs in this app's e2e folder
    specPattern: [
      "src/**/*.cy.{js,jsx,ts,tsx}",
      "src/specs/**/*.spec.{js,jsx,ts,tsx}",
    ],
    baseUrl: "http://127.0.0.1:4200",
    video: false,
    trashAssetsBeforeRuns: true,
    defaultCommandTimeout: 10000,
    pageLoadTimeout: 60000,
    env: {
      // disable internal cypress caching that sometimes causes stale state in CI
      cacheAcrossSpecs: false,
    },
    // Please ensure you use `cy.origin()` when navigating between domains and remove this option.
    // See https://docs.cypress.io/app/references/migration-guide#Changes-to-cyorigin
    injectDocumentDomain: true,
  },
});
