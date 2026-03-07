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

    // create job via direct API call
    cy.request("POST", "/api/v1/jobs", payload).then((resp) => {
      expect(resp.status).to.equal(202);
      const jobId = resp.body.jobId;
      const queuedAt = new Date().toISOString();
      const jobRecord = {
        jobId,
        workflow: payload.workflow,
        datasetId: payload.datasetId,
        status: "QUEUED",
        createdAt: queuedAt,
        updatedAt: queuedAt,
        parameters: payload.parameters,
        lineage: payload.lineage,
        requestedBy: payload.requestedBy,
      };

      cy.intercept("GET", "/api/v1/jobs", {
        statusCode: 200,
        body: [jobRecord],
      }).as("listJobs");
      cy.intercept("GET", `/api/v1/jobs/${jobId}`, {
        statusCode: 200,
        body: jobRecord,
      }).as("getJob");
      cy.intercept("GET", `/api/v1/jobs/${jobId}/logs`, {
        statusCode: 200,
        body: [],
      }).as("jobLogs");
      cy.intercept("GET", `/api/v1/jobs/${jobId}/artifacts`, {
        statusCode: 200,
        body: [],
      }).as("jobArtifacts");

      // navigate to jobs page and ensure our job appears
      cy.visit("/jobs");
      cy.wait("@listJobs");
      cy.contains(jobId, { timeout: 15000 }).should("exist");

      // open detail view for the job
      cy.contains("table tbody tr", jobId).within(() => {
        cy.contains("button", "View").click();
      });
      cy.wait("@getJob");
      cy.wait("@jobLogs");
      cy.wait("@jobArtifacts");
      // wait for details panel to show
      cy.get("mat-tab-group").should("exist");

      // switch to lineage tab
      cy.contains("Lineage").click();

      // the lineage editor renders lineage as editable key/value inputs
      cy.get(".lineage-list .row").should("have.length.at.least", 1);
      cy.get(".lineage-list .row")
        .first()
        .within(() => {
          cy.get('input[placeholder="key"]').should(
            "have.value",
            "parentJobId"
          );
          cy.get('input[placeholder="value"]').should(
            "have.value",
            "e2e-parent"
          );
        });
    });
  });
});
