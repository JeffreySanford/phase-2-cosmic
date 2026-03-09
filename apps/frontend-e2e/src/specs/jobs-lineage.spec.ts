// cypress e2e spec to verify submitting a job with lineage and viewing it in the UI

describe("Jobs lineage end-to-end", () => {
  it("submits a job with lineage and the lineage is visible in the detail panel", () => {
    const lineage = { parentJobId: "e2e-parent" };
    const payload = {
      workflow: "casa-imaging",
      datasetId: "test-ds",
      lineage: lineage,
      parameters: {},
      requestedBy: "e2e-test",
    };

    // verify public-sources endpoint returns at least one entry
    cy.request("GET", "/api/v1/public-sources").then((ps) => {
      expect(ps.status).to.equal(200);
      expect(ps.body).to.be.an("array").and.have.length.greaterThan(0);
    });

    cy.request("POST", "/api/v1/jobs", payload).then((resp) => {
      expect(resp.status).to.equal(201);
      const jobId = resp.body.jobId;
      const jobRecord = {
        jobId,
        workflow: payload.workflow,
        datasetId: payload.datasetId,
        status: "QUEUED",
        requestedBy: payload.requestedBy,
        lineage: payload.lineage,
        parameters: payload.parameters,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      cy.intercept("GET", "/api/v1/jobs*", {
        statusCode: 200,
        body: [jobRecord],
      }).as("listJobs");

      // navigate to jobs page and ensure our job appears
      cy.visit("/jobs");
      cy.wait("@listJobs");
      cy.contains(".job-card", jobId, { timeout: 10000 }).should("exist");

      cy.contains(".job-card", jobId).contains("button", "Details").click();
      cy.get("mat-tab-group").should("exist");

      cy.contains("Lineage").click();
      cy.get('app-jobs-lineage-editor input[placeholder="key"]')
        .first()
        .should("have.value", "parentJobId");
      cy.get('app-jobs-lineage-editor input[placeholder="value"]')
        .first()
        .should("have.value", "e2e-parent");
    });
  });
});
