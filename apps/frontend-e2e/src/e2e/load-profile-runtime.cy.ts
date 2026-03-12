describe("load profile runtime control", () => {
  beforeEach(() => {
    // visit landing in mock mode via query param (sets data source in app)
    cy.visit("/landing?mode=mock");
    cy.contains("span.label", "Mode: Mock Data").should("exist");
    cy.contains("Mode: baseline").should("exist");
  });

  it("updates footer profile and mode after selection", () => {
    cy.contains("Mode: baseline").should("exist");
    cy.get("button.profile-trigger").contains("10%");

    cy.get("button.profile-trigger").click({ force: true });
    cy.contains(".profile-menu-item", "50%").click({ force: true });

    cy.get("button.profile-trigger").contains("50%");
    cy.contains("Mode: runtime-controlled").should("exist");
  });
});
