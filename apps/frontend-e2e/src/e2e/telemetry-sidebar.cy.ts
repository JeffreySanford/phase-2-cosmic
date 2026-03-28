describe("Telemetry sidebar WebSocket stream", () => {
  it("receives events from the embedded telemetry stream", () => {
    cy.visit("about:blank");

    cy.window().then((win) => {
      const stream = new win.EventSource("/api/telemetry/stream");

      const firstTelemetryEvent = new Cypress.Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const timeout = win.setTimeout(() => {
            stream.close();
            reject(new Error("timed_out_waiting_for_telemetry_event"));
          }, 5000);

          stream.addEventListener("telemetry", (evt) => {
            try {
              win.clearTimeout(timeout);
              resolve(JSON.parse(evt.data) as Record<string, unknown>);
            } catch (error) {
              reject(error);
            }
          });
        }
      );

      cy.wrap(firstTelemetryEvent).should((payload) => {
        expect(payload).to.have.property("runtimeLoadProfile");
      });

      cy.then(() => {
        stream.close();
      });
    });
  });

  it("drives the topology node pulses via embedded mock events", () => {
    cy.visit("/topology");

    // Ensure the topology graph renders
    cy.get(".topology-graph svg", { timeout: 20000 }).should("exist");

    // The mock telemetry server emits events quickly; ensure at least one node pulse happens
    cy.get("body", { timeout: 15000 }).should(() => {
      const hasPulse = Cypress.$(".node-core--pulse").length > 0;
      expect(hasPulse).to.equal(true);
    });
  });

  it("can consume broker-like events from the embedded SSE endpoint", () => {
    cy.visit("about:blank");

    cy.window().then((win) => {
      const stream = new win.EventSource("/api/v1/broker-events");

      const firstBrokerEvent = new Cypress.Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const timeout = win.setTimeout(() => {
            stream.close();
            reject(new Error("timed_out_waiting_for_broker_event"));
          }, 5000);

          stream.onmessage = (evt) => {
            try {
              win.clearTimeout(timeout);
              resolve(JSON.parse(evt.data) as Record<string, unknown>);
            } catch (error) {
              reject(error);
            }
          };
        }
      );

      cy.wrap(firstBrokerEvent).should((payload) => {
        expect(Object.keys(payload).length).to.be.greaterThan(0);
      });

      cy.then(() => {
        stream.close();
      });
    });
  });
});
