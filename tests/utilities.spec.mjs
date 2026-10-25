import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("utilities are discoverable through the home page and sitemap", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Open CSV to nested JSON", exact: true }),
  ).toHaveAttribute("href", "/tools/csv-to-nested-json/");
  const xml = await (await request.get("/sitemap.xml")).text();
  for (const slug of [
    "csv-to-nested-json",
    "fix-excel-dates",
    "meeting-time-finder",
  ])
    expect(xml).toContain(`https://utilitypot.modepot.io/tools/${slug}/`);
});

test("CSV example converts locally and downloads actual grouped JSON", async ({
  page,
}) => {
  const calls = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) calls.push(r.url());
  });
  await page.goto("/tools/csv-to-nested-json/");
  await page
    .locator("details")
    .evaluateAll((es) => es.forEach((e) => (e.open = true)));
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page
    .getByRole("button", { name: "Create nested JSON", exact: true })
    .click();
  await expect(page.locator("#utility-status")).toContainText(
    "3 source rows to 2 parent records",
  );
  const download = page.waitForEvent("download");
  await page.locator("#download, #extra-download").click();
  const d = await download;
  const out = JSON.parse(await fs.readFile(await d.path(), "utf8"));
  expect(out[0].Customer).toBe("001");
  expect(out[0].rows).toHaveLength(2);
  expect(calls).toEqual([]);
  await page.locator("#csv-input").fill("id\n001");
  await expect(page.locator("#results")).toBeHidden();
});
test("date cleanup retains unresolved rows and exports the report", async ({
  page,
}) => {
  await page.goto("/tools/fix-excel-dates/");
  await page
    .locator("details")
    .evaluateAll((es) => es.forEach((e) => (e.open = true)));
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page.getByRole("button", { name: "Fix dates", exact: true }).click();
  await expect(page.locator("#utility-status")).toContainText(
    "1 need review; 1 are invalid",
  );
  await expect(page.locator("#result-view")).toContainText("2026-02");
  await page.locator("#date-convention").selectOption("day-first");
  await expect(page.locator("#results")).toBeHidden();
  await page.getByRole("button", { name: "Fix dates", exact: true }).click();
  await expect(page.locator("#result-view")).toContainText("2026-04-03");
});
test("meeting windows compute local times and export a matching calendar instant", async ({
  page,
}) => {
  await page.goto("/tools/meeting-time-finder/");
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page.locator("#meeting-date").fill("2026-06-15");
  await page.getByRole("button", { name: "Find times", exact: true }).click();
  await expect(page.locator("#result-view")).toContainText(
    "2026-06-15T08:30:00Z",
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download calendar (.ics)", exact: true })
    .click();
  const d = await download;
  expect(await fs.readFile(await d.path(), "utf8")).toContain(
    "DTSTART:20260615T083000Z",
  );
});
test("CSV conversion sends no rows to AI, including rows beyond an old sample boundary", async ({
  page,
}) => {
  let count = 0;
  await page.route("**/api/**", (r) => {
    count++;
    return r.abort();
  });
  await page.goto("/tools/csv-to-nested-json/");
  await page
    .locator("#csv-input")
    .fill("id,name\n1,A\n2,B\n3,C\n4,D\n5,E\n6,PRIVATE_SIXTH_ROW");
  await page.locator("#run").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#result-view")).toContainText("PRIVATE_SIXTH_ROW");
  expect(count).toBe(0);
  await expect(page.locator("#ask-jev")).toHaveCount(0);
});
test("explicit date convention computes a reviewable preview in one local action", async ({
  page,
}) => {
  await page.goto("/tools/fix-excel-dates/");
  await page.locator("#load-example").click();
  await page.locator("#run").click();
  await page.locator("#date-convention").selectOption("day-first");
  await page.locator("#run").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#result-view")).toContainText("2026-04-03");
  await expect(page.locator("#utility-status")).toContainText(
    "Processed 5 rows locally.",
  );
});
test("editing source invalidates an in-flight semantic interpretation", async ({
  page,
}) => {
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route("**/api/utilities/interpret", async (route) => {
    await gate;
    return route.fulfill({
      json: {
        source: "jev",
        model: "fixture",
        plan: { status: "not-answered", excerpts: [] },
        confidence: {},
      },
    });
  });
  await page.goto("/tools/ask-a-webpage/");
  await page.locator("#source-text").fill("Original source");
  await page.locator("#instructions").fill("What is this?");
  const sent = page.waitForRequest("**/api/utilities/interpret");
  await page.locator("#extra-ask").click();
  await sent;
  await page.locator("#source-text").fill("New source");
  release();
  await expect(page.locator("#extra-ask")).toBeEnabled();
  await expect(page.locator("#extra-results")).toBeHidden();
});

for (const [slug, title] of [
  ["csv-to-nested-json", "CSV to nested JSON"],
  ["fix-excel-dates", "Fix mixed spreadsheet dates"],
  ["meeting-time-finder", "Find a meeting time"],
]) {
  test(`${slug} has a usable private manual workflow`, async ({ page }) => {
    await page.goto(`/tools/${slug}/`);
    await page
      .locator("details")
      .evaluateAll((es) => es.forEach((e) => (e.open = true)));
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Load example:/ }),
    ).toBeVisible();
    await expect(page.locator("#run")).toBeVisible();
  });
}
