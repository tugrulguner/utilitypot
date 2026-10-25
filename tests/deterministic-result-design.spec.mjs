import { test, expect } from "@playwright/test";

test("CSV grouped preview summarizes parents and child rows without losing values", async ({
  page,
}) => {
  await page.goto("/tools/csv-to-nested-json/");
  await page
    .locator("#csv-input")
    .fill("account,sku,amount\nA,001,9\nA,002,10\nB,003,11");
  await page.locator("#group-by").selectOption({ label: "account" });
  await page.getByRole("button", { name: "Create nested JSON" }).click();
  await expect(page.locator(".csv-result-summary")).toHaveText(
    "2 parent records · 3 child rows",
  );
  await expect(page.locator("#result-view")).toContainText("001");
  await expect(page.locator("#result-view")).toContainText("002");
  await expect(page.locator("#result-view")).toContainText("003");
  await expect(
    page.getByRole("button", { name: "Copy JSON", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download JSON", exact: true }),
  ).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy JSON" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(copied)).toHaveLength(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const file = await download;
  const fs = await import("node:fs/promises");
  const json = JSON.parse(await fs.readFile(await file.path(), "utf8"));
  expect(json).toHaveLength(2);
  expect(JSON.stringify(json)).toContain('"sku":"001"');
});

test("date review exposes compact statuses and mobile original-to-normalized hierarchy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/fix-excel-dates/");
  await page
    .locator("#dates-input")
    .fill("2026-03-25\n03/04/2026\n2027-01\nnot-a-date");
  await page.getByRole("button", { name: "Fix dates" }).click();

  const cards = page.locator(".date-record");
  await expect(cards).toHaveCount(4);
  await expect(page.locator(".date-result-summary")).toHaveText(
    "4 date values · 1 normalized · 1 ambiguous · 1 partial · 1 invalid",
  );
  await expect(cards.nth(0)).toContainText("Original");
  await expect(cards.nth(0)).toContainText("Normalized");
  await expect(cards.nth(0).locator(".date-status")).toHaveText("converted");
  await expect(cards.nth(1).locator(".date-status")).toHaveText("review");
  await expect(cards.nth(2)).toContainText("partial");
  await expect(cards.nth(3)).toContainText("invalid");
  await expect(cards.nth(3)).toContainText("not-a-date");
  const pair = await cards.nth(0).evaluate((el) => {
    const values = el.querySelectorAll("dd");
    return [
      values[0].getBoundingClientRect().top,
      values[1].getBoundingClientRect().top,
    ];
  });
  expect(Math.abs(pair[0] - pair[1])).toBeLessThan(1);
  await page.locator("#date-filter").selectOption("attention");
  await expect(cards.nth(0)).toBeHidden();
  await expect(cards.nth(1)).toBeVisible();
  await expect(cards.nth(3)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.locator("#download").click();
  const file = await download;
  const fs = await import("node:fs/promises");
  const csv = await fs.readFile(await file.path(), "utf8");
  for (const value of ["2026-03-25", "03/04/2026", "2027-01", "not-a-date"])
    expect(csv).toContain(value);
});

test("meeting result promotes selected-time calendar export and keeps option text 24-hour", async ({
  page,
}) => {
  await page.goto("/tools/meeting-time-finder/");
  await page.locator("#meeting-date").fill("2026-11-03");
  for (const [i, city] of [
    [0, "London"],
    [1, "New York"],
  ]) {
    await page.locator(`#p${i}-zone`).fill(city);
    const hours = page.locator(".participant-hours").nth(i);
    if (!(await hours.evaluate((el) => el.open)))
      await hours.locator("> summary").click();
  }
  await page.getByRole("button", { name: "Find times" }).click();
  const calendar = page.getByRole("button", {
    name: "Download calendar (.ics)",
  });
  await expect(calendar).toBeVisible();
  await expect(calendar.locator("xpath=ancestor::header")).toHaveCount(1);
  await expect(page.locator("#slot-choice")).toContainText(/\b\d{2}:\d{2}\b/);
  await expect(page.locator("#result-view")).toContainText(
    "All available options",
  );
  const download = page.waitForEvent("download");
  await calendar.click();
  const file = await download;
  const fs = await import("node:fs/promises");
  const ics = await fs.readFile(await file.path(), "utf8");
  expect(ics).toContain("BEGIN:VCALENDAR");
  await page.locator("#p0-zone").fill("Atlantis");
  await expect(page.locator("[data-calendar-action]")).toHaveCount(0);
});

test("meeting re-run with no overlap removes previous slot UI", async ({
  page,
}) => {
  await page.goto("/tools/meeting-time-finder/");
  await page.locator("#meeting-date").fill("2026-11-03");
  for (const i of [0, 1]) {
    await page.locator(`#p${i}-zone`).fill("London");
    const participant = page.locator(".participant").nth(i);
    const hours = participant.locator(".participant-hours");
    if (!(await hours.evaluate((el) => el.open)))
      await hours.locator("> summary").click();
    await participant.locator('[data-field="start"]').fill("09:00");
    await participant.locator('[data-field="end"]').fill("10:00");
  }
  await page.locator("#run").click();
  await expect(page.locator("#slot-choice")).toBeVisible();
  await expect(page.locator("[data-calendar-action]")).toBeVisible();
  const later = page.locator(".participant").nth(1);
  await later.locator('[data-field="start"]').fill("11:00");
  await later.locator('[data-field="end"]').fill("12:00");
  await page.locator("#run").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#result-view")).toContainText(
    "No overlapping time",
  );
  await expect(page.locator("#slot-choice")).toHaveCount(0);
  await expect(page.locator("#result-view h3")).toHaveCount(0);
  await expect(page.locator("[data-calendar-action]")).toHaveCount(0);
});

test("date result renders at desktop and narrow widths in both themes", async ({
  page,
}, info) => {
  await page.goto("/tools/fix-excel-dates/");
  await page
    .locator("#dates-input")
    .fill("2026-03-25\n03/04/2026\n2027-01\nnot-a-date");
  await page.getByRole("button", { name: "Fix dates" }).click();
  for (const theme of ["light", "dark"]) {
    await page.locator("#color-theme").selectOption(theme);
    for (const [width, height] of [
      [1280, 900],
      [390, 844],
      [320, 720],
    ]) {
      await page.setViewportSize({ width, height });
      await page.locator("#results").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`dates-${width}-${theme}.png`),
      });
    }
  }
});
