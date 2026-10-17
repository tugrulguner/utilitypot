import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
for (const width of [1280, 390, 320])
  test(`meeting starts with cities, not a wall of availability fields at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tools/meeting-time-finder/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".participant-hours")).toHaveCount(2);
    await expect(
      page.locator(".participant input[type=time]:visible"),
    ).toHaveCount(0);
    await expect(page.locator("#p0-start")).toHaveValue("09:00");
    await expect(page.locator("#p0-end")).toHaveValue("17:00");
    await expect(
      page.locator(".participant-hours").first().locator("summary").first(),
    ).toContainText("09:00–17:00");
    const box = await page.locator("#run").boundingBox();
    expect(box.y + box.height).toBeLessThan(950);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator("#meeting-date").fill("2026-10-29");
    await page.locator("#p0-zone").fill("London");
    await page.locator("#p1-zone").fill("New York");
    await page.locator("#run").click();
    await expect(page.locator("#results")).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`meeting-result-${width}.png`),
      fullPage: true,
    });
  });
test("custom hours, names and exclusions remain editable and invalidate prior result", async ({
  page,
}) => {
  await page.goto("/tools/meeting-time-finder/");
  await page
    .locator(".participant-hours")
    .first()
    .locator("summary")
    .first()
    .click();
  await expect(page.locator("#p0-start")).toBeVisible();
  await page.locator("#p0-start").fill("10:00");
  await page.locator("#p0-end").fill("18:00");
  await expect(
    page.locator(".participant-hours").first().locator("summary").first(),
  ).toContainText("10:00–18:00");
  await page.locator("#add-person").click();
  await expect(page.locator(".participant")).toHaveCount(3);
  await expect(page.locator("#p2-start")).toHaveValue("09:00");
  await expect(page.locator(".participant-hours").last()).toHaveJSProperty(
    "open",
    false,
  );
});
