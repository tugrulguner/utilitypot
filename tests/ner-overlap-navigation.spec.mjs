import { fixturePlan } from "./workflow-fixtures.mjs";
import { test, expect } from "@playwright/test";

test("overlapping accepted categories navigate their exact source without missing marks", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/tools/entity-extractor/");
  await page.locator("#source-text").fill("Nora Ivers.");
  await page.locator("#custom-category").check();
  await page
    .locator("#instructions")
    .fill("Speaker: a named person who speaks");
  await fixturePlan(page, {
    entities: [
      { type: "Person", text: "Nora Ivers", start: 0, end: 10 },
      { type: "Speaker", text: "Nora", start: 0, end: 4 },
    ],
  });
  await page.locator("#extra-ask").click();
  await expect(page.locator(".entity-document")).toHaveText("Nora Ivers.");
  await page
    .getByRole("button", { name: "Speaker Nora, occurrence 1", exact: true })
    .click();
  await expect(page.locator("mark.is-current")).toHaveText("Nora");
  await expect(page.locator("mark.is-current")).toBeFocused();
  await page
    .getByRole("button", {
      name: "Person Nora Ivers, occurrence 1",
      exact: true,
    })
    .click();
  expect(
    (await page.locator("mark.is-current").allTextContents()).join(""),
  ).toBe("Nora Ivers");
  expect(errors).toEqual([]);
});
