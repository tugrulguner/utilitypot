import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
const image = new URL("./fixtures/screenshot-table.png", import.meta.url)
  .pathname;
test("real local OCR supports editable cells, source selection and exact spreadsheet exports", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60000);
  const api = [],
    errors = [];
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith("/api/")) {
      api.push(u.pathname);
      return route.abort();
    }
    if (!["127.0.0.1", "localhost"].includes(u.hostname)) return route.abort();
    return route.continue();
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/tools/screenshot-to-spreadsheet/");
  await page.locator("#screenshot-file").setInputFiles(image);
  await expect(page.locator("#screenshot-run")).toBeEnabled();
  await page.locator("#screenshot-run").click();
  await expect(page.locator("#screenshot-results")).toBeVisible({
    timeout: 30000,
  });
  const cells = page.locator("#screenshot-table input");
  await expect(cells).toHaveCount(16);
  await expect(
    page.getByRole("textbox", { name: "Row 2, column 1", exact: true }),
  ).toHaveValue("000123");
  await page
    .getByRole("textbox", { name: "Row 2, column 1", exact: true })
    .focus();
  await expect(page.locator("#screenshot-overlay rect")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Row 2, column 1", exact: true })
    .fill("000009");
  for (const theme of ["light", "dark"]) {
    await page.locator("#color-theme").selectOption(theme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator("#screenshot-copy")).toBeVisible();
      expect(
        await cells.first().evaluate((el) => el.getBoundingClientRect().width),
      ).toBeGreaterThanOrEqual(100);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: info.outputPath(`table-${width}-${theme}.png`),
      });
    }
  }
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#screenshot-copy").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "000009",
  );
  const download = page.waitForEvent("download");
  await page.locator("#screenshot-xlsx").click();
  const f = await download;
  const zip = unzipSync(new Uint8Array(await readFile(await f.path())));
  const xml = strFromU8(zip["xl/worksheets/sheet1.xml"]);
  expect(xml).toContain("000009");
  expect(xml).not.toContain("000123");
  expect(xml).toContain('t="inlineStr"');
  const literal = "_x005F_x000D_";
  await page
    .getByRole("textbox", { name: "Row 2, column 1", exact: true })
    .fill(literal);
  const literalDownload = page.waitForEvent("download");
  await page.locator("#screenshot-xlsx").click();
  const { readXlsx } = await import("../src/lib/utilities/xlsx-reader.js");
  const decoded = await readXlsx(
    new Uint8Array(await readFile(await (await literalDownload).path())),
  );
  expect(decoded.sheets[0].rows[1][0]).toBe(literal);
  await page
    .getByRole("textbox", { name: "Row 2, column 1", exact: true })
    .fill("=1+1");
  await page.getByText("Spreadsheet safety & formats", { exact: true }).click();
  await page.locator("#screenshot-protect").uncheck();
  await page.locator("#screenshot-copy").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "=1+1",
  );
  expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).not.toContain("'=1+1");
  await page
    .getByRole("textbox", { name: "Row 2, column 1", exact: true })
    .fill("a\tb");
  await page.locator("#screenshot-copy").click();
  await expect(page.locator("#screenshot-status")).toContainText(
    "Download XLSX",
  );
  await expect(page.locator("#screenshot-status")).toBeInViewport();
  expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).not.toContain("a\tb");
  const fallback = page.waitForEvent("download");
  await page.locator("#screenshot-xlsx").click();
  const fallbackZip = unzipSync(
    new Uint8Array(await readFile(await (await fallback).path())),
  );
  expect(strFromU8(fallbackZip["xl/worksheets/sheet1.xml"])).toContain("a\tb");
  await page.locator("#screenshot-clear").click();
  await expect(page.locator("#screenshot-results")).toBeHidden();
  await expect(page.locator("#screenshot-xlsx")).toBeDisabled();
  expect(api).toEqual([]);
  expect(errors).toEqual([]);
});

test("cancel interrupts real model initialization and replacement cannot revive output", async ({
  page,
  context,
}) => {
  test.setTimeout(45000);
  let release;
  const held = new Promise((resolve) => (release = resolve));
  let started;
  const observed = new Promise((resolve) => (started = resolve));
  await context.route("**/ocr/eng.traineddata.gz", async (route) => {
    started();
    await held;
    try {
      await route.continue();
    } catch {}
  });
  try {
    await page.goto("/tools/screenshot-to-spreadsheet/");
    await page.locator("#screenshot-file").setInputFiles(image);
    await page.locator("#screenshot-run").click();
    await observed;
    await page.locator("#screenshot-cancel").click();
    await expect(page.locator("#screenshot-status")).toContainText("cancelled");
    await expect(page.locator("#screenshot-run")).toBeEnabled();
    release();
    await expect(page.locator("#screenshot-results")).toBeHidden();
    await page.locator("#screenshot-file").setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("invalid"),
    });
    await expect(page.locator("#screenshot-run")).toBeDisabled();
    await expect(page.locator("#screenshot-results")).toBeHidden();
  } finally {
    release();
  }
});
