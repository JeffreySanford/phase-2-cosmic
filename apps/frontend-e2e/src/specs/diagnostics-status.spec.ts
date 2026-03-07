describe("Diagnostics page", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/diagnostics", {
      statusCode: 200,
      body: { path: "/tmp/logs", files: ["system-specs.txt"] },
    }).as("diagnosticsIndex");

    cy.intercept("GET", "/api/diagnostics/docker-services", {
      statusCode: 200,
      body: [
        {
          name: "RabbitMQ",
          status: "online",
          details: "127.0.0.1:5672",
          latencyMs: 12,
          icon: "stream",
        },
      ],
    }).as("dockerServices");
  });

  it("should display Pulsar and RabbitMQ status", () => {
    // Intercept the status API calls
    cy.intercept("GET", "/api/v1/pulsar/status", {
      statusCode: 200,
      body: {
        brokers: 3,
        topics: 15,
        partitions: 45,
      },
    }).as("pulsarStatus");

    cy.intercept("GET", "/api/v1/rabbitmq/status", {
      statusCode: 200,
      body: {
        status: "connected",
        connection: "connected",
        queues: {
          "audit-queue": {},
          "control-queue": {},
        },
        exchanges: {
          "audit-exchange": {},
          "control-exchange": {},
        },
      },
    }).as("rabbitMQStatus");

    // Visit the diagnostics page
    cy.visit("/diagnostics");

    // Wait for the status requests to complete
    cy.wait("@diagnosticsIndex");
    cy.wait("@dockerServices");
    cy.wait("@pulsarStatus");
    cy.wait("@rabbitMQStatus");

    cy.contains("[role=\"tab\"]", "Broker Systems").click();
    cy.contains("Pulsar").should("exist");
    cy.contains("Brokers: 3").should("exist");
    cy.contains("Topics: 15").should("exist");
    cy.contains("Partitions: 45").should("exist");

    // Check that RabbitMQ status is displayed
    cy.contains("RabbitMQ").should("exist");
    cy.contains("Status: connected").should("exist");
    cy.contains("Connection: connected").should("exist");
    cy.contains("Queues: 2").should("exist");
    cy.contains("Exchanges: 2").should("exist");
  });

  it("should handle status API errors gracefully", () => {
    // Intercept with error responses
    cy.intercept("GET", "/api/v1/pulsar/status", {
      statusCode: 500,
      body: { error: "Service unavailable" },
    }).as("pulsarStatusError");

    cy.intercept("GET", "/api/v1/rabbitmq/status", {
      statusCode: 500,
      body: { error: "Connection failed" },
    }).as("rabbitMQStatusError");

    // Visit the diagnostics page
    cy.visit("/diagnostics");

    // Wait for the error responses
    cy.wait("@diagnosticsIndex");
    cy.wait("@dockerServices");
    cy.wait("@pulsarStatusError");
    cy.wait("@rabbitMQStatusError");

    cy.contains("[role=\"tab\"]", "Broker Systems").click();
    cy.contains("Pulsar").should("exist");
    cy.contains("Brokers: 0").should("exist");
    cy.contains("Topics: 0").should("exist");
    cy.contains("Partitions: 0").should("exist");

    cy.contains("RabbitMQ").should("exist");
    cy.contains("Status: unavailable").should("exist");
    cy.contains("Connection: error").should("exist");
  });

  it("should refresh status updates after a reload", () => {
    let callCount = 0;

    // Intercept and count calls
    cy.intercept("GET", "/api/v1/pulsar/status", (req) => {
      callCount++;
      req.reply({
        statusCode: 200,
        body: {
          brokers: callCount,
          topics: callCount * 5,
          partitions: callCount * 15,
        },
      });
    }).as("pulsarStatus");

    cy.intercept("GET", "/api/v1/rabbitmq/status", {
      statusCode: 200,
      body: {
        status: "connected",
        connection: "connected",
        queues: { queue1: {} },
        exchanges: { exchange1: {} },
      },
    }).as("rabbitMQStatus");

    // Visit the diagnostics page
    cy.visit("/diagnostics");

    // Wait for initial calls
    cy.wait("@diagnosticsIndex");
    cy.wait("@dockerServices");
    cy.wait("@pulsarStatus");
    cy.wait("@rabbitMQStatus");

    cy.contains("[role=\"tab\"]", "Broker Systems").click();
    cy.contains("Brokers: 1").should("be.visible");

    cy.reload();
    cy.wait("@diagnosticsIndex");
    cy.wait("@dockerServices");
    cy.wait("@pulsarStatus", { timeout: 10000 });
    cy.wrap(null).then(() => {
      expect(callCount).to.equal(2);
    });
  });
});
