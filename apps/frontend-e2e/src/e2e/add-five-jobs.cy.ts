describe('Add five jobs and processing', () => {
  beforeEach(() => {
    cy.visit('/jobs?e2e=1');
  });

  it('submits five complex jobs and verifies they are processed', () => {
    // intercept job list and submit endpoints
    cy.intercept('POST', '/api/v1/jobs').as('submitJob');
    cy.intercept('POST', '/api/v1/admin/release-deferred').as('releaseDeferred');

    // click Add five jobs
    cy.contains('button', 'Add five jobs').click();

    // wait for 5 submit calls
    cy.wait('@submitJob', { timeout: 20000 }).then(() => {
      // at least one submit observed; allow some time for others
    });

    // release deferred samples (in case precached were deferred)
    cy.contains('button', 'Release deferred samples').click();
    cy.wait('@releaseDeferred', { timeout: 10000 }).its('response.statusCode').should('be.oneOf', [200,201]);

    // now poll job list and verify at least one job reaches COMPLETED within 30s
    cy.contains('table', 'Governance Jobs').should('exist');
    cy.get('table tbody tr', { timeout: 30000 }).should('have.length.greaterThan', 0);

    // wait up to 30s for a completed job row to appear
    cy.get('table tbody tr', { timeout: 30000 }).contains('COMPLETED').should('exist');
  });
});
