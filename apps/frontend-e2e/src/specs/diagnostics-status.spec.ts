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

    // intercept the SSE broker events stream; send a simple heartbeat and connected
    cy.intercept(
      {
        method: "GET",
        url: "/api/v1/broker-events",
      },
      (req) => {
        req.reply((res) => {
          res.setHeader("Content-Type", "text/event-stream");
          // send a minimal SSE payload: `data: {...}\n\n`
          res.send('data: {"type":"connected","payload":{}}\n\n');
          // keep connection open by not ending
        });
      }
    ).as("brokerEvents");

    // Visit the diagnostics page
    cy.visit("/diagnostics");

    // Wait for the status requests to complete
    cy.wait("@diagnosticsIndex");
    cy.wait("@dockerServices");
    cy.wait("@pulsarStatus");
    cy.wait("@rabbitMQStatus");

    cy.contains('[role="tab"]', "Broker Systems").click();
    cy.contains("Pulsar").should("exist");
    cy.contains("app-pulsar-status .stat-row", "Brokers").should(
      "contain.text",
      "3"
    );
    cy.contains("app-pulsar-status .stat-row", "Topics").should(
      "contain.text",
      "15"
    );
    cy.contains("app-pulsar-status .stat-row", "Partitions").should(
      "contain.text",
      "45"
    );

    // Check that RabbitMQ status is displayed
    cy.contains("RabbitMQ").should("exist");
    cy.get("app-rabbitmq-status .tile-status").should(
      "contain.text",
      "connected"
    );
    cy.contains("app-rabbitmq-status .stat-row", "Connection").should(
      "contain.text",
      "connected"
    );
    cy.contains("app-rabbitmq-status .stat-row", "Queues").should(
      "contain.text",
      "2"
    );
    cy.contains("app-rabbitmq-status .stat-row", "Exchanges").should(
      "contain.text",
      "2"
    );
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

    cy.contains('[role="tab"]', "Broker Systems").click();
    cy.contains("Pulsar").should("exist");
    cy.contains("app-pulsar-status .stat-row", "Brokers").should(
      "contain.text",
      "0"
    );
    cy.contains("app-pulsar-status .stat-row", "Topics").should(
      "contain.text",
      "0"
    );
    cy.contains("app-pulsar-status .stat-row", "Partitions").should(
      "contain.text",
      "0"
    );

    cy.contains("RabbitMQ").should("exist");
    cy.get("app-rabbitmq-status .tile-status").should(
      "contain.text",
      "unavailable"
    );
    cy.contains("app-rabbitmq-status .stat-row", "Connection").should(
      "contain.text",
      "error"
    );
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

    cy.contains('[role="tab"]', "Broker Systems").click();
    cy.contains("app-pulsar-status .stat-row", "Brokers").should(
      "contain.text",
      "1"
    );

    cy.reload();
    cy.wait("@diagnosticsIndex");
    cy.wait("@dockerServices");
    cy.wait("@pulsarStatus", { timeout: 10000 });
    cy.wrap(null).then(() => {
      expect(callCount).to.equal(2);
    });
  });
});
