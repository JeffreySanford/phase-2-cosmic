describe("Telemetry page", () => {
  beforeEach(() => {
    cy.visit("/telemetry?e2e=1");
  });

  it("displays the pipeline telemetry overview", () => {
    cy.contains("Pipeline Telemetry").should("exist");
    cy.contains("Evidence state:").should("exist");
    cy.contains("Configured target").should("exist");
    cy.contains("Actual generator output").should("exist");
    cy.contains("Target attainment").should("exist");
  });

  it("shows infrastructure proof values without synthetic substitution", () => {
    cy.contains("Pipeline Telemetry").should("exist");
    cy.contains("mat-tab-header", "Overview").should("exist");
    cy.contains("Actual generator output")
      .parent()
      .should("contain.text", "Unavailable");
    cy.contains("Kafka consumer lag")
      .parent()
      .should("contain.text", "Unavailable");
  });
});
