import { test, expect } from "@playwright/test";
import tools from "../src/data/tools.json" with { type: "json" };
import { guides } from "../src/data/discovery.js";

const slugs = tools.map(({ slug }) => slug);
const luminance = (color) => {
  const rgb = color
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number);
  const linear = rgb.map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
};

test("all registered tools have related links and sitemap entries", async ({
  request,
}) => {
  expect(Object.keys(guides).sort()).toEqual([...slugs].sort());
  const xml = await (await request.get("/sitemap.xml")).text();
  for (const slug of slugs)
    expect(xml, `missing sitemap route for ${slug}`).toContain(
      `https://utilitypot.modepot.io/tools/${slug}/`,
    );
});

for (const mode of ["light", "dark", "auto"])
  test(`all 16 related-tool links meet WCAG contrast in ${mode} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({
      colorScheme: mode === "light" ? "dark" : "light",
    });
    await page.addInitScript(
      (theme) => localStorage.setItem("utilitypot-theme", theme),
      mode,
    );
    let count = 0;
    for (const slug of slugs) {
      await page.goto(`/tools/${slug}/`);
      const links = page.locator("[data-related-tools] a");
      const n = await links.count();
      count += n;
      for (const link of await links.all()) {
        const { color, background } = await link.evaluate((element) => ({
          color: getComputedStyle(element).color,
          background: getComputedStyle(document.body).backgroundColor,
        }));
        expect(
          contrast(color, background),
          `${slug}: ${color} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(count).toBe(16);
  });
