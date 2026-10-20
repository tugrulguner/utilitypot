import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const tools = JSON.parse(
  await readFile(new URL("../src/data/tools.json", import.meta.url), "utf8"),
);
test("rendered identity attribution is cool-colored while the UtilityPot flask stays rose", async ({
  page,
}) => {
  await page.goto("/");
  const rows = await page.evaluate(async () => {
    const rows = [];
    for (const [src, y] of [
      ["/utilitypot-lockup-v2.png", 255],
      ["/utilitypot-social-v2.png", 120],
    ]) {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const c = canvas.getContext("2d");
      c.drawImage(image, 0, 0);
      const p = c.getImageData(515, y, 600, 50).data;
      let cool = 0,
        warm = 0;
      for (let i = 0; i < p.length; i += 4) {
        if (p[i] < 130 && p[i + 1] > 150 && p[i + 2] > 180) cool++;
        if (p[i] > 180 && p[i + 1] > 100 && p[i + 2] < 120) warm++;
      }
      rows.push({
        src,
        cool,
        warm,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    }
    return rows;
  });
  for (const r of rows) {
    expect(r.cool, r.src).toBeGreaterThan(50);
    expect(r.warm, r.src).toBe(0);
    expect(r.width).toBe(1200);
  }
  await expect(page.locator(".product-art")).toHaveCSS("filter", "none");
});
for (const width of [1280, 1050, 768, 390, 320])
  for (const theme of ["light", "dark", "auto"])
    test(`public feedback/social privacy and preserved identity at ${width}px ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({
        colorScheme: theme === "dark" ? "light" : "dark",
      });
      let calls = 0;
      await page.route("**/api/utilities/interpret", (route) => {
        calls++;
        return route.abort();
      });
      for (const [index, path] of [
        "/",
        ...tools.map((t) => `/tools/${t.slug}/`),
      ].entries()) {
        await page.goto(path + "?private=DO_NOT_TRANSFER#PRIVATE_FRAGMENT");
        await page
          .getByLabel("Color theme", { exact: true })
          .selectOption(theme);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator(".utility-header .brand strong")).toHaveCSS(
          "color",
          theme !== "light" ? "rgb(242, 140, 190)" : "rgb(143, 40, 97)",
        );
        const coordinate = page.locator(
          ".utility-main .hero-copy > .coordinate",
        );
        if (await coordinate.count())
          expect(
            await coordinate.evaluate((e) => {
              const p = document.createElement("span");
              p.style.color = "var(--cyan)";
              e.append(p);
              const expected = getComputedStyle(p).color;
              p.remove();
              return getComputedStyle(e).color === expected;
            }),
          ).toBe(true);
        const footerFeedback = page.locator(".utility-footer .feedback-link a");
        await expect(footerFeedback).toHaveCount(1);
        const u = new URL(await footerFeedback.getAttribute("href"));
        expect(u.origin + u.pathname).toBe(
          "https://github.com/tugrulguner/utilitypot/issues/new",
        );
        expect(u.searchParams.get("body")).toContain(
          "https://utilitypot.modepot.io/",
        );
        if (index > 0) expect(u.searchParams.get("body")).not.toContain(path);
        expect(u.href).not.toContain("DO_NOT_TRANSFER");
        expect(u.href).not.toContain("PRIVATE_FRAGMENT");
        await expect(footerFeedback).toHaveAttribute("target", "_blank");
        await expect(footerFeedback).toHaveAttribute(
          "rel",
          "noopener noreferrer",
        );
        await expect(
          page.locator(".utility-main > .utility-support"),
        ).toHaveCount(0);
        await expect(page.locator(".utility-main .feedback-link")).toHaveCount(
          0,
        );
        if (index > 0) {
          const reports = page.locator(
            'a[data-tool-feedback="result"], a[data-tool-feedback="error"]',
          );
          await expect(reports).toHaveCount(2);
          for (const report of await reports.all()) {
            const href = await report.getAttribute("href");
            expect(href).toMatch(
              /^https:\/\/github\.com\/tugrulguner\/utilitypot\/issues\/new\?/,
            );
            expect(href).not.toContain("DO_NOT_TRANSFER");
            expect(href).not.toContain("PRIVATE_FRAGMENT");
            expect(href).not.toContain("secret");
            await expect(report).toHaveAttribute("target", "_blank");
            await expect(report).toHaveAttribute("rel", "noopener noreferrer");
            const body = new URL(href).searchParams.get("body");
            expect(body).toContain("https://utilitypot.modepot.io" + path);
            expect(body).not.toContain("DO_NOT_TRANSFER");
            expect(body).not.toContain("PRIVATE_FRAGMENT");
          }
          await expect(
            page.locator('[data-tool-feedback="result"]'),
          ).toBeHidden();
          await expect(
            page.locator('[data-tool-feedback="error"]'),
          ).toBeHidden();
        }
        const menu = page.locator("#family-menu-toggle");
        let nav = page.locator(".family-nav");
        if (await menu.isVisible()) {
          await menu.click();
          nav = page.locator("#family-menu");
        }
        expect(
          (await nav.locator("a").allTextContents())
            .slice(0, 4)
            .map((t) => t.trim()),
        ).toEqual(["ModePot", "GitHub", "Community", "About Tugrul"]);
        await expect(
          page.locator(
            '.utility-header a[href*="linkedin.com"], .utility-header a[href*="x.com/"]',
          ),
        ).toHaveCount(0);
        if (await menu.isVisible()) await page.keyboard.press("Escape");
        const credit = page
          .locator(
            index === 0
              ? ".utility-main .creator-row"
              : ".utility-footer .creator-row",
          )
          .first();
        await expect(credit).toContainText("Tugrul Guner");
        const socials = credit.locator(".creator-social-links a");
        await expect(socials).toHaveText(["GitHub", "LinkedIn", "X"]);
        const hrefs = [
          "https://github.com/tugrulguner",
          "https://www.linkedin.com/in/tugrulguner/",
          "https://x.com/Tugrul_Guner",
        ];
        for (let i = 0; i < 3; i++) {
          const a = socials.nth(i);
          await expect(a).toHaveAttribute("href", hrefs[i]);
          await expect(a).toHaveAttribute("target", "_blank");
          await expect(a).toHaveAttribute("rel", "noopener noreferrer");
          await a.scrollIntoViewIfNeeded();
          const box = await a.boundingBox();
          expect(box.width).toBeGreaterThan(0);
          expect(box.height).toBeGreaterThanOrEqual(44);
          await expect(a).toHaveCSS("font-size", "15px");
          await expect(a).toHaveCSS("font-weight", "400");
          await expect(a).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
          await a.focus();
          await expect(a).toBeFocused();
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (index === 0 || path === "/tools/ask-a-webpage/") {
          await page.evaluate(() => document.activeElement?.blur());
          await page.screenshot({
            path: info.outputPath(
              `${index === 0 ? "home" : "qa"}-${width}-${theme}.png`,
            ),
            fullPage: false,
          });
        }
      }
      expect(calls).toBe(0);
    });
