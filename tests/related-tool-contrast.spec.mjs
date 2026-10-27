import { test, expect } from "@playwright/test";
import tools from "../src/data/tools.json" with { type: "json" };
import { guides } from "../src/data/discovery.js";

const slugs = tools.map(({ slug }) => slug);
const luminance = (rgb) => {
  const linear = rgb.map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};
const readContrast = async (link) => {
  const { foreground, background } = await link.evaluate((element) => {
    // Let Chromium resolve modern CSS color syntax into sRGB channels.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const parse = (color) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, alpha / 255];
    };
    const composite = (foreground, background) =>
      foreground
        .slice(0, 3)
        .map(
          (value, index) =>
            value * foreground[3] + background[index] * (1 - foreground[3]),
        );
    const ancestors = [];
    for (let current = element; current; current = current.parentElement)
      ancestors.unshift(current);
    let background = [255, 255, 255];
    for (const ancestor of ancestors)
      background = composite(
        parse(getComputedStyle(ancestor).backgroundColor),
        background,
      );
    return {
      foreground: composite(parse(getComputedStyle(element).color), background),
      background,
    };
  });
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
};

test.beforeEach(async ({ page }) => {
  await page.route("**/*posthog.com/**", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"status":1}',
        })
      : route.continue(),
  );
});

test("all registered tools have related links and sitemap entries", async ({
  request,
}) => {
  expect(Object.keys(guides).sort()).toEqual([...slugs].sort());
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBe(true);
  const xml = await response.text();
  for (const slug of slugs)
    expect(xml, `missing sitemap route for ${slug}`).toContain(
      `https://utilitypot.modepot.io/tools/${slug}/`,
    );
});

for (const mode of ["light", "dark", "auto"])
  test(`all registered related-tool links meet WCAG contrast in ${mode} mode`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({
      colorScheme: mode === "light" ? "dark" : "light",
    });
    await page.addInitScript(
      (theme) => localStorage.setItem("utilitypot-theme", theme),
      mode,
    );
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 850 });
      let count = 0;
      for (const slug of slugs) {
        await page.goto(`/tools/${slug}/`);
        await page.evaluate(() => document.fonts.ready);
        const links = page.locator("[data-related-tools] a");
        await expect(links).toHaveCount(guides[slug].related.length);
        count += await links.count();
        for (const link of await links.all())
          expect(
            await readContrast(link),
            `${slug} ${mode} ${width}px`,
          ).toBeGreaterThanOrEqual(4.5);
      }
      expect(count).toBe(
        slugs.reduce((sum, slug) => sum + guides[slug].related.length, 0),
      );
    }
  });

test("contrast measurement follows the painted ancestor rather than assuming body canvas", async ({
  page,
}) => {
  await page.goto("/tools/cron-explainer/");
  const link = page.locator("[data-related-tools] a").first();
  expect(await readContrast(link)).toBeGreaterThanOrEqual(4.5);
  await link.evaluate((element) => {
    element.parentElement.style.backgroundColor =
      getComputedStyle(element).color;
  });
  expect(await readContrast(link)).toBeCloseTo(1, 2);
});
