describe("frontend-e2e", () => {
  beforeEach(() => cy.visit("/"));

  it("should display welcome message", () => {
    // Custom command example, see `../support/commands.ts` file
    cy.login("my-email@something.com", "myPassword");

    // Check landing hero heading
    cy.get("h1").contains(/Mission control/i);
  });

  it("layout: header, sidebar, mainstage present and sidebar toggles", () => {
    cy.get("app-header").should("exist");
    cy.get(".app-sidebar").should("exist");
    cy.get("app-mainstage").should("exist");
    // ensure header padding prevents overflow on the right
    cy.get("app-header").then(($hdr) => {
      const rect = $hdr[0].getBoundingClientRect();
      expect(rect.right).to.be.lte(Cypress.config("viewportWidth"));
      // icon should be at least 0.25em from edge
      const userBtn = $hdr[0].querySelector(".user-btn");
      if (userBtn) {
        const ubRect = (userBtn as HTMLElement).getBoundingClientRect();
        expect(
          Cypress.config("viewportWidth") - ubRect.right
        ).to.be.greaterThan(2); // ~0.25em
      }
    });
    // toggle sidebar
    cy.get("app-header .menu-btn").click();
    cy.get(".app-sidebar").should("have.class", "collapsed");
    // open again
    cy.get("app-header .menu-btn").click();
    cy.get(".app-sidebar").should("not.have.class", "collapsed");
  });
});
