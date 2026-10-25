import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { sourceAnswerFixture } from "./helpers/source-answer-fixture.mjs";

const source = "Returns are accepted within 30 days.";

async function contrast(element) {
  const colors = await element.evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const parse = (value) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const composite = (fg, bg) =>
      fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
    const ancestors = [];
    for (let node = el; node; node = node.parentElement)
      ancestors.unshift(node);
    let background = [255, 255, 255];
    for (const node of ancestors)
      background = composite(
        parse(getComputedStyle(node).backgroundColor),
        background,
      );
    return [
      composite(parse(getComputedStyle(el).color), background),
      background,
    ];
  });
  const luminances = colors
    .map((rgb) => {
      const linear = rgb.map((channel) => {
        channel /= 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    })
    .sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

for (const width of [1280, 390, 320]) {
  for (const theme of ["light", "dark"]) {
    test(`answer result has a distinct, immediately usable hierarchy at ${width}px ${theme}`, async ({
      page,
      context,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      let requests = 0;
      await page.route("**/api/utilities/interpret", (route) => {
        requests++;
        return route.fulfill({
          json: sourceAnswerFixture(
            route.request().postDataJSON().input,
            {
              source: "jev",
              model: "PRESENTATION FIXTURE — NOT LIVE",
              confidence: { answerability: 0.8 },
              plan: {
                status: "answered",
                excerpts: [
                  {
                    id: "one",
                    start: 0,
                    end: source.length,
                    text: source,
                    role: "direct",
                  },
                ],
              },
            },
            source,
          ),
        });
      });
      await page.goto("/tools/ask-a-webpage/");
      await page.locator("#color-theme").selectOption(theme);
      await page.locator("#source-text").fill(source);
      await page.locator("#instructions").fill("What is the return window?");
      await page.locator("#extra-ask").click();
      const result = page.locator("#extra-results");
      const lead = result.locator(".answer-lead");
      await expect(lead.locator(".answer-text")).toHaveText(source);
      await expect(page.locator("#extra-status")).toBeHidden();
      await page.waitForTimeout(500); // Inspect the settled real result reveal, not a forced test scroll.
      await page.screenshot({ path: info.outputPath("answer-result.png") });
      const style = await result.evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        border: parseFloat(getComputedStyle(el).borderTopWidth),
        mainSize: parseFloat(
          getComputedStyle(el.querySelector(".answer-lead .answer-paragraph"))
            .fontSize,
        ),
        accent: parseFloat(
          getComputedStyle(el.querySelector(".answer-lead"))
            .borderInlineStartWidth,
        ),
        order: [
          ".answer-lead",
          ".reader-result-toolbar",
          ".source-answer-header",
          ".answer-sources",
          ".answer-processing",
        ]
          .map((selector) => ({ selector, node: el.querySelector(selector) }))
          .map(
            (item, index, all) =>
              index === 0 ||
              Boolean(
                all[index - 1].node.compareDocumentPosition(item.node) &
                Node.DOCUMENT_POSITION_FOLLOWING,
              ),
          ),
      }));
      expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(style.border).toBeGreaterThanOrEqual(1);
      expect(style.accent).toBeGreaterThanOrEqual(3);
      expect(style.mainSize).toBeGreaterThanOrEqual(18);
      expect(style.mainSize).toBeLessThanOrEqual(22);
      expect(style.order.every(Boolean)).toBe(true);
      for (const selector of [
        ".answer-lead .answer-paragraph",
        ".answer-citation",
        ".answer-meta-label",
        "#extra-copy",
        "#extra-download",
      ]) {
        expect(
          await contrast(result.locator(selector).first()),
          selector,
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const selector of [
        ".reader-answer-heading",
        ".answer-lead",
        "#extra-copy",
        "#extra-download",
      ]) {
        const box = await result.locator(selector).boundingBox();
        expect(box.y, selector).toBeGreaterThanOrEqual(8);
        expect(box.y + box.height, selector).toBeLessThanOrEqual(844);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(result).toBeFocused();
      await expect(result.locator(".answer-sources")).not.toHaveAttribute(
        "open",
        "",
      );
      await expect(result.locator(".answer-processing")).not.toHaveAttribute(
        "open",
        "",
      );
      // Editing/re-running must not discard or duplicate the moved action controls.
      await page
        .locator("#instructions")
        .fill("How long do I have to return it?");
      await expect(result).toBeHidden();
      await expect(page.locator("#extra-copy")).toHaveCount(1);
      await expect(page.locator("#extra-download")).toHaveCount(1);
      await page.locator("#extra-ask").click();
      await expect(result.locator(".answer-lead .answer-text")).toHaveText(
        source,
      );
      await expect(page.locator("#extra-copy")).toHaveCount(1);
      await expect(
        result.locator(".reader-result-toolbar #extra-copy"),
      ).toBeVisible();
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: new URL(page.url()).origin,
      });
      await page.locator("#extra-copy").click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      const downloadEvent = page.waitForEvent("download");
      await page.locator("#extra-download").click();
      const download = await downloadEvent;
      expect(await readFile(await download.path(), "utf8")).toBe(copied);
      expect(copied).toContain(source);
      expect(requests).toBe(2);
    });
  }
}
