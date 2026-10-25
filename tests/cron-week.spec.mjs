import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const width of [1280, 390, 320])
  for (const theme of ["light", "dark"])
    test(`selected clock-change week at ${width}px ${theme}`, async ({
      page,
      context,
    }, info) => {
      let api = 0;
      page.on("request", (r) => {
        if (new URL(r.url()).pathname.startsWith("/api/")) api++;
      });
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/tools/cron-explainer/");
      await page.locator("#color-theme").selectOption(theme);
      await page
        .getByLabel("Cron expression", { exact: true })
        .fill("0 9 * * *");
      await page
        .getByLabel("Schedule timezone", { exact: true })
        .fill("America/New_York");
      await page.getByLabel("Show run times in", { exact: true }).fill("UTC");
      await page.getByLabel("Preview", { exact: true }).selectOption("week");
      await page
        .getByLabel("Week starting", { exact: true })
        .fill("2026-10-28");
      await page
        .getByRole("button", { name: "Show selected week", exact: true })
        .click();
      await expect(page.locator("#results")).toBeVisible();
      await expect(page.locator("#results-title")).toHaveText("Selected week");
      await expect(page.locator("#cron-range")).toContainText("2026-10-28");
      await expect(page.locator("#cron-range")).toContainText("2026-11-03");
      const runs = page.locator("#cron-runs > li");
      await expect(runs).toHaveCount(7);
      await expect(runs.nth(3).locator("time")).toHaveAttribute(
        "datetime",
        "2026-10-31T13:00:00.000Z",
      );
      await expect(runs.nth(4).locator("time")).toHaveAttribute(
        "datetime",
        "2026-11-01T14:00:00.000Z",
      );
      await expect(runs.nth(3)).toContainText("UTC-04:00");
      await expect(runs.nth(4)).toContainText("UTC-05:00");
      await expect(page.locator("#copy")).toBeInViewport();
      await expect(runs.first()).toBeInViewport();
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.locator("#copy").click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      const ev = page.waitForEvent("download");
      await page.locator("#download").click();
      const download = await ev;
      expect(await readFile(await download.path(), "utf8")).toBe(copied);
      expect(copied).toContain("2026-10-28T04:00:00.000Z");
      expect(copied).toContain("2026-11-04T05:00:00.000Z");
      expect(copied).toContain("2026-11-03T14:00:00.000Z");
      expect(api).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page
        .locator("#results")
        .evaluate((e) => e.scrollIntoView({ block: "start" }));
      await expect(page.locator(".skip-link")).not.toBeInViewport();
      await page.screenshot({
        path: info.outputPath(`week-result-${width}-${theme}.png`),
      });
      await page.screenshot({
        path: info.outputPath(`week-${width}-${theme}.png`),
        fullPage: true,
      });
      await page
        .getByLabel("Week starting", { exact: true })
        .fill("2026-03-04");
      await expect(page.locator("#results")).toBeHidden();
      await expect(page.locator("#copy")).toBeDisabled();
      await page
        .getByRole("button", { name: "Show selected week", exact: true })
        .click();
      await expect(page.locator("#cron-runs > li")).toHaveCount(7);
      await expect(page.locator("#cron-runs > li").nth(4)).toContainText(
        "UTC-04:00",
      );
      await page.getByLabel("Preview", { exact: true }).selectOption("next");
      await expect(page.locator("#results")).toBeHidden();
      await expect(
        page.getByLabel("Week starting", { exact: true }),
      ).toBeHidden();
      await page
        .getByRole("button", { name: "Show next five runs", exact: true })
        .click();
      await expect(page.locator("#cron-runs > li")).toHaveCount(5);
    });

test("empty weeks and missing date recover without stale exports", async ({
  page,
}) => {
  await page.goto("/tools/cron-explainer/");
  await page
    .getByLabel("Cron expression", { exact: true })
    .fill("0 0 29 FEB *");
  await page.getByLabel("Schedule timezone", { exact: true }).fill("UTC");
  await page.getByLabel("Show run times in", { exact: true }).fill("UTC");
  await page.getByLabel("Preview", { exact: true }).selectOption("week");
  await page
    .getByRole("button", { name: "Show selected week", exact: true })
    .click();
  await expect(page.getByLabel("Week starting", { exact: true })).toBeFocused();
  await expect(page.locator("#results")).toBeHidden();
  await page.getByLabel("Week starting", { exact: true }).fill("2026-10-28");
  await page
    .getByRole("button", { name: "Show selected week", exact: true })
    .click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#cron-range")).toContainText("No runs");
  await expect(page.locator("#cron-runs > li")).toHaveCount(0);
  await expect(page.locator("#download")).toBeEnabled();
  await page.getByLabel("Week starting", { exact: true }).fill("");
  await expect(page.locator("#results")).toBeHidden();
  await expect(page.locator("#download")).toBeDisabled();
});

test("dense week displays in batches but exports every occurrence", async ({
  page,
}) => {
  await page.goto("/tools/cron-explainer/");
  await page.getByLabel("Cron expression", { exact: true }).fill("* * * * *");
  await page
    .getByLabel("Schedule timezone", { exact: true })
    .fill("America/New_York");
  await page.getByLabel("Show run times in", { exact: true }).fill("UTC");
  await page.getByLabel("Preview", { exact: true }).selectOption("week");
  await page.getByLabel("Week starting", { exact: true }).fill("2026-10-28");
  await page
    .getByRole("button", { name: "Show selected week", exact: true })
    .click();
  await expect(page.locator("#cron-range")).toContainText("10,140 runs");
  await expect(page.locator("#cron-runs > li")).toHaveCount(100);
  await page
    .getByRole("button", { name: "Show more runs", exact: true })
    .click();
  await expect(page.locator("#cron-runs > li")).toHaveCount(200);
  const ev = page.waitForEvent("download");
  await page.locator("#download").click();
  const bytes = await readFile(await (await ev).path(), "utf8");
  expect(bytes.match(/^\d+\. /gm)).toHaveLength(10140);
  expect(bytes).toContain("2026-10-28T04:00:00.000Z");
  expect(bytes).toContain("2026-11-04T04:59:00.000Z");
});
