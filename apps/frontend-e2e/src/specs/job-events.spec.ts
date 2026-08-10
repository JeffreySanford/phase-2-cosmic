type BrokerEvent = {
  type: string;
  payload: Record<string, unknown>;
};

type FakeEventSourceWindow = Cypress.AUTWindow & {
  __diagnosticsEventSource?: {
    emit: (event: BrokerEvent) => void;
  };
};

describe("Live events on Diagnostics", () => {
  function installFakeEventSource(win: FakeEventSourceWindow): void {
    // Models the parts of EventSource the application actually uses. The stub
    // previously offered only onmessage/close, so a consumer calling
    // addEventListener threw — and because streams are opened from the
    // AppComponent constructor, that surfaced as an application that never
    // bootstrapped rather than as a missing event.
    class FakeEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;
      private readonly listeners = new Map<
        string,
        Set<(event: MessageEvent<string>) => void>
      >();

      constructor(sourceUrl: string) {
        void sourceUrl;
        win.__diagnosticsEventSource = {
          emit: (event: BrokerEvent) => {
            const message = new MessageEvent("message", {
              data: JSON.stringify(event),
            });
            this.onmessage?.(message);
            this.listeners.get("message")?.forEach((listener) => {
              listener(message);
            });
          },
        };
      }

      addEventListener(
        type: string,
        listener: (event: MessageEvent<string>) => void
      ): void {
        const existing = this.listeners.get(type) ?? new Set();
        existing.add(listener);
        this.listeners.set(type, existing);
      }

      removeEventListener(
        type: string,
        listener: (event: MessageEvent<string>) => void
      ): void {
        this.listeners.get(type)?.delete(listener);
      }

      close(): void {
        return;
      }
    }

    win.EventSource = FakeEventSource as unknown as typeof EventSource;
  }

  beforeEach(() => {
    cy.intercept("GET", "/api/diagnostics", {
      statusCode: 200,
      body: { path: "/tmp/logs", files: ["system-specs.txt"] },
    }).as("diagnosticsIndex");

    cy.intercept("GET", "/api/diagnostics/docker-services", {
      statusCode: 200,
      body: [],
    }).as("dockerServices");

    cy.intercept("GET", "/api/v1/pulsar/status", {
      statusCode: 200,
      body: { brokers: 1, topics: 2, partitions: 3, status: "healthy" },
    }).as("pulsarStatus");

    cy.intercept("GET", "/api/v1/rabbitmq/status", {
      statusCode: 200,
      body: { status: "connected", connection: "connected" },
    }).as("rabbitStatus");
  });

  it("shows broker events on the diagnostics live events tab", () => {
    cy.visit("/diagnostics", {
      onBeforeLoad: (win) =>
        installFakeEventSource(win as FakeEventSourceWindow),
    });
    cy.wait("@diagnosticsIndex");
    cy.wait("@dockerServices");
    cy.wait("@pulsarStatus");
    cy.wait("@rabbitStatus");

    cy.window().then((win) => {
      (win as FakeEventSourceWindow).__diagnosticsEventSource?.emit({
        type: "test-event",
        payload: { foo: "bar" },
      });
    });

    cy.contains('[role="tab"]', "Live Events").click();
    cy.contains(".event-json", "test-event").should("exist");
  });

  it("shows a real job lifecycle event in diagnostics", () => {
    const datasetId = `ds-e2e-${Date.now()}`;

    cy.request("POST", "/api/v1/jobs", {
      workflow: "ingest",
      datasetId,
    }).then((resp) => {
      expect([201, 202]).to.include(resp.status);
      const jobId = resp.body.jobId;

      cy.visit("/diagnostics", {
        onBeforeLoad: (win) =>
          installFakeEventSource(win as FakeEventSourceWindow),
      });
      cy.wait("@diagnosticsIndex");
      cy.wait("@dockerServices");
      cy.wait("@pulsarStatus");
      cy.wait("@rabbitStatus");

      cy.window().then((win) => {
        (win as FakeEventSourceWindow).__diagnosticsEventSource?.emit({
          type: "job-transitioned",
          payload: { jobId, state: "COMPLETED" },
        });
      });

      cy.contains('[role="tab"]', "Live Events").click();
      cy.contains(".event-json", jobId, { timeout: 10000 }).should("exist");
      cy.contains(".event-json", "job-transitioned").should("exist");
    });
  });
});
