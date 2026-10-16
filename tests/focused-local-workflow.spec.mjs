import { test, expect } from "@playwright/test";

test("CSV grouping exposes inspectable child rows and one local action", async ({
  page,
}) => {
  await page.goto("/tools/csv-to-nested-json/");
  await expect(page.locator("#ask-jev")).toHaveCount(0);
  await expect(page.locator("#csv-intent")).toHaveCount(0);
  await page
    .locator("#csv-input")
    .fill("Customer,Name,SKU,Qty\n001,Ada,A01,2\n001,Ada,A02,3\n002,Lin,B01,1");
  await page.locator("#group-by").selectOption("Customer");
  await page.locator("#run").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#results")).toBeFocused();
  await expect(page.locator("#result-view")).toContainText("A01");
  await expect(page.locator("#result-view")).toContainText("A02");
  await expect(page.locator("#result-view")).toContainText("002");
});

test("date review filtering hides rows without changing full CSV export", async ({
  page,
}) => {
  await page.goto("/tools/fix-excel-dates/");
  await expect(page.locator("#ask-jev")).toHaveCount(0);
  await expect(page.locator("#date-context")).toHaveCount(0);
  await page.locator("#dates-input").fill("25/03/2026\n03/04/2026\nnot-a-date");
  await page.locator("#run").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#result-view")).toContainText("not-a-date");
  await expect(page.locator("#date-filter")).toBeVisible();
  await page.locator("#date-filter").selectOption("attention");
  await expect(
    page.locator("#result-view tbody tr").filter({ hasText: "25/03/2026" }),
  ).toBeHidden();
  await expect(
    page.locator("#result-view tbody tr").filter({ hasText: "not-a-date" }),
  ).toBeVisible();
  await expect(page.locator("#result-view")).toContainText("not-a-date");
  await page.evaluate(() => {
    window.__clickedDownload = "";
    const original = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      window.__downloadBlob = blob;
      return original(blob);
    };
  });
  await page.locator("#download").click();
  const exported = await page.evaluate(
    async () => await window.__downloadBlob.text(),
  );
  expect(exported).toContain("25/03/2026");
  expect(exported).toContain("not-a-date");
});

test("meeting results navigate participant comparisons and preserve local exclusions", async ({
  page,
}) => {
  await page.goto("/tools/meeting-time-finder/");
  await expect(page.locator("#availability-mode")).toHaveCount(0);
  await page.locator("#load-example").click();
  await page.locator("#run").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#result-view")).toContainText(
    "Selected meeting time",
  );
  await expect(page.locator("#result-view")).toContainText("London");
  await expect(page.locator("#result-view")).toContainText("India");
  await expect(page.locator("#slot-choice")).toBeVisible();
});

test("deterministic local tools make no interpretation requests", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/utilities/interpret"))
      requests.push(request.url());
  });
  await page.goto("/tools/fix-excel-dates/");
  await page.locator("#dates-input").fill("2026-03-25");
  await page.locator("#run").click();
  expect(requests).toEqual([]);
});

test("custom mapping preserves the chosen grouping column and exact child values", async ({
  page,
}) => {
  await page.goto("/tools/csv-to-nested-json/");
  await page
    .locator("#csv-input")
    .fill("Customer,SKU,Qty\n001,A01,2\n001,A02,3");
  await page.locator("#group-by").selectOption("Customer");
  await page
    .getByText("Output structure and custom field mapping", { exact: true })
    .click();
  await page.locator("#custom-schema").check();
  await page
    .locator("#json-example")
    .fill('{"customer":"001","items":[{"sku":"A01","quantity":"2"}]}');
  await page.locator("#prepare").click();
  await expect(page.locator("#group-by")).toHaveValue("Customer");
  await page.locator("#map-0").selectOption("Customer");
  await page.locator("#map-1").selectOption("SKU");
  await page.locator("#map-2").selectOption("Qty");
  await page.locator("#run").click();
  await expect(page.locator("#result-view")).toContainText("A02");
  const pending = page.waitForEvent("download");
  await page.locator("#download").click();
  const download = await pending;
  const fs = await import("node:fs/promises");
  const records = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  expect(records).toEqual([
    {
      customer: "001",
      items: [
        { sku: "A01", quantity: "2" },
        { sku: "A02", quantity: "3" },
      ],
    },
  ]);
});
