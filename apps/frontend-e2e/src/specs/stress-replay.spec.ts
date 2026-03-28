describe("Stress replay", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/load-profile", {
      statusCode: 200,
      body: { profilePct: 10, workers: 0, mode: "baseline", note: "" },
    }).as("getLoadProfile");

    // Default handler for set profile (POST)
    cy.intercept("POST", "/api/load-profile", (req) => {
      req.reply({
        statusCode: 200,
        body: {
          profilePct: req.body.profilePct,
          workers: req.body.profilePct === 100 ? 4 : 2,
          mode: req.body.profilePct === 10 ? "baseline" : "runtime-controlled",
          note: req.body.profilePct === 100 ? "smoke stress (bounded)" : "",
        },
      });
    }).as("setLoadProfile");
  });

  it("allows replaying the stress profile history", () => {
    cy.visit("/dashboard");

    // Ensure initial profile loaded before interactions
    cy.wait("@getLoadProfile");

    // Enable stress mode by toggling the footer control
    cy.get('.stress-toggle button[role="switch"], .stress-toggle input', {
      timeout: 10000,
    })
      .first()
      .click({ force: true });

    // Set the profile to 100% (to create history entries)
    cy.get(".profile-trigger").click();
    cy.contains("button", "100%").click();
    cy.wait("@setLoadProfile");

    // Click the replay button and ensure it triggers additional profile sets
    cy.get("button.replay-history").should("exist").click();

    // Expect at least one additional profile set request during replay
    cy.wait("@setLoadProfile");
  });
});
