import { test, expect } from "@playwright/test";

test("date convention guidance matches all-numeric scope and preserves originals", async ({
  page,
}) => {
  await page.goto("/tools/fix-excel-dates/");
  await page.locator("#dates-input").fill("23/04/2027\n03/04/2027\n2027-04-23");
  await page.locator("#run").click();
  await expect(page.locator("#date-convention-scope")).toContainText(
    "all numeric",
  );
  await expect(page.locator("#date-convention-scope")).toContainText("ISO");
  await expect(page.locator("#date-convention-scope")).toContainText("Mixed");
  await expect(page.locator("#example-outcome")).not.toContainText(
    "only for ambiguous",
  );
  await page.locator("#date-convention").selectOption("month-first");
  await page.locator("#run").click();
  const result = await page.locator("#result-view").innerText();
  expect(result).toContain("23/04/2027");
  expect(result).toContain("invalid");
  expect(result).toContain("2027-04-23");
});

test("JSON sample does not pretend a record is selected before choosing a list", async ({
  page,
}) => {
  await page.goto("/tools/json-to-csv/");
  await page
    .locator("#source-text")
    .fill('{"orders":[{"id":"007"}],"people":[{"name":"Sam"}]}');
  await expect(page.locator("#row-path")).toHaveValue("");
  await expect(page.locator("#record-sample")).toBeHidden();
  await page.locator("#row-path").selectOption("orders");
  await expect(page.locator("#record-sample")).toBeVisible();
  await expect(page.locator("#record-sample")).toContainText("007");
  await page
    .locator("#source-text")
    .fill('{"teams":[{"name":"Blue"}],"members":[{"name":"Jo"}]}');
  await expect(page.locator("#record-sample")).toBeHidden();
});

test("mobile default meeting action precedes secondary controls and optional names have touch targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/meeting-time-finder/");
  await page.evaluate(() => document.fonts.ready);
  const run = await page.locator("#run").boundingBox(),
    add = await page.locator("#add-person").boundingBox();
  expect(run.y).toBeLessThan(add.y);
  const summary = await page
    .locator(".participant-hours > summary")
    .first()
    .boundingBox();
  expect(summary.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator("#p0-name")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
