describe("Job events component", () => {
  it("should appear on dashboard and display pushed events", () => {
    cy.visit("/dashboard");

    // verify component exists
    cy.get("app-job-events").should("exist");

    // emit a fake broker event via exposed helper
    const event = { type: "test-event", payload: { foo: "bar" } };
    cy.window().then((win) => {
      if (win.__emitBrokerEvent) {
        win.__emitBrokerEvent(event);
      } else {
        throw new Error("SSE helper not available");
      }
    });

    // resulting JSON should appear in the events panel
    cy.get(".job-events p").first().should("contain.text", "test-event");
  });

  it("should show events for a real job lifecycle", () => {
    cy.visit("/dashboard");
    cy.get("app-job-events").should("exist");

    // create a job via API
    cy.request("POST", "/api/v1/jobs", {
      workflow: "ingest",
      datasetId: "ds-e2e-" + Date.now(),
    }).then((resp) => {
      expect(resp.status).to.eq(201);
      const jobId = resp.body.jobId;

      // transition to RUNNING then COMPLETED
      cy.request("POST", `/api/v1/jobs/${jobId}/transition`, {
        newState: "RUNNING",
      });
      cy.request("POST", `/api/v1/jobs/${jobId}/transition`, {
        newState: "COMPLETED",
      });

      cy.window().then((win) => {
        win.__emitBrokerEvent?.({
          type: "job-transitioned",
          payload: { jobId, state: "COMPLETED" },
        });
      });

      cy.contains(".job-events p", jobId, { timeout: 10000 }).should("exist");
    });
  });
});
