import { nxE2EPreset } from "@nx/cypress/plugins/cypress-preset";

import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    ...nxE2EPreset(__filename, {
      cypressDir: "src",
      webServerCommands: {
        default:
          'pnpm exec concurrently --kill-others-on-fail --success first "cross-env FRONTEND_PORT=4000 DEV_SERVER_ORIGIN=http://127.0.0.1:4200 pnpm run serve:ssr" "pnpm exec nx run frontend:serve --host=127.0.0.1"',
        production: "cross-env FRONTEND_PORT=4000 pnpm run serve:ssr",
      },
      webServerConfig: {
        timeout: 180000,
      },
      ciWebServerCommand:
        'pnpm exec concurrently --kill-others-on-fail --success first "cross-env FRONTEND_PORT=4000 DEV_SERVER_ORIGIN=http://127.0.0.1:4200 pnpm run serve:ssr" "pnpm exec nx run frontend:serve --host=127.0.0.1"',
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
  },
});
