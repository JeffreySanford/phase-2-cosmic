describe("datasets provenance", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/v1/datasets", {
      statusCode: 200,
      body: [],
    }).as("listDatasets");

    cy.intercept("POST", "/api/v1/datasets", (req) => {
      req.reply({
        statusCode: 200,
        body: {
          id: "dataset-2",
          name: "Created Dataset",
          description: "Created from Cypress",
          createdAt: "2026-03-06T13:00:00Z",
          metadata: {
            workflow: "continuum",
            jobId: "job-created-1",
            sourceDatasetId: "dataset-source-2",
            processingTimestamp: "2026-03-06T13:05:00Z",
            parameters: {
              manifest: {
                mode: "zoom",
              },
            },
            ngvlaParams: {
              arraySegment: "Main",
              antennaClass: "18m",
              frequencyBandGHz: { min: 1.2, max: 8.0 },
            },
          },
        },
      });
    }).as("createDataset");
  });

  it("submits dataset create payloads with provenance-ready responses", () => {
    cy.visit("/datasets");
    cy.wait("@listDatasets");
    cy.contains("No datasets yet").should("exist");

    cy.get("mat-card-content mat-form-field").first().find("input").clear();
    cy.get("mat-card-content mat-form-field")
      .first()
      .find("input")
      .type("Created Dataset");
    cy.get("mat-card-content mat-form-field").eq(1).find("input").clear();
    cy.get("mat-card-content mat-form-field")
      .eq(1)
      .find("input")
      .type("Created from Cypress");
    cy.get("mat-card-content button").contains("Create").click({ force: true });
    cy.wait("@createDataset").then(({ request, response }) => {
      expect(request.body).to.deep.equal({
        name: "Created Dataset",
        description: "Created from Cypress",
      });
      expect(response?.body).to.deep.include({
        id: "dataset-2",
        name: "Created Dataset",
        description: "Created from Cypress",
      });
      expect(response?.body?.metadata).to.deep.include({
        workflow: "continuum",
        jobId: "job-created-1",
        sourceDatasetId: "dataset-source-2",
      });
      expect(response?.body?.metadata?.ngvlaParams).to.deep.include({
        arraySegment: "Main",
        antennaClass: "18m",
      });
    });
  });
});
