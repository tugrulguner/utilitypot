import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  parseCsv,
  compareTables,
  exportCsv,
} from "../src/lib/utilities/spreadsheet-diff.js";
// Synthetic UI qualification must not send documents or analytics off origin.
const apiRequests = new WeakMap();
test.beforeEach(async ({ page, context }) => {
  const requests = [];
  apiRequests.set(page, requests);
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      requests.push(request.url());
  });
  await context.route("**/*", (route) =>
    ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
});
test.afterEach(async ({ page }) => {
  expect(apiRequests.get(page)).toEqual([]);
});
const before =
  "id,name,quantity,note\n001,Old name,12,\n002,Same,3,ok\n003,Removed,4,\n__proto__,Prototype,1,old\n005,Sparse,8";
const after =
  "id,name,quantity,note\n001,New name,14,\n002,Same,3,ok\n004,Added,5,\n__proto__,Prototype,2,\n005,Sparse,8,";
async function compare(page, a = before, b = after) {
  await page.goto("/tools/compare-spreadsheets/");
  await page.locator("#diff-before").fill(a);
  await page.locator("#diff-after").fill(b);
  await page.locator("#diff-key").selectOption("id");
  await page.locator("#diff-run").click();
  await expect(page.locator("#diff-result")).toBeVisible();
}
for (const width of [1280, 390, 320])
  for (const theme of ["light", "dark"])
    test(`row-grouped differences keep identity and paired values readable ${width} ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await compare(page);
      await page.getByLabel("Color theme").selectOption(theme);
      await expect(page.locator("#diff-filter")).toHaveValue("changes");
      await expect(page.locator("#diff-records .diff-record")).toHaveCount(5);
      if (width < 651) {
        await expect(page.locator("#diff-table-wrap")).toBeHidden();
        const row = page.locator('.diff-record[data-key="001"]');
        await expect(
          row.getByRole("heading", { name: "id: 001", exact: true }),
        ).toBeVisible();
        await expect(row.locator(".diff-field")).toHaveCount(2);
        await expect(
          row.getByText("Old name", { exact: true }),
        ).toBeInViewport();
        await expect(
          row.getByText("New name", { exact: true }),
        ).toBeInViewport();
        const sparse = page.locator('.diff-record[data-key="005"]');
        await expect(sparse).toContainText("∅ (missing)");
        await expect(sparse).toContainText("(blank)");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      } else {
        await expect(page.locator("#diff-records")).toBeHidden();
        await expect(
          page.locator('#diff-rows tr[data-group-start="true"]'),
        ).toHaveCount(5);
      }
      await page.locator("#diff-result").screenshot({
        path: info.outputPath(`differences-${width}-${theme}.png`),
      });
      const expected = compareTables(parseCsv(before), parseCsv(after), "id");
      const download = async (id) => {
        const event = page.waitForEvent("download");
        await page.locator(id).click();
        return readFile(await (await event).path(), "utf8");
      };
      expect(JSON.parse(await download("#diff-json"))).toEqual(expected);
      expect(await download("#diff-csv")).toBe(exportCsv(expected));
      await page.locator("#diff-filter").selectOption("unchanged");
      await expect(page.locator("#diff-records .diff-record")).toHaveCount(1);
      await expect(page.locator("#diff-records")).toContainText(
        "No changes in this row.",
      );
      expect(await download("#diff-csv")).toBe(exportCsv(expected));
      await page.locator("#diff-filter").selectOption("all");
      await expect(page.locator("#diff-records .diff-record")).toHaveCount(6);
      await page.locator("#diff-before").fill("id,name\n1,Changed");
      await expect(page.locator("#diff-result")).toBeHidden();
      await expect(page.locator("#diff-json")).toBeDisabled();
    });

test("group pagination is bounded and never loses or splits a record's changed fields", async ({
  page,
}) => {
  const a =
    "id,quantity,note\n" +
    Array.from(
      { length: 105 },
      (_, i) => `${String(i).padStart(3, "0")},${i},old ${i}`,
    ).join("\n");
  const b =
    "id,quantity,note\n" +
    Array.from(
      { length: 105 },
      (_, i) => `${String(i).padStart(3, "0")},${i + 1},new ${i}`,
    ).join("\n");
  await compare(page, a, b);
  await expect(page.locator("#diff-page")).toHaveText(
    "Page 1 of 3 · 105 rows · 210 report entries",
  );
  await expect(page.locator("#diff-records .diff-record")).toHaveCount(50);
  await expect(
    page.locator('#diff-records .diff-record[data-key="049"] .diff-field'),
  ).toHaveCount(2);
  await page.locator("#diff-next").click();
  await expect(page.locator("#diff-page")).toContainText("Page 2 of 3");
  await expect(
    page.locator("#diff-records .diff-record").first(),
  ).toHaveAttribute("data-key", "050");
  await page.locator("#diff-next").click();
  await expect(page.locator("#diff-records .diff-record")).toHaveCount(5);
  await expect(
    page.locator("#diff-records .diff-record").first(),
  ).toHaveAttribute("data-key", "100");
  await expect(page.locator("#diff-next")).toBeDisabled();
  const event = page.waitForEvent("download");
  await page.locator("#diff-csv").click();
  expect(await readFile(await (await event).path(), "utf8")).toBe(
    exportCsv(compareTables(parseCsv(a), parseCsv(b), "id")),
  );
  await page.locator("#diff-previous").click();
  await expect(page.locator("#diff-page")).toContainText("Page 2 of 3");
});

test("a wide record stays complete while no-change and column-only results remain explicit", async ({
  page,
}) => {
  const fields = Array.from({ length: 150 }, (_, i) => `field${i}`),
    header = ["id", ...fields].join(",");
  const a =
    header +
    "\nwide," +
    fields.map(() => "old").join(",") +
    "\ntail," +
    fields.map(() => "same").join(",");
  const b =
    header +
    "\nwide," +
    fields.map(() => "new").join(",") +
    "\ntail," +
    fields.map((_, i) => (i === 0 ? "changed" : "same")).join(",");
  await compare(page, a, b);
  await expect(page.locator("#diff-page")).toContainText("Page 1 of 2");
  await expect(page.locator("#diff-rows tr")).toHaveCount(150);
  await expect(page.locator("#diff-records .diff-record")).toHaveCount(1);
  await expect(page.locator(".diff-field")).toHaveCount(150);
  await page.locator("#diff-next").click();
  await expect(
    page.locator("#diff-records .diff-record").first(),
  ).toHaveAttribute("data-key", "tail");
  await expect(page.locator(".diff-field")).toHaveCount(1);
  await compare(page, "id,value\n001,same", "id,value\n001,same");
  await expect(page.locator("#diff-empty")).toHaveText(
    "No changed rows. Choose All rows to inspect unchanged records.",
  );
  await page.locator("#diff-filter").selectOption("all");
  await expect(page.locator("#diff-empty")).toBeHidden();
  await expect(page.locator("#diff-records")).toContainText("id: 001");
  await compare(page, "id,old", "id,new");
  await expect(page.locator("#diff-columns")).toBeVisible();
  await expect(page.locator("#diff-columns")).toHaveText(
    "Added columns: new · Removed columns: old",
  );
});
