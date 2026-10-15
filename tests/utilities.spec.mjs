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
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.locator("#reviewed").check();
  await page
    .getByRole("button", { name: "Convert locally", exact: true })
    .click();
  await expect(page.locator("#utility-status")).toContainText(
    "3 source rows to 2 parent records",
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download result", exact: true })
    .click();
  const d = await download;
  const out = JSON.parse(await fs.readFile(await d.path(), "utf8"));
  expect(out[0].id).toBe("001");
  expect(out[0].items).toHaveLength(2);
  expect(calls).toEqual([]);
  await page.locator("#csv-input").fill("id\n001");
  await expect(page.locator("#results")).toBeHidden();
});
test("date cleanup retains unresolved rows and exports the report", async ({
  page,
}) => {
  await page.goto("/tools/fix-excel-dates/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page
    .getByRole("button", { name: "Normalize locally", exact: true })
    .click();
  await expect(page.locator("#utility-status")).toContainText(
    "1 need review; 1 are invalid",
  );
  await expect(page.locator("#result-view")).toContainText("2026-02");
  await page.locator("#date-convention").selectOption("day-first");
  await expect(page.locator("#results")).toBeHidden();
  await page
    .getByRole("button", { name: "Normalize locally", exact: true })
    .click();
  await expect(page.locator("#result-view")).toContainText("2026-04-03");
});
test("meeting windows compute local times and export a matching calendar instant", async ({
  page,
}) => {
  await page.goto("/tools/meeting-time-finder/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.locator("#reviewed").check();
  await page
    .getByRole("button", { name: "Find overlapping times", exact: true })
    .click();
  await expect(page.locator("#result-view")).toContainText(
    "2026-06-15T08:30:00Z",
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download calendar event", exact: true })
    .click();
  const d = await download;
  expect(await fs.readFile(await d.path(), "utf8")).toContain(
    "DTSTART:20260615T083000Z",
  );
});
test("AI requires consent and sends only five CSV rows", async ({ page }) => {
  let count = 0,
    payload;
  await page.route("**/api/utilities/interpret", async (route) => {
    count++;
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 503,
      json: { error: "AI is unavailable. Manual controls still work." },
    });
  });
  await page.goto("/tools/csv-to-nested-json/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.getByRole("button", { name: "Ask Jev", exact: true }).click();
  expect(count).toBe(0);
  await expect(page.locator("#utility-status")).toContainText(
    "confirm consent",
  );
  await page
    .locator("#csv-input")
    .fill("id,name\n1,A\n2,B\n3,C\n4,D\n5,E\n6,DO_NOT_SEND");
  await page.locator("#ai-consent").check();
  await page.getByRole("button", { name: "Ask Jev", exact: true }).click();
  await expect(page.locator("#utility-status")).toContainText(
    "AI is unavailable",
  );
  expect(count).toBe(1);
  expect(payload.input.csv).not.toContain("DO_NOT_SEND");
});
test("Jev proposal changes editable settings but never automatically computes", async ({
  page,
}) => {
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      status: 200,
      json: {
        source: "jev",
        model: "fixture-jev",
        plan: { convention: "day-first" },
        confidence: { convention: 0.95 },
      },
    }),
  );
  await page.goto("/tools/fix-excel-dates/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.locator("#ai-consent").check();
  await page.getByRole("button", { name: "Ask Jev", exact: true }).click();
  await expect(page.locator("#date-convention")).toHaveValue("day-first");
  await expect(page.locator("#results")).toBeHidden();
  await expect(page.locator("#utility-status")).toContainText(
    "Review every setting",
  );
});
test("editing source invalidates an in-flight interpretation", async ({
  page,
}) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/utilities/interpret", async (route) => {
    await gate;
    await route.fulfill({
      status: 200,
      json: {
        source: "jev",
        model: "fixture",
        plan: { convention: "month-first" },
        confidence: { convention: 0.9 },
      },
    });
  });
  await page.goto("/tools/fix-excel-dates/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.locator("#ai-consent").check();
  const sent = page.waitForRequest("**/api/utilities/interpret");
  await page.getByRole("button", { name: "Ask Jev", exact: true }).click();
  await sent;
  await page.locator("#date-context").fill("New context");
  release();
  await expect(
    page.getByRole("button", { name: "Ask Jev", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("#date-convention")).toHaveValue("auto");
});

for (const [slug, title] of [
  ["csv-to-nested-json", "CSV to nested JSON"],
  ["fix-excel-dates", "Fix mixed spreadsheet dates"],
  ["meeting-time-finder", "Find a meeting time"],
]) {
  test(`${slug} has a usable private manual workflow`, async ({ page }) => {
    await page.goto(`/tools/${slug}/`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Load example", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ask Jev", exact: true }),
    ).toBeVisible();
  });
}
