import { test, expect } from "@playwright/test";

test("showing a validation report while typing does not pull the source out of view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/tools/csv-to-nested-json/");
  await page.getByRole("button", { name: /^Load example:/ }).click();
  const input = page.locator("#csv-input");
  await input.scrollIntoViewIfNeeded();
  await input.fill('id,name\n"unterminated');
  await expect(page.locator("#utility-status")).toHaveClass(/error/);
  await expect(input).toBeInViewport();
  await expect(input).toBeFocused();
});
for (const width of [1280, 320])
  test(`cron reports stay beside output and actual errors at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tools/cron-explainer/?private=PRIVATE_INPUT#SECRET");
    await expect(page.locator(".utility-main > .utility-support")).toHaveCount(
      0,
    );
    await page.locator("#cron-expression").fill("*/15 * * * *");
    await page.locator("#run").click();
    const report = page.locator('#results [data-tool-feedback="result"]');
    await expect(report).toBeVisible();
    await report.scrollIntoViewIfNeeded();
    await expect(report).toBeInViewport();
    const href = await report.getAttribute("href");
    expect(new URL(href).searchParams.get("body")).toContain(
      "https://utilitypot.modepot.io/tools/cron-explainer/",
    );
    expect(href).not.toContain("PRIVATE_INPUT");
    expect(href).not.toContain("SECRET");
    expect(href).not.toContain("%2A%2F15");
    await page.locator("#cron-expression").fill("PRIVATE_INPUT");
    await page.locator("#run").click();
    await expect(page.locator("#utility-status")).toHaveClass(/error/);
    const error = page.locator('[data-tool-feedback="error"]');
    await expect(error).toBeVisible();
    await expect(error).toBeInViewport();
    await expect(error).toHaveAttribute("href", href);
    await expect(page.locator("#results")).toBeHidden();
    await expect(page.locator(".utility-footer .feedback-link a")).toHaveCount(
      1,
    );
  });
