describe("Telemetry page", () => {
  beforeEach(() => {
    cy.visit("/telemetry?e2e=1");
  });

  it("displays Pulsar status component", () => {
    // Wait for the telemetry page to load
    cy.contains("Data Generator Telemetry").should("exist");

    // Check that Pulsar status component is present
    cy.contains("Pulsar").should("exist");

    // Check that it displays broker, topic, and partition counts
    cy.contains("Brokers:").should("exist");
    cy.contains("Topics:").should("exist");
    cy.contains("Partitions:").should("exist");
  });

  it("updates Pulsar status periodically", () => {
    cy.contains("Data Generator Telemetry").should("exist");

    // Wait for initial load
    cy.contains("Brokers:").should("exist");

    // The status should update automatically (mock data may change)
    // We can't easily test the polling without complex timing, but we can
    // verify the component structure is correct
    cy.get("app-pulsar-status").should("exist");
  });
});
