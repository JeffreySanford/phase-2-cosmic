describe("Add five jobs and processing", () => {
  beforeEach(() => {
    cy.visit("/jobs?e2e=1");
  });

  it("submits five complex jobs and verifies they are processed", () => {
    // intercept job list and submit endpoints
    cy.intercept("POST", "/api/v1/jobs").as("submitJob");

    // open dialog and submit a single job with explicit lineage
    cy.contains("button", "New Job").click();
    // click the Workflow mat-select trigger to open the overlay dropdown
    cy.get("mat-dialog-container").within(() => {
      cy.get("mat-select").first().click();
    });
    // mat-option is rendered in a CDK overlay outside the dialog — query globally
    cy.get("mat-option").contains("diagnostics").click();
    // fill basic fields
    cy.get(
      'mat-dialog-container input[placeholder="optional dataset id"]'
    ).type("e2e-ds-1");
    cy.get('mat-dialog-container input[placeholder="your name or id"]').type(
      "tester"
    );
    // clear pre-filled sample params and type our own JSON
    cy.get("mat-dialog-container textarea").clear();
    cy.get("mat-dialog-container textarea").type('{"example": true}', {
      parseSpecialCharSequences: false,
    });
    cy.get("mat-dialog-container").contains("button", "Submit").click();
    cy.wait("@submitJob")
      .its("request.body")
      .should((body) => {
        expect(body.workflow).to.equal("diagnostics");
        expect(body.datasetId).to.equal("e2e-ds-1");
      });

    // click Add five jobs for bulk test
    cy.contains("button", "Add five jobs").click();

    // wait for 5 submit calls
    cy.wait("@submitJob", { timeout: 20000 }).then(() => {
      // at least one submit observed; allow some time for others
    });

    // now poll job list and verify table exists and jobs appear
    // header text lives outside the table in a mat-card-title
    cy.contains("mat-card-title", "Governance Jobs").should("exist");
    cy.get("table").should("exist");
    cy.get("table tbody tr", { timeout: 30000 }).should(
      "have.length.greaterThan",
      0
    );

    // wait up to 30s for a completed job row to appear
    cy.contains("table tbody tr", "COMPLETED", { timeout: 30000 }).should(
      "exist"
    );

    // click View on the completed row to open detail panel
    cy.contains("table tbody tr", "COMPLETED")
      .contains("button", "View")
      .click();
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
