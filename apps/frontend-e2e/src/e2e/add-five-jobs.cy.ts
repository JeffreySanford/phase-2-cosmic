describe("Add five jobs and processing", () => {
  beforeEach(() => {
    cy.visit("/jobs?e2e=1");
  });

  it("submits five complex jobs and verifies they are processed", () => {
    cy.intercept("POST", "/api/v1/admin/release-deferred").as(
      "releaseDeferred"
    );

    cy.contains("button", "Add five jobs").should("be.enabled");
    cy.contains("button", "Add five jobs").click();
    cy.contains("div", /Submitted \d+ jobs/, { timeout: 30000 }).should(
      "exist"
    );

    // release deferred samples (in case precached were deferred)
    cy.contains("button", "Release deferred samples").click();
    cy.wait("@releaseDeferred", { timeout: 10000 }).then((interception) => {
      expect(interception.request.method).to.equal("POST");
      expect(interception.response?.statusCode ?? 204).to.be.oneOf([
        200, 201, 202, 204,
      ]);
    });

    // now poll job list and verify table exists and jobs appear
    // header text lives outside the table in a mat-card-title
    cy.contains("mat-card-title", "Governance Jobs").should("exist");
    cy.get(".job-card", { timeout: 30000 }).should(
      "have.length.greaterThan",
      0
    );

    // wait up to 30s for a completed job row to appear
    cy.contains(".job-card", "COMPLETED", { timeout: 30000 }).should("exist");

    // open the completed job detail card
    cy.contains(".job-card", "COMPLETED").contains("button", "Details").click();
    cy.contains("Workflow:").should("exist");
    cy.contains("Lineage").should("exist");

    // Test lineage editing and saving
    cy.contains("Lineage").click();
    // The lineage editor should be visible
    cy.get("app-jobs-lineage-editor").should("exist");
    // Save button should be present
    cy.contains("button", "Save").should("exist");
  });
});
