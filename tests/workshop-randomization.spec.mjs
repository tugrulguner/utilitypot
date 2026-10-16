import { test, expect } from "@playwright/test";
import { projects, guides } from "../src/data/discovery.js";
const ids = ["dexpot", "lifepot", "refpot", "intpot", "summonpot"];
for (const theme of ["light", "dark"])
  for (const [index, id] of ids.entries())
    test(`workshop selects coherent ${id} card in ${theme} without rotating during use`, async ({
      page,
    }) => {
      await page.addInitScript(
        ({ draw, theme }) => {
          Math.random = () => draw;
          localStorage.setItem("utilitypot-theme", theme);
        },
        { draw: (index + 0.5) / ids.length, theme },
      );
      await page.goto("/tools/json-to-csv/");
      const card = page.locator("[data-project-showcase]");
      await expect(card).toHaveAttribute("data-workshop-selected", id);
      await expect(card.locator(".project-identity strong")).toHaveText(
        projects[id].name,
      );
      await expect(card.locator("[data-workshop-reason]")).toHaveText(
        projects[id].reason,
      );
      await expect(card.locator(".project-identity p")).toHaveText(
        projects[id].description,
      );
      await expect(card.locator(".project-cta")).toHaveAttribute(
        "href",
        projects[id].href,
      );
      await expect(card.locator(".project-cta")).toHaveAttribute(
        "data-discovery-destination",
        id,
      );
      await expect(card.locator(".project-cta")).toHaveClass(
        /ph-no-autocapture/,
      );
      const colour = await card
        .locator(".workshop-pot")
        .evaluate((e) => getComputedStyle(e).color);
      const target =
        theme === "dark" ? projects[id].accent : projects[id].lightAccent;
      const expected = target
        .slice(1)
        .match(/../g)
        .map((x) => parseInt(x, 16));
      expect(colour).toBe(`rgb(${expected.join(", ")})`);
      const contrast = await card.locator(".workshop-pot").evaluate((e) => {
        const luminance = (colour) =>
          colour
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        let p = e,
          bg = "rgb(255, 255, 255)";
        while (p) {
          const c = getComputedStyle(p).backgroundColor;
          if (c !== "rgba(0, 0, 0, 0)" && c !== "transparent") {
            bg = c;
            break;
          }
          p = p.parentElement;
        }
        const a = luminance(getComputedStyle(e).color),
          b = luminance(bg);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      await card.screenshot({
        path: test.info().outputPath(`workshop-${id}-${theme}.png`),
      });
      await page.getByRole("button", { name: /^Load example:/ }).click();
      await page.getByRole("button", { name: "Convert", exact: true }).click();
      await expect(page.locator("#extra-results")).toBeVisible();
      await page
        .locator("#color-theme")
        .selectOption(theme === "dark" ? "light" : "dark");
      await expect(card).toHaveAttribute("data-workshop-selected", id);
      await expect(card.locator(".project-cta")).toHaveAttribute(
        "href",
        projects[id].href,
      );
    });
test("all five sibling projects are eligible, never UtilityPot itself", () =>
  expect(Object.keys(projects)).toEqual(ids));
for (const slug of Object.keys(guides))
  test(`no-JavaScript workshop fallback remains coherent on ${slug}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(`/tools/${slug}/`);
      const p = projects[guides[slug].project];
      await expect(page.locator(".project-cta")).toHaveAttribute(
        "href",
        p.href,
      );
      await expect(page.locator(".project-identity strong")).toHaveText(p.name);
    } finally {
      await context.close();
    }
  });
