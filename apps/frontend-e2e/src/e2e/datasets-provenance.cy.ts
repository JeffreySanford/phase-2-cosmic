describe("datasets provenance", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/v1/datasets", {
      statusCode: 200,
      body: [
        {
          id: "dataset-1",
          name: "Existing Dataset",
          description: "Has provenance metadata",
          createdAt: "2026-03-06T12:00:00Z",
          metadata: {
            workflow: "spectral-line",
            jobId: "job-001",
            sourceDatasetId: "dataset-source-1",
            processingTimestamp: "2026-03-06T12:05:00Z",
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
      ],
    }).as("listDatasets");

    cy.intercept("POST", "/api/v1/datasets", (req) => {
      expect(req.body).to.deep.equal({
        name: "Created Dataset",
        description: "Created from Cypress",
      });

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
          },
        },
      });
    }).as("createDataset");
  });

  it("renders provenance details for listed datasets and supports create flow", () => {
    cy.visit("/datasets");
    cy.wait("@listDatasets");

    cy.contains("strong", "Existing Dataset").should("exist");
    cy.get(".provenance-panel__header").first().click();
    cy.contains(".provenance-panel__label", "Workflow").should("exist");
    cy.contains(".provenance-panel__value code", "spectral-line").should(
      "exist"
    );
    cy.get(".provenance-panel__link")
      .first()
      .should("have.attr", "href")
      .and("include", "/jobs?id=job-001");
    cy.contains(".provenance-panel__badge", "Main").should("exist");
    cy.contains(".provenance-panel__code", '"mode": "zoom"').should("exist");

    cy.contains("mat-form-field", "Name").find("input").type("Created Dataset");
    cy.contains("mat-form-field", "Description")
      .find("input")
      .type("Created from Cypress");
    cy.contains("button", "Create").click();
    cy.wait("@createDataset");

    cy.contains("strong", "Created Dataset").should("exist");
    cy.get(".provenance-panel__header").first().click();
    cy.contains(".provenance-panel__value code", "continuum").should("exist");
  });
});
