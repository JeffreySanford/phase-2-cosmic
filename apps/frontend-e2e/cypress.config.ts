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
    // Load the project's support file (registers custom commands like `cy.login`)
    supportFile: 'src/support/e2e.ts',
    // Ensure Cypress looks for specs in the app e2e folder
    specPattern: [
      'src/**/*.cy.{js,jsx,ts,tsx}',
      'src/specs/**/*.spec.{js,jsx,ts,tsx}'
    ],
    baseUrl: 'http://localhost:4200',
  },
});
