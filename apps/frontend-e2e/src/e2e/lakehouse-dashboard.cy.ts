describe("Lakehouse dashboard proof slice", () => {
  beforeEach(() => {
    cy.visit("/dashboard");
  });

  it("shows the Lakehouse panel with proof-slice evidence", () => {
    cy.get("mat-tab-group").contains("Operations").click({ force: true });
    cy.contains("Lakehouse", { timeout: 20000 }).scrollIntoView();
    cy.contains("Lakehouse", { timeout: 20000 }).should("be.visible");
    cy.get(".lakehouse-panel", { timeout: 20000 }).should(
      "contain.text",
      "Proof boundary:"
    );
    cy.get(".lakehouse-panel", { timeout: 20000 }).should(
      "contain.text",
      "Evidence state:"
    );
    cy.get(".lakehouse-panel", { timeout: 20000 }).should(
      "contain.text",
      "Readiness boundary:"
    );
    cy.get(".lakehouse-panel", { timeout: 20000 }).should(
      "contain.text",
      "evidence:"
    );
  });
});
