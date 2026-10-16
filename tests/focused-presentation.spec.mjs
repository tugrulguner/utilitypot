import { test, expect } from "@playwright/test";
const tools = [
  ["csv-to-nested-json", "local"],
  ["fix-excel-dates", "local"],
  ["meeting-time-finder", "local"],
  ["json-to-csv", "local"],
  ["entity-extractor", "ai"],
  ["text-to-mermaid", "ai"],
  ["ask-a-webpage", "ai"],
];
for (const [slug, processing] of tools)
  for (const width of [390, 900, 1280]) {
    test(`${width}px ${slug}: fixed workflow and readable first action`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/tools/${slug}/`);
      const root = page.locator(".utility-app");
      await expect(root).toHaveAttribute("data-processing", processing);
      const primary = root.locator("button.primary:visible");
      await expect(primary).toHaveCount(1);
      await expect(primary).toBeEnabled();
      const box = await primary.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y + box.height).toBeLessThan(width < 700 ? 1150 : 850);
      await expect(
        root.getByText(/AI optional|manual mode|with Jev/i),
      ).toHaveCount(0);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      expect(overflow).toBe(false);
    });
  }
test("semantic prose inputs use the readable body font, not a code editor", async ({
  page,
}) => {
  await page.goto("/tools/entity-extractor/");
  const fonts = await page.locator("#source-text").evaluate((e) => ({
    input: getComputedStyle(e).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
  }));
  expect(fonts.input).toBe(fonts.body);
});
