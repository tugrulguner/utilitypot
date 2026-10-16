import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const tools = JSON.parse(
  readFileSync(new URL("../src/data/tools.json", import.meta.url), "utf8"),
);
for (const [label, path] of [
  ["homepage", "/"],
  ...tools.map((t) => [t.slug, `/tools/${t.slug}/`]),
])
  test(`${label}: no partner promotion on UtilityPot`, async ({ page }) => {
    await page.goto(path);
    await expect(
      page.locator(".partner-card,.partner-label,.partner-cta,.home-partner"),
    ).toHaveCount(0);
    await expect(page.locator('a[href*="circlesandcookies"]')).toHaveCount(0);
    await expect(
      page.getByText("Partner advertisement", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator('a[href="https://modepot.io/"]').first(),
    ).toBeVisible();
  });
