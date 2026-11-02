import { test, expect } from "@playwright/test";

test("key-only additions and removals are never described as unchanged", async ({
  page,
}) => {
  await page.route("**/*", (r) =>
    ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/tools/compare-spreadsheets/");
  await page.locator("#diff-before").fill("id\nremoved\nsame");
  await page.locator("#diff-after").fill("id\nadded\nsame");
  await page.locator("#diff-key").selectOption("id");
  await page.locator("#diff-run").click();
  await expect(page.locator("#diff-result")).toBeVisible();
  const added = page.locator('.diff-record[data-status="added"]');
  const removed = page.locator('.diff-record[data-status="removed"]');
  await expect(added).not.toContainText("No changes in this row.");
  await expect(added).toContainText("Row added. No non-key fields.");
  await expect(removed).toContainText("Row removed. No non-key fields.");
  for (const status of ["added", "removed"]) {
    expect(
      (
        await page
          .locator(`#diff-rows tr[data-status="${status}"] td`)
          .allTextContents()
      ).slice(2),
    ).toEqual(["—", "—", "—"]);
  }
  await page.locator("#diff-filter").selectOption("unchanged");
  await expect(page.locator("#diff-records")).toContainText(
    "No changes in this row.",
  );
});
