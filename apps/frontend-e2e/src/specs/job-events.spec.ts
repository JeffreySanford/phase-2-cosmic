describe("Job events component", () => {
  it("should appear on dashboard and display pushed events", () => {
    cy.visit("/dashboard");

    cy.get("app-job-events").should("exist");

    const event = { type: "test-event", payload: { foo: "bar" } };
    cy.window().then((win) => {
      if (win.__emitBrokerEvent) {
        win.__emitBrokerEvent(event);
      } else {
        throw new Error("SSE helper not available");
      }
    });

    cy.contains(".job-events", "test-event", { timeout: 10000 }).should(
      "exist"
    );
  });

  it("should show a job lifecycle sequence in the events panel", () => {
    cy.visit("/dashboard");
    cy.get("app-job-events").should("exist");

    const jobId = `e2e-job-${Date.now()}`;
    cy.window().then((win) => {
      if (!win.__emitBrokerEvent) {
        throw new Error("SSE helper not available");
      }

      win.__emitBrokerEvent({
        type: "job-state-changed",
        payload: { jobId, state: "RUNNING" },
      });
      win.__emitBrokerEvent({
        type: "job-state-changed",
        payload: { jobId, state: "COMPLETED" },
      });
    });

    cy.contains(".job-events", jobId, { timeout: 10000 }).should("exist");
    cy.contains(".job-events", "COMPLETED", { timeout: 10000 }).should(
      "exist"
    );
  });
});
