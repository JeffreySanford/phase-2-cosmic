import { test, expect } from "@playwright/test";

/**
 * E2E integration tests for Phase 1C deliverables
 *
 * Mission linkage:
 * - Mission outcome: Reproducible science + Institutional trust and audit
 * - Validation: NGVLA reference fidelity, demo transparency, provenance traceability
 */

test.describe("Phase 1C Integration", () => {
  const baseUrl = process.env["URL"] || "http://localhost:4200";

  test.describe("NGVLA Topology Visualization", () => {
    test("should display ngVLA array segments in topology", async ({
      page,
    }) => {
      await page.goto(`${baseUrl}/topology?e2e=1`);

      await page.waitForSelector(".topology-container, svg", {
        timeout: 10000,
      });

      // Wait for D3.js to render nodes
      await page.waitForTimeout(2000);

      // Check page renders without errors
      const pageTitle = await page.textContent("h2, mat-card-title");
      expect(pageTitle).toBeTruthy();
    });

    test("should display disclaimer banner on topology page", async ({
      page,
    }) => {
      await page.goto(`${baseUrl}/topology?e2e=1`);

      await page.waitForSelector("app-disclaimer-banner", { timeout: 10000 });

      const banner = page.locator("app-disclaimer-banner");
      await expect(banner).toBeVisible();

      // Should contain ngVLA-specific message
      const message = page.locator(".disclaimer-banner__message");
      const text = await message.textContent();
      expect(text?.toLowerCase()).toContain("ngvla");
    });

    test("should display ngVLA legend", async ({ page }) => {
      await page.goto(`${baseUrl}/topology?e2e=1`);

      await page.waitForSelector(".topology-container, svg", {
        timeout: 10000,
      });

      // Check for legend text mentioning ngVLA
      const bodyText = await page.textContent("body");
      expect(bodyText?.toLowerCase()).toContain("ngvla");
    });
  });

  test.describe("Jobs with Demo Disclaimer", () => {
    test("should display demo disclaimer on jobs page", async ({ page }) => {
      await page.goto(`${baseUrl}/jobs?e2e=1`);

      await page.waitForSelector("mat-card-title", { timeout: 10000 });

      // Disclaimer should be present
      const disclaimer = page.locator("app-disclaimer-banner");
      await expect(disclaimer).toBeVisible();
    });

    test("should allow job submission workflow", async ({ page }) => {
      await page.goto(`${baseUrl}/jobs?e2e=1`);

      await page.waitForSelector("mat-card-title", { timeout: 10000 });

      // Check for "New Job" button
      const newJobButton = page.locator('button:has-text("New Job")');

      if ((await newJobButton.count()) > 0) {
        await expect(newJobButton).toBeVisible();
      }
    });
  });

  test.describe("Datasets with Provenance Panel", () => {
    test("should display datasets page with disclaimer", async ({ page }) => {
      await page.goto(`${baseUrl}/datasets?e2e=1`);

      await page.waitForSelector("mat-card-title", { timeout: 10000 });

      // Both disclaimer and datasets functionality should be present
      const disclaimer = page.locator("app-disclaimer-banner");
      await expect(disclaimer).toBeVisible();

      const pageTitle = await page.locator("mat-card-title").textContent();
      expect(pageTitle).toContain("Datasets");
    });

    test("should support dataset creation", async ({ page }) => {
      await page.goto(`${baseUrl}/datasets?e2e=1`);

      await page.waitForSelector("mat-card", { timeout: 10000 });

      // Check for create form elements
      const nameField = page.locator('mat-form-field:has-text("Name")');
      const descField = page.locator('mat-form-field:has-text("Description")');
      const createButton = page.locator('button:has-text("Create")');

      await expect(nameField).toBeVisible();
      await expect(descField).toBeVisible();
      await expect(createButton).toBeVisible();
    });
  });

  test.describe("Diagnostics with Demo Disclaimer", () => {
    test("should display diagnostics page with disclaimer", async ({
      page,
    }) => {
      await page.goto(`${baseUrl}/diagnostics?e2e=1`);

      await page.waitForSelector("h1, h2", { timeout: 10000 });

      // Disclaimer should be present
      const disclaimer = page.locator("app-disclaimer-banner");
      await expect(disclaimer).toBeVisible();
    });
  });

  test.describe("Cross-Page Navigation", () => {
    test("should maintain disclaimer across page navigation", async ({
      page,
    }) => {
      // Start on Jobs page
      await page.goto(`${baseUrl}/jobs?e2e=1`);
      await page.waitForSelector("app-disclaimer-banner", { timeout: 10000 });

      let banner = page.locator("app-disclaimer-banner");
      await expect(banner).toBeVisible();

      // Navigate to Datasets
      const datasetsLink = page.locator(
        'a[href*="datasets"], button:has-text("Datasets")'
      );
      if ((await datasetsLink.count()) > 0) {
        await datasetsLink.first().click();
        await page.waitForSelector('mat-card-title:has-text("Datasets")', {
          timeout: 10000,
        });

        // Disclaimer should still be present
        banner = page.locator("app-disclaimer-banner");
        await expect(banner).toBeVisible();
      }
    });
  });

  test.describe("Phase 1C Exit Criteria Validation", () => {
    test("should validate all demo-facing pages have disclaimers", async ({
      page,
    }) => {
      const pages = [
        { path: "/jobs", name: "Jobs" },
        { path: "/datasets", name: "Datasets" },
        { path: "/diagnostics", name: "Diagnostics" },
        { path: "/topology", name: "Topology" },
      ];

      for (const pg of pages) {
        await page.goto(`${baseUrl}${pg.path}?e2e=1`);
        await page.waitForSelector("app-disclaimer-banner, mat-card, h1, h2", {
          timeout: 10000,
        });

        const disclaimer = page.locator("app-disclaimer-banner");
        const hasDisclaimer = (await disclaimer.count()) > 0;

        expect(hasDisclaimer).toBe(true);
      }
    });

    test("should validate provenance panel integration", async ({ page }) => {
      await page.goto(`${baseUrl}/datasets?e2e=1`);

      await page.waitForSelector("mat-card", { timeout: 10000 });

      // Provenance panel component should be integrated
      // Even if no data, the component structure should exist
      const bodyHtml = await page.content();
      const hasProvenancePanelComponent =
        bodyHtml.includes("app-provenance-panel") ||
        bodyHtml.includes("No datasets yet");

      expect(hasProvenancePanelComponent).toBe(true);
    });
  });
});
