import { test, expect } from "@playwright/test";

test("promql cards render on diagnostics", async ({ page }) => {
  const url = process.env.URL || "http://localhost:4200/diagnostics?e2e=1";
  await page.goto(url);
  // wait for at least one promql card to appear
  await page.waitForSelector("app-promql-card", { timeout: 60000 });
  const count = await page.$$eval("app-promql-card", (els) => els.length);
  expect(count).toBeGreaterThan(0);
});
