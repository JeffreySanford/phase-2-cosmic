import { test, expect } from '@playwright/test';

test('aladin loads and attaches viewer', async ({ page }) => {
  const url = process.env.URL || 'http://localhost:4200/view?e2e=1';
  await page.goto(url);

  // ensure the viewer container exists in the DOM (may be hidden until init completes)
  await page.waitForSelector('#aladin-lite', { state: 'attached', timeout: 60000 });

  // wait for the viewer to signal readiness via data attribute
  await page.waitForSelector('#aladin-lite[data-viewer-ready="true"]', { state: 'attached', timeout: 60000 });
  const ready = await page.$eval('#aladin-lite', (el) => el.getAttribute('data-viewer-ready') === 'true');
  expect(ready).toBeTruthy();
});
