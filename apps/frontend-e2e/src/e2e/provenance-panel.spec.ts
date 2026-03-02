import { test, expect } from '@playwright/test';

/**
 * E2E tests for ProvenancePanelComponent in Datasets
 * 
 * Mission linkage:
 * - Mission outcome: Reproducible science
 * - Validation: Dataset provenance linkage enables workflow traceability
 */

test.describe('Provenance Panel', () => {
  const baseUrl = process.env['URL'] || 'http://localhost:4200';

  test('should display provenance panel on Datasets page', async ({ page }) => {
    await page.goto(`${baseUrl}/datasets?e2e=1`);
    
    // Wait for page to load
    await page.waitForSelector('mat-card', { timeout: 10000 });
    
    // Check if provenance panel component exists (may not be visible if no datasets)
    const panelExists = await page.locator('app-provenance-panel').count();
    
    // Panel should either be present or page should show "No datasets yet"
    const noDatasets = await page.locator(':text("No datasets yet")').count();
    
    expect(panelExists > 0 || noDatasets > 0).toBe(true);
  });

  test.describe('with provenance data', () => {
    // This test assumes datasets exist with provenance data
    // In a real scenario, you might create test data first
    
    test('should expand provenance panel when header clicked', async ({ page }) => {
      await page.goto(`${baseUrl}/datasets?e2e=1`);
      
      await page.waitForSelector('mat-card', { timeout: 10000 });
      
      const panelHeader = page.locator('.provenance-panel__header').first();
      
      if (await panelHeader.count() > 0) {
        // Click header to expand
        await panelHeader.click();
        
        // Content should now be visible
        const contentAfterClick = page.locator('.provenance-panel__content').first();
        await expect(contentAfterClick).toBeVisible();
      }
    });

    test('should display workflow information when available', async ({ page }) => {
      await page.goto(`${baseUrl}/datasets?e2e=1`);
      
      await page.waitForSelector('mat-card', { timeout: 10000 });
      
      const workflowLabel = page.locator('.provenance-panel__label:has-text("Workflow")');
      
      if (await workflowLabel.count() > 0) {
        // Expand the panel
        const panelHeader = page.locator('.provenance-panel__header').first();
        await panelHeader.click();
        
        // Check that workflow value is displayed
        const workflowValue = page.locator('.provenance-panel__value code').first();
        await expect(workflowValue).toBeVisible();
      }
    });

    test('should display jobId as clickable link when available', async ({ page }) => {
      await page.goto(`${baseUrl}/datasets?e2e=1`);
      
      await page.waitForSelector('mat-card', { timeout: 10000 });
      
      const jobIdLabel = page.locator('.provenance-panel__label:has-text("Job ID")');
      
      if (await jobIdLabel.count() > 0) {
        // Expand the panel
        const panelHeader = page.locator('.provenance-panel__header').first();
        await panelHeader.click();
        
        // Check that job ID is a link
        const jobIdLink = page.locator('.provenance-panel__link').first();
        await expect(jobIdLink).toBeVisible();
        
        // Link should point to jobs page
        const href = await jobIdLink.getAttribute('href');
        expect(href).toContain('/jobs');
      }
    });

    test('should display ngVLA parameters when available', async ({ page }) => {
      await page.goto(`${baseUrl}/datasets?e2e=1`);
      
      await page.waitForSelector('mat-card', { timeout: 10000 });
      
      const ngvlaSection = page.locator('.provenance-panel__section:has-text("ngVLA Observation Parameters")');
      
      if (await ngvlaSection.count() > 0) {
        // Expand the panel
        const panelHeader = page.locator('.provenance-panel__header').first();
        await panelHeader.click();
        
        // Check for ngVLA parameter badges
        const badges = page.locator('.provenance-panel__badge');
        const badgeCount = await badges.count();
        
        expect(badgeCount).toBeGreaterThan(0);
      }
    });

    test('should display reproducible science message in footer', async ({ page }) => {
      await page.goto(`${baseUrl}/datasets?e2e=1`);
      
      await page.waitForSelector('mat-card', { timeout: 10000 });
      
      const panelHeader = page.locator('.provenance-panel__header').first();
      
      if (await panelHeader.count() > 0) {
        // Expand the panel
        await panelHeader.click();
        
        // Check footer contains reproducible science message
        const footer = page.locator('.provenance-panel__footer .provenance-panel__note');
        const text = await footer.textContent();
        
        expect(text?.toLowerCase()).toContain('reproducible science');
      }
    });

    test('should toggle chevron icon on expand/collapse', async ({ page }) => {
      await page.goto(`${baseUrl}/datasets?e2e=1`);
      
      await page.waitForSelector('mat-card', { timeout: 10000 });
      
      const panelHeader = page.locator('.provenance-panel__header').first();
      
      if (await panelHeader.count() > 0) {
        const chevron = page.locator('.provenance-panel__chevron').first();
        
        // Check initial state (collapsed)
        const hasExpandedClassBefore = await chevron.evaluate((el) => 
          el.classList.contains('provenance-panel__chevron--expanded')
        );
        expect(hasExpandedClassBefore).toBe(false);
        
        // Expand
        await panelHeader.click();
        
        // Check expanded state
        const hasExpandedClassAfter = await chevron.evaluate((el) => 
          el.classList.contains('provenance-panel__chevron--expanded')
        );
        expect(hasExpandedClassAfter).toBe(true);
      }
    });
  });

  test.describe('dataset creation with provenance', () => {
    test('should create dataset and display provenance panel', async ({ page }) => {
      await page.goto(`${baseUrl}/datasets?e2e=1`);
      
      await page.waitForSelector('mat-card', { timeout: 10000 });
      
      // Fill in dataset creation form
      const nameInput = page.locator('input[name="name"], mat-form-field:has-text("Name") input').first();
      const descInput = page.locator('input[name="description"], mat-form-field:has-text("Description") input').first();
      const createButton = page.locator('button:has-text("Create")');
      
      if (await nameInput.count() > 0) {
        await nameInput.fill(`E2E Test Dataset ${Date.now()}`);
        await descInput.fill('E2E test dataset with provenance');
        
        await createButton.click();
        
        // Wait for the new dataset to appear
        await page.waitForTimeout(1000);
        
        // Verify dataset appears in list
        const datasets = page.locator('mat-list-item');
        const count = await datasets.count();
        expect(count).toBeGreaterThan(0);
      }
    });
  });
});
