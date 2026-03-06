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

      // navigate to jobs page and ensure our job appears
      cy.visit("/jobs");
      cy.contains(jobId).should("exist");

      // open detail view for the job
      cy.contains(jobId).click();
      // wait for details panel to show
      cy.get("mat-tab-group").should("exist");

      // switch to lineage tab
      cy.contains("Lineage").click();

      // the lineage editor should display the parentJobId value
      cy.contains("parentJobId").should("exist");
      cy.contains("e2e-parent").should("exist");
    });
  });
});
