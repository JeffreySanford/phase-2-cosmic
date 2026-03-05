import { nxE2EPreset } from "@nx/cypress/plugins/cypress-preset";

import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    ...nxE2EPreset(__filename, {
      cypressDir: "src",
      webServerCommands: {
        default: "pnpm exec nx run frontend:serve",
        production: "pnpm exec nx run frontend:serve-static",
      },
      webServerConfig: {
        timeout: 180000,
      },
      ciWebServerCommand: "pnpm exec nx run frontend:serve-static",
      ciBaseUrl: "http://localhost:4200",
    }),
    // Support file for custom commands
    supportFile: "src/support/e2e.ts",
    // Ensure Cypress looks for specs in this app's e2e folder
    specPattern: [
      "src/**/*.cy.{js,jsx,ts,tsx}",
      "src/specs/**/*.spec.{js,jsx,ts,tsx}",
    ],
    baseUrl: "http://localhost:4200",
  },
});
