import { test, expect } from "@playwright/test";
import { verifyXlsxFidelity } from "./xlsx-fidelity.journey.mjs";
test("native XLSX fidelity preserves CDATA, missing cells and encoded text", async ({
  page,
}) => verifyXlsxFidelity(page));
import { readFile } from "node:fs/promises";
const fixture = (name) =>
  new URL("./fixtures/compare-" + name, import.meta.url).pathname;
test.beforeEach(async ({ context }) => {
  await context.route("**/*", (r) => {
    const u = new URL(r.request().url());
    return ["127.0.0.1", "localhost"].includes(u.hostname)
      ? r.continue()
      : r.abort();
  });
});
test("native CSV uploads produce exact changed/added/removed reports and invalidate on edit", async ({
  page,
}) => {
  const api = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url());
  });
  await page.goto("/tools/compare-spreadsheets/");
  await page.locator("#diff-before-file").setInputFiles(fixture("before.csv"));
  await page.locator("#diff-after-file").setInputFiles(fixture("after.csv"));
  await page.locator("#diff-key").selectOption("SKU");
  await page.locator("#diff-run").click();
  await expect(page.locator("#diff-counts")).toContainText("1 added");
  const event = page.waitForEvent("download");
  await page.locator("#diff-json").click();
  const data = JSON.parse(await readFile(await (await event).path(), "utf8"));
  expect(data.counts).toEqual({
    added: 1,
    removed: 1,
    changed: 1,
    unchanged: 1,
  });
  expect(data.rows.find((r) => r.key === "000123").changes).toContainEqual({
    column: "Quantity",
    before: "12",
    after: "13",
  });
  expect(data.rows.find((r) => r.key === "000456").before.Product).toBe(
    "Desk lamp",
  );
  const csv = page.waitForEvent("download");
  await page.locator("#diff-csv").click();
  expect(await readFile(await (await csv).path(), "utf8")).toContain(
    "Desk lamp",
  );
  await page.locator("#diff-filter").selectOption("changed");
  await expect(page.locator("#diff-rows")).toContainText("000123");
  await expect(page.locator("#diff-rows")).not.toContainText("000999");
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Color theme").selectOption(theme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 850 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
  }
  await page
    .locator("#diff-after")
    .fill("SKU,Product,Quantity\n000123,Notebook,14");
  await expect(page.locator("#diff-result")).toBeHidden();
  await expect(page.locator("#diff-json")).toBeDisabled();
  expect(api).toEqual([]);
});
test("native XLSX sheets preserve long numeric identifiers and formulas without cached-value coercion", async ({
  page,
}) => {
  await page.goto("/tools/compare-spreadsheets/");
  await page.locator("#diff-before-file").setInputFiles(fixture("before.xlsx"));
  await page.locator("#diff-after-file").setInputFiles(fixture("after.xlsx"));
  await expect(page.locator("#diff-before-sheet")).toBeVisible();
  await page.locator("#diff-before-sheet").selectOption({ label: "Inventory" });
  await page.locator("#diff-after-sheet").selectOption({ label: "Inventory" });
  await page.locator("#diff-key").selectOption("SKU");
  await page.locator("#diff-run").click();
  await expect(page.locator("#diff-counts")).toContainText("1 changed");
  const event = page.waitForEvent("download");
  await page.locator("#diff-json").click();
  const data = JSON.parse(await readFile(await (await event).path(), "utf8"));
  expect(data.counts).toEqual({
    added: 0,
    removed: 0,
    changed: 1,
    unchanged: 1,
  });
  expect(data.rows.some((r) => r.key === "900719925474099312345")).toBe(true);
  expect(data.rows.find((r) => r.key === "000123").before.Formula).toBe(
    "=SUM(C2:C3)",
  );
});

test("source edits clear ready feedback immediately and parsing errors never stay busy", async ({
  page,
}) => {
  await page.goto("/tools/compare-spreadsheets/");
  await page.locator("#diff-example").click();
  await page.locator("#diff-run").click();
  await expect(page.locator("#diff-status")).toContainText("Comparison ready");
  const immediate = await page.evaluate(() => {
    const input = document.querySelector("#diff-before");
    input.value = "SKU,SKU\n1,2";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return document.querySelector("#diff-status").textContent;
  });
  expect(immediate).not.toContain("Comparison ready");
  await expect(page.locator("#diff-error")).toBeVisible();
  await expect(page.locator("#diff-status")).not.toContainText("Reading");
  await expect(page.locator("#diff-run")).toBeDisabled();
});

test("native worker comparison preserves prototype-shaped key columns", async ({
  page,
}) => {
  await page.goto("/tools/compare-spreadsheets/");
  for (const key of ["__proto__", "constructor", "toString"]) {
    await page.locator("#diff-before").fill(`id,${key}\n1,x`);
    await page.locator("#diff-after").fill(`id,${key}\n1,x`);
    await page.locator("#diff-key").selectOption(key);
    await page.locator("#diff-run").click();
    await expect(page.locator("#diff-counts")).toContainText("1 unchanged");
    const event = page.waitForEvent("download");
    await page.locator("#diff-json").click();
    const out = JSON.parse(await readFile(await (await event).path(), "utf8"));
    expect(out.rows[0].key).toBe("x");
    expect(out.counts.unchanged).toBe(1);
  }
});
