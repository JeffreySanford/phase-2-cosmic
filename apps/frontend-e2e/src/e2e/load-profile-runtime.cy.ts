describe("load profile runtime control", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/load-profile", {
      statusCode: 200,
      body: { profilePct: 10, mode: "baseline", workers: 0 },
    }).as("getLoadProfile");

    cy.intercept("POST", "/api/load-profile", (req) => {
      const pct = Number(req.body?.profilePct || 10);
      req.reply({
        statusCode: 200,
        body: {
          profilePct: pct,
          mode: pct === 10 ? "baseline" : "runtime-controlled",
          workers: pct === 10 ? 0 : 4,
        },
      });
    }).as("setLoadProfile");

    // visit landing in mock mode via query param (sets data source in app)
    cy.visit("/landing?mode=mock");
    cy.contains("span.label", "Mode: Mock Data").should("exist");
    cy.wait("@getLoadProfile");
  });

  it("updates footer profile and mode after selection", () => {
    cy.contains("Mode: baseline").should("exist");
    cy.get("button.profile-trigger").contains("10%");

    cy.get("button.profile-trigger").click({ force: true });
    cy.contains(".profile-menu-item", "50%").click({ force: true });

    cy.wait("@setLoadProfile").then((interception) => {
      expect(interception.request.body).to.deep.equal({ profilePct: 50 });
    });

    cy.get("button.profile-trigger").contains("50%");
    cy.contains("Mode: runtime-controlled").should("exist");
  });
});
