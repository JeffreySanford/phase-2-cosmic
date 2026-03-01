describe('Jobs view diagnostic', () => {
  const diagnosticLog = 'logs/jobs-diagnostic-' + new Date().toISOString().replace(/[:.]/g,'') + '.log'

  before(() => {
    // ensure logs dir exists in node env when running via CI/local
    cy.exec('node -e "require(\'fs\').mkdirSync(\'logs\', { recursive: true })"')
  })

  it('captures /api/v1/jobs requests and responses', () => {
    const entries: Array<any> = []

    cy.intercept('/api/v1/jobs**', (req) => {
      const started = Date.now()
      req.continue((res) => {
        const entry = {
          url: req.url,
          method: req.method,
          headers: req.headers,
          statusCode: res.statusCode,
          responseBody: res.body,
          durationMs: Date.now() - started
        }
        entries.push(entry)
      })
    }).as('jobsReq')

    // adjust the base url if your dev server runs on a different port
    cy.visit('/')

    // navigate to jobs view - adapt selector if app differs
    cy.contains(/jobs/i, { timeout: 10000 }).click()

    // wait for at least one jobs API call or timeout
    cy.wait('@jobsReq', { timeout: 20000 }).then(() => {
      // write a concise diagnostic file to logs/
      const summary = entries.map(e => ({ url: e.url, method: e.method, status: e.statusCode, durationMs: e.durationMs }))
      const payload = { capturedAt: new Date().toISOString(), summary, full: entries }
      cy.writeFile(diagnosticLog, JSON.stringify(payload, null, 2))
      // Assert that the jobs call returned 2xx
      const bad = entries.filter(e => !(e.statusCode >= 200 && e.statusCode < 300))
      if (bad.length) {
        // fail the test with details
        throw new Error('Jobs API returned failing responses: ' + JSON.stringify(bad, null, 2))
      }
    })
  })
})
