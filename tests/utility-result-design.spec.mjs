import { test, expect } from "@playwright/test";

for (const width of [1280, 390, 320]) {
  for (const theme of ["light", "dark"]) {
    test(`JSON conversion reveals actual data at ${width}px ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      let api = 0;
      page.on("request", (r) => {
        if (new URL(r.url()).pathname.startsWith("/api/")) api++;
      });
      await page.goto("/tools/json-to-csv/");
      await page.locator("#color-theme").selectOption(theme);
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole("button", { name: /^Load example:/ }).click();
      await page.locator("#extra-run").click();
      const result = page.locator("#extra-results");
      await expect(result.locator("td").first()).toHaveText("001");
      await page.waitForTimeout(500);
      const cell = await result.locator("td").first().boundingBox();
      expect(cell.y + cell.height).toBeLessThanOrEqual(844);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      await expect(result.locator("h2")).toBeInViewport();
      await expect(result).toBeFocused();
      expect(api).toBe(0);
      await page.screenshot({ path: info.outputPath("json-result.png") });
    });
  }
}
