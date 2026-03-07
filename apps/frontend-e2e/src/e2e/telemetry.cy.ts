describe("Telemetry page", () => {
  beforeEach(() => {
    cy.visit("/telemetry?e2e=1");
  });

  it("displays Pulsar status component", () => {
    cy.contains("Data Generator Telemetry").should("exist");
    cy.contains("mat-panel-title", "Pulsar").should("exist");
    cy.contains("mat-expansion-panel-header", "Pulsar").click();
    cy.contains("Brokers:").should("exist");
    cy.contains("Topics:").should("exist");
    cy.contains("Partitions:").should("exist");
  });

  it("updates Pulsar status periodically", () => {
    cy.contains("Data Generator Telemetry").should("exist");
    cy.get("mat-expansion-panel").should("have.length.greaterThan", 1);
    cy.contains("mat-panel-title", "Pulsar").should("contain.text", "Brokers:");
  });
});
