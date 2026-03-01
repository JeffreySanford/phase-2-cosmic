/* eslint-disable no-restricted-syntax */
// This is a Node profiling script — async/await is intentional for clarity.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const outDir = path.resolve(__dirname, '..', 'profile-output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const url = process.env.URL || 'http://localhost:4200/view?e2e=1';
  console.log('Profiling URL:', url);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable CDP session for CPU profiler
  const client = await context.newCDPSession(page);
  await client.send('Profiler.enable');
  await client.send('Profiler.start');

  // Install a PerformanceObserver on the page to collect Long Tasks
  await page.addInitScript(() => {
    window.__longTasks = [];
    try {
      const obs = new PerformanceObserver((list) => {
        list.getEntries().forEach((e) => {
          window.__longTasks.push({ name: e.name, start: e.startTime, duration: e.duration });
        });
      });
      obs.observe({ entryTypes: ['longtask'] });
    } catch (err) {
      // Long Task API may be unavailable in some contexts
      window.__longTasksError = String(err);
    }
  });

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  console.log('Page loaded, waiting 5s to capture activity...');
  await page.waitForTimeout(5000);

  // Stop profiler and collect profile
  const profileResult = await client.send('Profiler.stop');
  const profilePath = path.join(outDir, 'cpu-profile.json');
  fs.writeFileSync(profilePath, JSON.stringify(profileResult.profile));
  console.log('Saved CPU profile to', profilePath);

  // Collect long tasks
  const longTasks = await page.evaluate(() => window.__longTasks || []);
  const longTasksPath = path.join(outDir, 'long-tasks.json');
  fs.writeFileSync(longTasksPath, JSON.stringify(longTasks, null, 2));
  console.log('Saved long tasks to', longTasksPath);

  // Also capture performance.getEntries
  const perfEntries = await page.evaluate(() => performance.getEntries().map(e => ({name: e.name, entryType: e.entryType, start: e.startTime, duration: e.duration})));
  const perfPath = path.join(outDir, 'perf-entries.json');
  fs.writeFileSync(perfPath, JSON.stringify(perfEntries, null, 2));
  console.log('Saved perf entries to', perfPath);

  await browser.close();
  console.log('Done.');
})();
