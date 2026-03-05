describe("Jobs view diagnostic", () => {
  const diagnosticLog =
    "logs/jobs-diagnostic-" +
    new Date().toISOString().replace(/[:.]/g, "") +
    ".log";

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

    // write page snapshot to logs for debugging (helps detect redirects/login pages)
    cy.document().then((d) => {
      const html = d.documentElement.outerHTML;
      const pageLog =
        "logs/jobs-page-" +
        new Date().toISOString().replace(/[:.]/g, "") +
        ".html";
      cy.writeFile(pageLog, html);

      // Basic heuristics to detect non-frontend pages (Grafana or missing Angular root)
      const title = (d.title || "").toLowerCase();
      const hasAppRoot = !!d.querySelector("app-root");
      const looksLikeGrafana =
        title.includes("grafana") || html.includes("window.grafanaBootData");

      if (looksLikeGrafana || !hasAppRoot) {
        const failDiag = {
          detectedAt: new Date().toISOString(),
          reason: looksLikeGrafana ? "grafana-detected" : "missing-app-root",
          pageTitle: d.title,
          hasAppRoot,
          pageSnapshotFile: pageLog,
        };
        // write a clear diagnostic JSON and fail fast with a helpful message
        cy.writeFile(
          diagnosticLog,
          JSON.stringify(
            { capturedAt: new Date().toISOString(), failure: failDiag },
            null,
            2
          )
        );
        throw new Error(
          "Non-frontend page detected; wrote " +
            diagnosticLog +
            " and " +
            pageLog +
            " — reason=" +
            failDiag.reason
        );
      }
    });

    // wait for at least one jobs API call; increase timeout for slow dev servers
    // if no request occurs, we'll capture the page HTML above for inspection
    cy.wait("@jobsReq", { timeout: 60000 }).then(() => {
      // write a concise diagnostic file to repo-root `logs/` (Cypress writes relative to project root)
      const summary = entries.map((e) => ({
        url: e.url,
        method: e.method,
        status: e.statusCode,
        durationMs: e.durationMs,
      }));
      const payload = {
        capturedAt: new Date().toISOString(),
        summary,
        full: entries,
      };
      cy.writeFile(diagnosticLog, JSON.stringify(payload, null, 2));
      // Assert that the jobs call returned 2xx
      const bad = entries.filter(
        (e) => !(e.statusCode >= 200 && e.statusCode < 300)
      );
      if (bad.length) {
        // fail the test with details
        throw new Error(
          "Jobs API returned failing responses: " + JSON.stringify(bad, null, 2)
        );
      }
    });
  });
});
