import { nxE2EPreset } from '@nx/cypress/plugins/cypress-preset';

import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    ...nxE2EPreset(__filename, {
      cypressDir: 'src',
      webServerCommands: {
        default: 'pnpm exec nx run frontend:serve',
        production: 'pnpm exec nx run frontend:serve-static',
      },
      ciWebServerCommand: 'pnpm exec nx run frontend:serve-static',
      ciBaseUrl: 'http://localhost:4200',
    }),
    // If loading the support file fails in some environments, disable it for now
    supportFile: false,
    // Ensure Cypress looks for specs in the app e2e folder
    specPattern: [
      'apps/frontend-e2e/src/**/*.cy.{js,jsx,ts,tsx}',
      'apps/frontend-e2e/src/**/*.spec.{js,jsx,ts,tsx}'
    ],
    baseUrl: 'http://localhost:4200',
  },
});
