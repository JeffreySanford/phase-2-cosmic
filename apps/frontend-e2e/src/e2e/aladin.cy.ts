describe("Aladin Viewer (Cypress)", () => {
  it("attempts to initialize Aladin", () => {
    cy.visit("/view?e2e=1");

    // loader should appear inside the viewer container immediately
    cy.get("#aladin-lite .loading", { timeout: 5000 }).should("exist");

    // wait for element to be attached the same way as before
    cy.get("#aladin-lite", { timeout: 15000 }).should("exist");

    // wait for the viewer to signal readiness via data attribute
    cy.get('#aladin-lite[data-viewer-ready="true"]', { timeout: 15000 }).should(
      "exist"
    );

    // assert that the container is occupying most of the mainstage height
    cy.get("#aladin-lite").then(($el) => {
      const rect = $el[0].getBoundingClientRect();
      // expect height to be at least 80% of its parent
      const parentRect = $el[0].parentElement?.getBoundingClientRect();
      if (parentRect) {
        expect(rect.height).to.be.greaterThan(parentRect.height * 0.8);
      }
    });

    // ensure loader remains inside while the sidebar toggles (should disappear once ready)
    cy.get("app-header .menu-btn").click();
    cy.get("#aladin-lite .loading").should("not.exist");

    // viewer-root should not have any negative top margin (no hacks allowed)
    cy.get(".viewer-root").should("have.css", "margin-top", "0px");
  });
});
