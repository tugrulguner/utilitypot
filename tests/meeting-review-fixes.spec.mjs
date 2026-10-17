import { test, expect } from "@playwright/test";

test("changing the selected meeting preserves results and exports that exact slot", async ({
  page,
}) => {
  await page.goto("/tools/meeting-time-finder/");
  await page.locator("#meeting-date").fill("2026-11-03");
  for (const [i, city] of [
    [0, "London"],
    [1, "New York"],
  ]) {
    await page.locator(`#p${i}-zone`).fill(city);
    if (
      !(await page
        .locator(".participant-hours")
        .nth(i)
        .evaluate((el) => el.open))
    )
      await page.locator(".participant-hours > summary").nth(i).click();
    await page.locator(`#p${i}-start`).fill("09:00");
    await page.locator(`#p${i}-end`).fill("17:00");
  }
  await page.getByRole("button", { name: "Find times", exact: true }).click();
  await page.locator("#slot-choice").selectOption("1");
  await expect(page.locator("#results")).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Add to calendar", exact: true })
    .click();
  const file = await downloaded;
  const fs = await import("node:fs/promises");
  const contents = await fs.readFile(await file.path(), "utf8");
  expect(contents).toContain("DTSTART:20261103T141500Z");
  expect(contents).toContain("DTEND:20261103T144500Z");
});

test("meeting finder accepts city labels, rejects ambiguity, and renders readable selectable slots", async ({
  page,
}) => {
  await page.goto("/tools/meeting-time-finder/");
  await page.locator("#meeting-date").fill("2026-11-03");
  for (const i of [0, 1]) {
    if (
      !(await page
        .locator(".participant-hours")
        .nth(i)
        .evaluate((el) => el.open))
    )
      await page.locator(".participant-hours > summary").nth(i).click();
    await page.locator(`#p${i}-start`).fill("09:00");
    await page.locator(`#p${i}-end`).fill("17:00");
  }
  await page.locator("#p0-zone").fill("London");
  await page.locator("#p1-zone").fill("New York");
  await page.getByRole("button", { name: "Find times" }).click();
  await expect(page.locator("#result-view")).toContainText("London");
  await expect(page.locator("#result-view")).toContainText("New York");
  await expect(page.locator(".meeting-comparison")).not.toContainText(
    /\d{4}-\d{2}-\d{2}T/,
  );
  await expect(page.locator("#slot-choice")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to calendar" }),
  ).toBeVisible();
  await page.locator("#p0-zone").fill("Springfield");
  await page.getByRole("button", { name: "Find times" }).click();
  await expect(page.locator("#utility-status")).toContainText(
    /unknown|ambiguous/i,
  );
});
