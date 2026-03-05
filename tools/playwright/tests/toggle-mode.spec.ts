import { test, expect } from "@playwright/test";

test("footer Live/Mock toggle updates mode and profile visibility", async ({
  page,
}) => {
  // Ensure app is reachable
  await page.goto("/");
  await page.waitForSelector("footer.app-footer");

  const footer = page.locator("footer.app-footer");
  const profileTrigger = footer.locator(".profile-trigger");
  const modeText = (m: string) => footer.locator(`text=Mode: ${m}`);
  const toggle = footer.locator(".data-toggle");

  // Default should be Live (app data-source default is 'live')
  await expect(modeText("live")).toBeVisible();
  await expect(profileTrigger).toHaveCount(0);

  // Toggle to Mock
  await toggle.click();
  await expect(modeText("mock")).toBeVisible();
  await expect(profileTrigger).toBeVisible();

  // Toggle back to Live
  await toggle.click();
  await expect(modeText("live")).toBeVisible();
  await expect(profileTrigger).toHaveCount(0);
});
