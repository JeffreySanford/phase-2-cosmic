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
      webServerConfig: {
        timeout: 180000,
      },
      ciWebServerCommand: 'pnpm exec nx run frontend:serve-static',
      ciBaseUrl: 'http://localhost:4200',
    }),
    // Disable TypeScript support file to avoid preprocessor issues in this environment
    // If you need custom commands, use the JS support file at src/support/e2e.js
    supportFile: false,
    // Ensure Cypress looks for specs in this app's e2e folder
    specPattern: [
      'apps/frontend-e2e/src/**/*.cy.{js,jsx,ts,tsx}',
      'apps/frontend-e2e/src/specs/**/*.spec.{js,jsx,ts,tsx}'
    ],
    baseUrl: 'http://localhost:4200',
  },
});
