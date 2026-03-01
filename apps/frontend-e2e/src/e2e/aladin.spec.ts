describe('Aladin Viewer E2E', () => {
  it('loads aladin and attaches viewer', () => {
    cy.visit('/view?e2e=1');

    // wait for the viewer container to appear
    cy.get('#aladin-lite', { timeout: 10000 }).should('exist');

    // wait for the viewer to signal readiness via data attribute
    cy.get('#aladin-lite[data-viewer-ready="true"]', { timeout: 15000 }).should('exist');

    // ensure the global aladin or aladin instance is present when possible
    cy.window().then((win) => {
      // `aladin` may be attached globally by the viewer library
      type WinWithAladin = Window & { aladin?: unknown };
      const hasGlobal = Boolean((win as unknown as WinWithAladin).aladin);
      const hasDom = !!win.document.querySelector('#aladin-lite .aladin');
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(hasGlobal || hasDom).to.be.true;
    });
  });
});
