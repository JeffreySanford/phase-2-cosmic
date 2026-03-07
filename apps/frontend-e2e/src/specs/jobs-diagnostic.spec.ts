describe("Jobs view diagnostic", () => {
  it("captures /api/v1/jobs requests and responses", () => {
    type Entry = {
      url: string;
      method: string;
      headers: Record<string, unknown>;
      statusCode: number;
      responseBody: unknown;
      durationMs: number;
    };
    const entries: Array<Entry> = [];

    // match requests to the jobs API on any host (works with proxy or direct backend calls)
    cy.intercept("**/api/v1/jobs**", (req) => {
      const started = Date.now();
      req.continue((res) => {
        const entry = {
          url: req.url,
          method: req.method,
          headers: req.headers,
          statusCode: res.statusCode,
          responseBody: res.body,
          durationMs: Date.now() - started,
        };
        entries.push(entry);
      });
    }).as("jobsReq");

    // navigate directly to the Jobs route to avoid missing menu UI
    // adjust the path if your app uses a different route
    cy.visit("/jobs");

    cy.document().then((d) => {
      const html = d.documentElement.outerHTML;
      const title = (d.title || "").toLowerCase();
      const hasAppRoot = !!d.querySelector("app-root");
      const looksLikeGrafana =
        title.includes("grafana") || html.includes("window.grafanaBootData");

      if (looksLikeGrafana || !hasAppRoot) {
        throw new Error(
          "Non-frontend page detected: " +
            (looksLikeGrafana ? "grafana-detected" : "missing-app-root")
        );
      }
    });

    cy.wait("@jobsReq", { timeout: 60000 }).then(() => {
      const bad = entries.filter(
        (e) => !(e.statusCode >= 200 && e.statusCode < 300)
      );
      expect(entries.length).to.be.greaterThan(0);
      if (bad.length) {
        throw new Error(
          "Jobs API returned failing responses: " + JSON.stringify(bad, null, 2)
        );
      }
    });
  });
});
