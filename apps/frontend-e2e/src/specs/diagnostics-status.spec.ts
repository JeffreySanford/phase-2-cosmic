describe("Diagnostics page", () => {
  it("should display Pulsar and RabbitMQ status", () => {
    // Intercept the status API calls
    cy.intercept("GET", "/api/v1/pulsar/status", {
      statusCode: 200,
      body: {
        brokers: 3,
        topics: 15,
        partitions: 45
      }
    }).as("pulsarStatus");

    cy.intercept("GET", "/api/v1/rabbitmq/status", {
      statusCode: 200,
      body: {
        status: "connected",
        connection: "connected",
        queues: {
          "audit-queue": {},
          "control-queue": {}
        },
        exchanges: {
          "audit-exchange": {},
          "control-exchange": {}
        }
      }
    }).as("rabbitMQStatus");

    // Visit the diagnostics page
    cy.visit("/diagnostics");

    // Wait for the status requests to complete
    cy.wait("@pulsarStatus");
    cy.wait("@rabbitMQStatus");

    // Check that Pulsar status is displayed
    cy.contains("Pulsar Status").should("be.visible");
    cy.contains("Brokers: 3").should("be.visible");
    cy.contains("Topics: 15").should("be.visible");
    cy.contains("Partitions: 45").should("be.visible");

    // Check that RabbitMQ status is displayed
    cy.contains("RabbitMQ").should("be.visible");
    cy.contains("Status: connected").should("be.visible");
    cy.contains("Connection: connected").should("be.visible");
    cy.contains("Queues: 2").should("be.visible");
    cy.contains("Exchanges: 2").should("be.visible");
  });

  it("should handle status API errors gracefully", () => {
    // Intercept with error responses
    cy.intercept("GET", "/api/v1/pulsar/status", {
      statusCode: 500,
      body: { error: "Service unavailable" }
    }).as("pulsarStatusError");

    cy.intercept("GET", "/api/v1/rabbitmq/status", {
      statusCode: 500,
      body: { error: "Connection failed" }
    }).as("rabbitMQStatusError");

    // Visit the diagnostics page
    cy.visit("/diagnostics");

    // Wait for the error responses
    cy.wait("@pulsarStatusError");
    cy.wait("@rabbitMQStatusError");

    // Check that error states are displayed appropriately
    cy.contains("Pulsar Status").should("be.visible");
    cy.contains("Brokers: 0").should("be.visible");
    cy.contains("Topics: 0").should("be.visible");
    cy.contains("Partitions: 0").should("be.visible");

    cy.contains("RabbitMQ").should("be.visible");
    cy.contains("Status: unavailable").should("be.visible");
    cy.contains("Connection: error").should("be.visible");
  });

  it("should poll status updates", () => {
    let callCount = 0;

    // Intercept and count calls
    cy.intercept("GET", "/api/v1/pulsar/status", (req) => {
      callCount++;
      req.reply({
        statusCode: 200,
        body: {
          brokers: callCount,
          topics: callCount * 5,
          partitions: callCount * 15
        }
      });
    }).as("pulsarStatus");

    cy.intercept("GET", "/api/v1/rabbitmq/status", {
      statusCode: 200,
      body: {
        status: "connected",
        connection: "connected",
        queues: { "queue1": {} },
        exchanges: { "exchange1": {} }
      }
    }).as("rabbitMQStatus");

    // Visit the diagnostics page
    cy.visit("/diagnostics");

    // Wait for initial calls
    cy.wait("@pulsarStatus");
    cy.wait("@rabbitMQStatus");

    // Check initial values
    cy.contains("Brokers: 1").should("be.visible");

    // Wait for polling to update
    cy.wait("@pulsarStatus", { timeout: 10000 });
    cy.contains("Brokers: 2").should("be.visible");
  });
});