import { test, expect } from "@playwright/test";
for (const width of [1280, 390, 320])
  for (const theme of ["light", "dark"])
    test(`cron next five in the chosen timezone at ${width}px ${theme}`, async ({
      page,
      context,
    }, info) => {
      await page.clock.install({ time: new Date("2026-03-06T12:00:00Z") });
      let api = 0;
      page.on("request", (r) => {
        if (new URL(r.url()).pathname.startsWith("/api/")) api++;
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tools/cron-explainer/");
      await expect(
        page.getByRole("heading", {
          name: "When will this cron run?",
          exact: true,
        }),
      ).toBeVisible();
      await page.locator("#color-theme").selectOption(theme);
      await page
        .getByLabel("Cron expression", { exact: true })
        .fill("0 9 * * MON-FRI");
      await page
        .getByLabel("Schedule timezone", { exact: true })
        .fill("America/New_York");
      await page
        .getByLabel("Show run times in", { exact: true })
        .fill("Asia/Kolkata");
      await page
        .getByRole("button", { name: "Show next five runs", exact: true })
        .click();
      const result = page.locator("#results");
      await expect(result).toBeVisible();
      await expect(result).toContainText("Next five runs");
      const runs = page.locator("#cron-runs > li");
      await expect(runs).toHaveCount(5);
      await expect(runs.nth(0).locator("time")).toHaveAttribute(
        "datetime",
        "2026-03-06T14:00:00.000Z",
      );
      await expect(runs.nth(1).locator("time")).toHaveAttribute(
        "datetime",
        "2026-03-09T13:00:00.000Z",
      );
      await expect(runs.first()).toContainText("19:30");
      await expect(runs.nth(1)).toContainText("18:30");
      await expect(runs.first()).toContainText("UTC+05:30");
      await expect(result).toContainText("America/New_York");
      await expect(result).toContainText("Asia/Kolkata");
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page
        .getByRole("button", { name: "Copy run times", exact: true })
        .click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      const ev = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download run times", exact: true })
        .click();
      const download = await ev;
      const { readFile } = await import("node:fs/promises");
      const bytes = await readFile(await download.path(), "utf8");
      expect(bytes).toBe(copied);
      expect(bytes).toContain("2026-03-06T14:00:00.000Z");
      expect(bytes).toContain("0 9 * * MON-FRI");
      expect(api).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const button of await page
        .locator('[data-utility="cron"] button')
        .all()) {
        if (await button.isVisible()) {
          const b = await button.boundingBox();
          expect(b.height).toBeGreaterThanOrEqual(44);
        }
      }
      await result.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`cron-${width}-${theme}.png`),
        fullPage: true,
      });
      await page
        .getByLabel("Cron expression", { exact: true })
        .fill("0 9 * * *");
      await expect(result).toBeHidden();
      await expect(page.locator("#copy")).toBeDisabled();
    });
test("invalid cron fields and timezone give local recovery without stale runs", async ({
  page,
}) => {
  await page.goto("/tools/cron-explainer/");
  await page.getByLabel("Cron expression", { exact: true }).fill("0 0 9 * * *");
  await page
    .getByRole("button", { name: "Show next five runs", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /five|5/ }),
  ).toBeVisible();
  await expect(page.locator("#results")).toBeHidden();
  await page.getByLabel("Cron expression", { exact: true }).fill("0 9 * * *");
  await page
    .getByLabel("Schedule timezone", { exact: true })
    .fill("Not/A_Zone");
  await page
    .getByRole("button", { name: "Show next five runs", exact: true })
    .click();
  await expect(page.locator("#utility-status")).toContainText(/timezone/i);
  await expect(page.locator("#results")).toBeHidden();
});
test("browser timezone default and homepage discovery", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Open When will this cron run?", exact: true })
    .click();
  await expect(
    page.getByLabel("Schedule timezone", { exact: true }),
  ).toHaveValue(
    await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  await expect(
    page.getByLabel("Show run times in", { exact: true }),
  ).toHaveValue(
    await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://utilitypot.modepot.io/tools/cron-explainer/",
  );
});
