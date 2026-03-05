import { test, expect } from "@playwright/test";

/**
 * E2E tests for DisclaimerBannerComponent
 *
 * Mission linkage:
 * - Mission outcome: Institutional trust and audit
 * - Validation: Demo transparency through explicit modeling/demo disclaimers
 */

test.describe("Disclaimer Banner", () => {
  const baseUrl = process.env["URL"] || "http://localhost:4200";

  test("should display disclaimer banner on Jobs page", async ({ page }) => {
    await page.goto(`${baseUrl}/jobs?e2e=1`);

    // Wait for disclaimer banner to render
    await page.waitForSelector("app-disclaimer-banner", { timeout: 10000 });

    const banner = page.locator("app-disclaimer-banner");
    await expect(banner).toBeVisible();
  });

  test("should display disclaimer banner on Datasets page", async ({
    page,
  }) => {
    await page.goto(`${baseUrl}/datasets?e2e=1`);

    await page.waitForSelector("app-disclaimer-banner", { timeout: 10000 });

    const banner = page.locator("app-disclaimer-banner");
    await expect(banner).toBeVisible();
  });

  test("should display disclaimer banner on Diagnostics page", async ({
    page,
  }) => {
    await page.goto(`${baseUrl}/diagnostics?e2e=1`);

    await page.waitForSelector("app-disclaimer-banner", { timeout: 10000 });

    const banner = page.locator("app-disclaimer-banner");
    await expect(banner).toBeVisible();
  });

  test("should display disclaimer banner on Topology page", async ({
    page,
  }) => {
    await page.goto(`${baseUrl}/topology?e2e=1`);

    await page.waitForSelector("app-disclaimer-banner", { timeout: 10000 });

    const banner = page.locator("app-disclaimer-banner");
    await expect(banner).toBeVisible();
  });

  test("should show dismiss button on dismissible banners", async ({
    page,
  }) => {
    await page.goto(`${baseUrl}/jobs?e2e=1`);

    await page.waitForSelector("app-disclaimer-banner", { timeout: 10000 });

    const dismissButton = page.locator(".disclaimer-banner__dismiss");
    await expect(dismissButton).toBeVisible();
  });

  test("should dismiss banner when dismiss button is clicked", async ({
    page,
  }) => {
    await page.goto(`${baseUrl}/jobs?e2e=1`);

    await page.waitForSelector("app-disclaimer-banner", { timeout: 10000 });

    const banner = page.locator(".disclaimer-banner");
    await expect(banner).toBeVisible();

    const dismissButton = page.locator(".disclaimer-banner__dismiss");
    await dismissButton.click();

    // Banner should be hidden after dismissal
    await expect(banner).toBeHidden();
  });

  test("should display appropriate message for demo type", async ({ page }) => {
    await page.goto(`${baseUrl}/jobs?e2e=1`);

    await page.waitForSelector("app-disclaimer-banner", { timeout: 10000 });

    const message = page.locator(".disclaimer-banner__message");
    const text = await message.textContent();

    // Should contain "demonstration" for demo type
    expect(text?.toLowerCase()).toContain("demo");
  });

  test('should have accessibility role="alert"', async ({ page }) => {
    await page.goto(`${baseUrl}/jobs?e2e=1`);

    await page.waitForSelector("app-disclaimer-banner", { timeout: 10000 });

    const banner = page.locator(".disclaimer-banner");
    const role = await banner.getAttribute("role");

    expect(role).toBe("alert");
  });
});
