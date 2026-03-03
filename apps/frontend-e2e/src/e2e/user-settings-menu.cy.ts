describe('user settings menu', () => {
  beforeEach(() => cy.visit('/landing'));

  it('opens settings modal from user menu', () => {
    cy.get('app-header .user-btn').click();
    cy.contains('.user-menu-item', 'Settings').click();
    cy.contains('h2', 'Operator Settings').should('be.visible');
    cy.contains('button', 'Save').scrollIntoView().should('be.visible');
  });

  it('keeps visualizations entry in user menu', () => {
    cy.get('app-header .user-btn').click();
    cy.contains('.user-menu-item', 'Visualizations').should('be.visible');
  });
});
