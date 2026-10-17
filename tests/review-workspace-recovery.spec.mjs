import { test, expect } from "@playwright/test";

test("meeting recovery reveals a cleared time inside collapsed hours", async ({
  page,
}) => {
  await page.goto("/tools/meeting-time-finder/");
  await page.locator("#meeting-date").fill("2026-11-05");
  await page.locator("#p0-zone").fill("London");
  await page.locator("#p1-zone").fill("New York");
  const details = page.locator(".participant-hours").first();
  await details.locator(":scope > summary").click();
  await page.locator("#p0-start").fill("");
  await details.locator(":scope > summary").click();
  await page.getByRole("button", { name: "Find times", exact: true }).click();
  await expect(details).toHaveJSProperty("open", true);
  await expect(page.locator("#p0-start")).toBeFocused();
  await expect(page.locator("#results")).toBeHidden();
});

test("ModePot attribution remains readable in forced colours", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/tools/json-to-csv/");
  const wordmark = page.locator(".discovery-brand strong");
  const rendered = await wordmark.evaluate((el) => ({
    fill: getComputedStyle(el).webkitTextFillColor,
    color: getComputedStyle(el).color,
    background: getComputedStyle(el).backgroundImage,
  }));
  expect(rendered.fill).not.toBe("rgba(0, 0, 0, 0)");
});
