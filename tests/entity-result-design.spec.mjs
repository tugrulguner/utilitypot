import { test, expect } from "@playwright/test";
import { fixturePlan } from "./workflow-fixtures.mjs";
const text = "Ada works at Acme Labs. Ada emailed Lin.";
const entities = [
  { type: "Person", text: "Ada", start: 0, end: 3 },
  { type: "Organization", text: "Acme Labs", start: 13, end: 22 },
  { type: "Person", text: "Ada", start: 24, end: 27 },
  { type: "Person", text: "Lin", start: 36, end: 39 },
];
for (const width of [1280, 390, 320])
  for (const theme of ["light", "dark"]) {
    test(`entity result summary and source navigation at ${width}px ${theme} (presentation fixture)`, async ({
      page,
      context,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      let calls = 0;
      page.on("request", (r) => {
        if (new URL(r.url()).pathname === "/api/utilities/interpret") calls++;
      });
      await page.goto("/tools/entity-extractor/");
      await page.locator("#color-theme").selectOption(theme);
      await page.locator("#source-text").fill(text);
      await fixturePlan(page, { entities });
      await page.locator("#extra-ask").click();
      await expect(page.locator("#entity-result-summary")).toHaveText(
        "3 name groups · 4 mentions · 2 categories",
      );
      await expect(page.locator(".entity-document")).toHaveText(text);
      await expect(page.locator(".entity-category h3").first()).toContainText(
        "3 mentions",
      );
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      if (width < 1100) {
        await expect(page.locator(".entity-document")).toBeInViewport();
        const positions = await page
          .locator(".entity-workspace")
          .evaluate((el) => ({
            source: el
              .querySelector(".entity-source-panel")
              .getBoundingClientRect().top,
            index: el.querySelector(".entity-index").getBoundingClientRect()
              .top,
          }));
        expect(positions.source).toBeLessThan(positions.index);
      }
      await page.screenshot({ path: info.outputPath("entity-result.png") });
      const before = calls;
      const occurrence = page.getByRole("button", {
        name: "Person Ada, occurrence 2",
        exact: true,
      });
      await occurrence.click();
      await expect(
        page.locator(".entity-document mark.is-current"),
      ).toBeFocused();
      await expect(page.locator(".entity-selection")).toContainText(
        "mention 2 of 2",
      );
      await page
        .getByRole("button", { name: "Back to matches", exact: true })
        .click();
      await expect(occurrence).toBeFocused();
      await page.setViewportSize({
        width: width === 1280 ? 320 : 1280,
        height: 844,
      });
      await expect(occurrence).toBeFocused();
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.locator("#extra-copy").click();
      const copied = JSON.parse(
        await page.evaluate(() => navigator.clipboard.readText()),
      );
      expect(copied).toEqual(entities);
      expect(calls).toBe(before);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width === 1280 ? 320 : 1280);
    });
  }
