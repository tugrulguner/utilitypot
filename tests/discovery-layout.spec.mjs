import { test, expect } from "@playwright/test";

for (const width of [1280, 1050]) {
  test(`discovery is beside inputs, not above the task, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tools/entity-extractor/");
    const input = await page.locator("#source-text").boundingBox();
    const rail = await page.locator(".discovery-rail").boundingBox();
    expect(input).not.toBeNull();
    expect(rail).not.toBeNull();
    expect(input.y).toBeLessThan(450);
    expect(rail.y).toBeGreaterThan(160);
    expect(rail.y).toBeLessThan(400);
    expect(rail.x).toBeGreaterThan(input.x + input.width);
    const action = await page.locator("#extra-ask").boundingBox();
    expect(action.y + action.height).toBeLessThan(850);
    await expect(page.locator(".family-card")).toBeVisible();
    await expect(
      rail &&
        page
          .locator(".discovery-rail")
          .getByRole("link", { name: "Explore ModePot", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(".discovery-rail")
        .getByRole("link", { name: "About Tugrul", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "From the ModePot workshop",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".project-cta")).toHaveAttribute(
      "href",
      "https://summonpot.modepot.io/",
    );
    await expect(page.locator(".partner-card")).toHaveCount(0);
    await expect(page.locator('a[href*="circlesandcookies"]')).toHaveCount(0);
    for (const link of await page
      .locator(".discovery-rail [data-discovery-destination]")
      .all())
      await expect(link).toHaveClass(/ph-no-autocapture/);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth),
    ).toBe(true);
  });
}
for (const theme of ["light", "dark"]) {
  test(`discovery action text is readable in ${theme} mode`, async ({
    page,
  }) => {
    await page.goto("/tools/entity-extractor/");
    await page.locator("#color-theme").selectOption(theme);
    const contrasts = await page
      .locator(".discovery-cta,.project-cta")
      .evaluateAll((links) => {
        const luminance = (s) => {
          const c = s
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
          return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
        };
        return links.map((a) => {
          const s = getComputedStyle(a),
            x = luminance(s.color),
            y = luminance(s.backgroundColor);
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        });
      });
    expect(contrasts).toHaveLength(3);
    for (const ratio of contrasts) expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
}
test("mobile cards follow tool and essential result actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/json-to-csv/");
  await page.locator("#source-text").fill('[{"name":"Nora","hours":2}]');
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-results")).toBeVisible();
  const copy = await page.locator("#extra-copy").boundingBox(),
    rail = await page.locator(".discovery-rail").boundingBox();
  expect(rail.y).toBeGreaterThan(copy.y + copy.height);
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
});
