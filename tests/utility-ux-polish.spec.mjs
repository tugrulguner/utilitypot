import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("selected meeting uses one shared date and a short picker while keeping its calendar instant", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/tools/meeting-time-finder/");
  await page.locator("#meeting-date").fill("2026-11-03");
  await page.locator("#p0-zone").fill("London");
  await page.locator("#p1-zone").fill("Kolkata");
  await page.locator("#run").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator(".meeting-shared-date")).toHaveText("Nov 3, 2026");
  const comparison = await page.locator(".meeting-comparison").innerText();
  expect(comparison.match(/2026/g)).toHaveLength(1);
  await expect(page.locator("#slot-choice option").first()).toContainText(
    "London 09:00",
  );
  await expect(page.locator("#slot-choice option").first()).not.toContainText(
    "Kolkata",
  );
  await expect(page.locator(".meeting-comparison")).toContainText("UTC+5:30");
  const event = page.waitForEvent("download");
  await page.locator("[data-calendar-action]").click();
  const ics = await readFile(await (await event).path(), "utf8");
  expect(ics).toContain("DTSTART:20261103T090000Z");
  expect(ics).toContain("DTEND:20261103T093000Z");
});

test("grouped CSV scroll guidance follows real overflow and resizing without changing exports", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/tools/csv-to-nested-json/");
  const text =
    "account,sku,product,quantity\nNorth,001,Precision screwdriver set,12\nNorth,002,USB-C adapter,6";
  await page.locator("#csv-input").fill(text);
  await page.locator("#group-by").selectOption("account");
  await page.locator("#run").click();
  const hint = page.locator(".csv-scroll-hint").first();
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("Scroll sideways");
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(hint).toBeHidden();
  await page.setViewportSize({ width: 390, height: 900 });
  const overflows = await page
    .locator(".table-scroll")
    .first()
    .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  if (overflows) await expect(hint).toBeVisible();
  else await expect(hint).toBeHidden();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(hint).toBeVisible();
  const event = page.waitForEvent("download");
  await page.locator("#download").click();
  const json = JSON.parse(await readFile(await (await event).path(), "utf8"));
  expect(json).toEqual([
    {
      account: "North",
      rows: [
        { sku: "001", product: "Precision screwdriver set", quantity: "12" },
        { sku: "002", product: "USB-C adapter", quantity: "6" },
      ],
    },
  ]);
});

test("cron export labels name the artifact while compact range keeps original download metadata", async ({
  page,
}) => {
  await page.goto("/tools/cron-explainer/");
  await page.locator("#cron-expression").fill("0 9 * * *");
  await page.locator("#cron-schedule-zone").fill("America/New_York");
  await page.locator("#cron-display-zone").fill("UTC");
  await page.locator("#cron-preview").selectOption("week");
  await page.locator("#cron-week-start").fill("2026-10-28");
  await page.locator("#run").click();
  await expect(page.locator("#copy")).toHaveText("Copy run times");
  await expect(page.locator("#download")).toHaveText("Download TXT");
  await expect(
    page.getByRole("button", { name: "Download TXT", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#cron-result-zones")).toContainText(
    "America/New_York",
  );
  await expect(page.locator("#cron-range")).not.toContainText(
    "America/New_York",
  );
  const event = page.waitForEvent("download");
  await page.locator("#download").click();
  const text = await readFile(await (await event).path(), "utf8");
  expect(text).toContain("Schedule timezone: America/New_York");
  expect(text).toContain(
    "2026-10-28 through 2026-11-03 · America/New_York · 7 runs",
  );
});
