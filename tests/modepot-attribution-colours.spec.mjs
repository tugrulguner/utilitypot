import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

const colours = {
  light: ["006b8f", "6f3d9b", "16634b"],
  dark: ["66d9ff", "a987ff", "77e5bd"],
};
const lum = (rgb) =>
  rgb
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
for (const width of [1280, 390])
  test(`coordinated ModePot attribution stays distinct and legible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tools/json-to-csv/");
    const brand = page.locator(".discovery-brand");
    await expect(brand).toHaveText("modepot");
    await expect(brand.locator("img")).toHaveAttribute(
      "src",
      "/modepot-mark.svg?v=multicolour-1",
    );
    const bytes = await (
      await page.request.get("/modepot-mark.svg?v=multicolour-1")
    ).body();
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "ea58a6d4df5ed88aee93e7cdff532f7b697e64fc97310552cbb3f4ed578f6f1c",
    );
    for (const theme of ["light", "dark"]) {
      await page.locator("#color-theme").selectOption(theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const actual = await brand.evaluate((el) => ({
        background: getComputedStyle(el.closest(".family-card"))
          .backgroundColor,
        gradient: getComputedStyle(el.querySelector("strong")).backgroundImage,
      }));
      expect(actual.gradient).toContain("linear-gradient");
      const bg = actual.background
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
      const palette = colours[theme].map((hex) =>
        hex.match(/../g).map((v) => parseInt(v, 16)),
      );
      for (let segment = 0; segment < 2; segment++)
        for (let step = 0; step <= 10; step++) {
          const t = step / 10;
          const rgb = palette[segment].map(
            (v, i) => v * (1 - t) + palette[segment + 1][i] * t,
          );
          const a = lum(rgb),
            b = lum(bg);
          expect(
            (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          ).toBeGreaterThanOrEqual(4.5);
        }
    }
  });
