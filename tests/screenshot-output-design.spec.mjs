import { test, expect } from "@playwright/test";
const image = new URL("./fixtures/screenshot-review-count.png", import.meta.url)
  .pathname;

test("unfocused OCR review flags remain visibly distinct in both themes and at all result widths", async ({
  page,
}) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/tools/screenshot-to-spreadsheet/");
  await page.locator("#screenshot-file").setInputFiles(image);
  await page.locator("#screenshot-run").click();
  const flagged = page.locator("#screenshot-table input.needs-review");
  await expect(flagged).toHaveCount(1, { timeout: 30000 });
  for (const width of [1280, 390, 320])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByLabel("Color theme").selectOption(theme);
      const style = await flagged.evaluate((el) => {
        const s = getComputedStyle(el),
          normal = getComputedStyle(
            document.querySelector(
              "#screenshot-table input:not(.needs-review)",
            ),
          );
        return {
          width: s.borderTopWidth,
          borderStyle: s.borderTopStyle,
          color: s.borderTopColor,
          normalColor: normal.borderTopColor,
        };
      });
      expect(style.width).toBe("2px");
      expect(style.borderStyle).toBe("dashed");
      expect(style.color).not.toBe(style.normalColor);
      await expect(
        flagged.locator("..").locator(".screenshot-review-cue"),
      ).toHaveText("Review");
    }
});

test("OCR result leads with the table and keyboard navigation reaches the flagged cell without changing exports", async ({
  page,
}, info) => {
  const api = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) {
      api.push(url.pathname);
      return route.abort();
    }
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/tools/screenshot-to-spreadsheet/");
  await page.locator("#screenshot-file").setInputFiles(image);
  await page.locator("#screenshot-run").click();
  await expect(page.locator("#screenshot-results")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator("#screenshot-results h2")).toHaveText(
    "Extracted table",
  );
  await expect(page.locator("#screenshot-copy")).toHaveClass(/primary/);
  await expect(
    page.locator("#screenshot-table tr:nth-child(2) input").first(),
  ).toBeInViewport();
  await expect(page.locator("#screenshot-copy")).toBeInViewport();
  const download = async () => {
    const event = page.waitForEvent("download");
    await page.locator("#screenshot-csv").click();
    const { readFile } = await import("node:fs/promises");
    return readFile(await (await event).path(), "utf8");
  };
  const originalCSV = await download();
  const flagged = page.locator("#screenshot-table input.needs-review");
  for (const width of [1280, 390, 320])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByLabel("Color theme").selectOption(theme);
      const next = page.getByRole("button", {
        name: "Review flagged cell",
        exact: true,
      });
      await next.focus();
      await next.press("Enter");
      await expect(flagged).toBeFocused();
      await expect(flagged).toBeInViewport();
      await expect(page.locator("#screenshot-overlay rect")).toHaveCount(1);
      await expect(page.locator("#screenshot-cell-crop")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`review-cell-${width}-${theme}.png`),
      });
    }
  expect(await download()).toBe(originalCSV);
  await flagged.fill(await flagged.inputValue());
  await expect(page.locator("#screenshot-review-next")).toBeHidden();
  await expect(page.locator(".screenshot-review-cue")).toHaveCount(0);
  await expect(page.locator("#screenshot-summary")).toContainText(
    "0 cells flagged for review",
  );
  await page.locator("#screenshot-clear").click();
  await expect(page.locator("#screenshot-results")).toBeHidden();
  await expect(page.locator("#screenshot-review-next")).toBeDisabled();
  expect(api).toEqual([]);
});
