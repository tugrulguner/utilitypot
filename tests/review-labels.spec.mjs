import { test, expect } from "@playwright/test";

// A clear printed table whose real local OCR flags one cell. This tests the
// rendered review counter, not a stubbed recognition response.
test("OCR review count uses singular for one cell and plural after correction", async ({
  page,
}, info) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/tools/screenshot-to-spreadsheet/");
  await page
    .locator("#screenshot-file")
    .setInputFiles(
      new URL("./fixtures/screenshot-review-count.png", import.meta.url)
        .pathname,
    );
  await page.locator("#screenshot-run").click();
  await expect(page.locator("#screenshot-results")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator("#screenshot-table .needs-review")).toHaveCount(1);
  for (const [width, theme] of [
    [1280, "light"],
    [390, "dark"],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByLabel("Color theme").selectOption(theme);
    await expect(page.locator("#screenshot-summary")).toContainText(
      "1 cell flagged for review.",
    );
    await page.locator("#screenshot-summary").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`ocr-review-${width}-${theme}.png`),
    });
  }
  const flagged = page.locator("#screenshot-table .needs-review");
  await flagged.fill(await flagged.inputValue());
  await expect(page.locator("#screenshot-summary")).toContainText(
    "0 cells flagged for review.",
  );
});

test("unchanged report entries use neutral placeholders without masking real missing or blank cells", async ({
  page,
}, info) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/tools/compare-spreadsheets/");
  await page
    .locator("#diff-before")
    .fill("SKU,Note\nsame,keep\nblank,\nchanged,old\nremoved,gone");
  await page
    .locator("#diff-after")
    .fill("SKU,Note\nsame,keep\nblank,new\nchanged,new\nadded,present");
  await page.locator("#diff-key").selectOption("SKU");
  await page.locator("#diff-run").click();
  await expect(page.locator("#diff-result")).toBeVisible();
  await page.locator("#diff-filter").selectOption("all");
  const unchanged = page.locator('#diff-rows tr[data-status="unchanged"]');
  await expect(unchanged).toHaveCount(1);
  for (const [width, theme] of [
    [1280, "light"],
    [390, "dark"],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByLabel("Color theme").selectOption(theme);
    expect(await unchanged.locator("td").allTextContents()).toEqual([
      "unchanged",
      "same",
      "—",
      "—",
      "—",
    ]);
    await expect(
      page.locator('#diff-rows tr[data-status="added"] td').nth(3),
    ).toHaveText("∅ (missing)");
    await expect(
      page.locator('#diff-rows tr[data-status="removed"] td').nth(4),
    ).toHaveText("∅ (missing)");
    if (width === 1280) {
      const blank = page
        .locator('#diff-rows tr[data-status="changed"]')
        .filter({
          has: page.getByRole("cell", { name: "blank", exact: true }),
        });
      await expect(blank.locator("td").nth(3)).toHaveText("(blank)");
      await unchanged.scrollIntoViewIfNeeded();
    } else {
      const card = page.locator('.diff-record[data-status="unchanged"]');
      await expect(card).toContainText("No changes in this row.");
      await expect(card).not.toContainText("∅ (missing)");
      await expect(
        page.locator('.diff-record[data-status="added"] dd').first(),
      ).toHaveText("∅ (missing)");
      await expect(
        page.locator('.diff-record[data-status="removed"] dd').nth(1),
      ).toHaveText("∅ (missing)");
      await expect(
        page.locator('.diff-record[data-key="blank"] dd').first(),
      ).toHaveText("(blank)");
      await card.scrollIntoViewIfNeeded();
    }
    await page.screenshot({
      path: info.outputPath(`unchanged-${width}-${theme}.png`),
    });
  }
  const jsonDownload = page.waitForEvent("download");
  await page.locator("#diff-json").click();
  const { readFile } = await import("node:fs/promises");
  const report = JSON.parse(
    await readFile(await (await jsonDownload).path(), "utf8"),
  );
  const row = report.rows.find((row) => row.key === "same");
  expect(row.before).toEqual({ SKU: "same", Note: "keep" });
  expect(row.after).toEqual(row.before);
  const csvDownload = page.waitForEvent("download");
  await page.locator("#diff-csv").click();
  const csv = await readFile(await (await csvDownload).path(), "utf8");
  const { exportCsv } =
    await import("../src/lib/utilities/spreadsheet-diff.js");
  expect(csv).toBe(exportCsv(report));
  expect(csv).not.toContain("—");
});
