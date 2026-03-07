describe("Diagnostics page", () => {
  it("should display broker systems status", () => {
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

    cy.intercept("GET", "/api/diagnostics/docker-services", {
      statusCode: 200,
      body: [
        {
          name: "RabbitMQ",
          status: "healthy",
          details: "AMQP ready",
          latencyMs: 12,
        },
        {
          name: "Kafka",
          status: "healthy",
          details: "Broker available",
          latencyMs: 18,
        },
      ],
    }).as("dockerServices");

    cy.visit("/diagnostics");
    cy.contains('[role="tab"]', "Broker Systems").click();

    cy.wait("@dockerServices");
    cy.wait("@pulsarStatus");
    cy.wait("@rabbitMQStatus");

    cy.contains("Broker & Service Status").should("be.visible");
    cy.contains(".tile-title", "RabbitMQ").should("exist");
    cy.contains(".tile-status", "healthy").should("exist");
    cy.contains(".tile-body", "AMQP ready").should("exist");

    cy.get("app-pulsar-status").should("contain.text", "Pulsar");
    cy.get("app-pulsar-status").should("contain.text", "Brokers: 3");
    cy.get("app-pulsar-status").should("contain.text", "Topics: 15");
    cy.get("app-pulsar-status").should("contain.text", "Partitions: 45");
  });

  it("should handle status API errors gracefully", () => {
    cy.intercept("GET", "/api/v1/pulsar/status", {
      statusCode: 500,
      body: { error: "Service unavailable" },
    }).as("pulsarStatusError");

    cy.intercept("GET", "/api/v1/rabbitmq/status", {
      statusCode: 500,
      body: { error: "Connection failed" },
    }).as("rabbitMQStatusError");

    cy.intercept("GET", "/api/diagnostics/docker-services", {
      statusCode: 200,
      body: [],
    }).as("dockerServices");

    cy.visit("/diagnostics");
    cy.contains('[role="tab"]', "Broker Systems").click();

    cy.wait("@dockerServices");
    cy.wait("@pulsarStatusError");
    cy.wait("@rabbitMQStatusError");

    cy.contains("Broker & Service Status").should("be.visible");
    cy.get("app-pulsar-status").should("contain.text", "Pulsar");
    cy.get("app-pulsar-status").should("contain.text", "Brokers: 0");
    cy.get("app-pulsar-status").should("contain.text", "Topics: 0");
    cy.get("app-pulsar-status").should("contain.text", "Partitions: 0");
  });

});
