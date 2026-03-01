const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const logs = [];
  page.on('console', (msg) => logs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => logs.push({ type: 'error', text: String(err) }));
  const url = process.env.URL || 'http://localhost:4200/diagnostics?e2e=1';
  console.log('goto', url);
  await page.goto(url, { waitUntil: 'networkidle' }).catch((e) => console.error('goto error', e && e.message));
  // wait a bit for client-side bootstrap
  await page.waitForTimeout(8000);
  const body = await page.content();
  console.log('---BODY START---');
  console.log(body.slice(0, 20000)); // print prefix
  console.log('---BODY END---');
  console.log('---CONSOLE LOGS---');
  console.log(JSON.stringify(logs, null, 2));
  await browser.close();
})();