import { fulfillEntityDocumentFixture } from "./helpers/entity-document-fixture.mjs";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixturePlan } from "./workflow-fixtures.mjs";
const source =
  "Ada Lovelace joined Cedar Labs in London.\nNoor Patel met Ada Lovelace at Cedar Labs.";
const entry = (type, text, last = false) => {
  const start = last ? source.lastIndexOf(text) : source.indexOf(text);
  return { type, text, start, end: start + text.length };
};
const items = [
  entry("Person", "Ada Lovelace"),
  entry("Person", "Noor Patel"),
  entry("Person", "Ada Lovelace", true),
  entry("Organization", "Cedar Labs"),
  entry("Organization", "Cedar Labs", true),
];
for (const width of [1280, 1050, 390, 320])
  test(`NER investigation fixture preserves source and exports at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/tools/entity-extractor/");
    await page.locator("#source-text").fill(source);
    await fixturePlan(page, { entities: items });
    await page.locator("#extra-ask").click();
    await expect(page.locator(".entity-legend")).toContainText("Person");
    await expect(page.locator(".entity-legend")).toContainText("Organization");
    expect(await page.locator(".entity-document").textContent()).toBe(source);
    for (const theme of ["light", "dark"]) {
      await page.locator("#color-theme").selectOption(theme);
      const colors = await page
        .locator(".entity-document mark")
        .evaluateAll((nodes) =>
          nodes.map((n) => getComputedStyle(n).backgroundColor),
        );
      expect(new Set(colors).size).toBe(2);
    }
    const target = page.getByRole("button", {
      name: "Person Ada Lovelace, occurrence 2",
      exact: true,
    });
    await target.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("mark.is-current")).toHaveText("Ada Lovelace");
    await expect(page.locator("mark.is-current")).toBeFocused();
    await expect(target).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".entity-selection")).toContainText("Person");
    await expect(page.locator(".entity-selection")).toContainText("2 of 2");
    await page
      .getByRole("button", { name: "Back to matches", exact: true })
      .click();
    await expect(target).toBeFocused();
    const file = page.waitForEvent("download");
    await page.locator("#extra-download").click();
    expect(await readFile(await (await file).path(), "utf8")).toBe(
      JSON.stringify(
        [...items].sort(
          (a, b) =>
            a.start - b.start || a.end - b.end || a.type.localeCompare(b.type),
        ),
        null,
        2,
      ),
    );
    await page
      .locator(".entity-workspace")
      .screenshot({ path: info.outputPath(`ner-${width}.png`) });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator("#source-text").fill("Changed");
    await expect(page.locator(".entity-workspace")).toHaveCount(0);
  });

test("rejected entity starts preserve input and accept no output or automatic retry", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/utilities/interpret", (route) => {
    calls++;
    return fulfillEntityDocumentFixture(route, {
      status: 503,
      json: {
        error:
          "The interpretation could not be verified. No result was accepted. Try again later.",
        code: "entity_starts_invalid",
        phase: "followup",
        stage: 1,
      },
    });
  });
  await page.goto("/tools/entity-extractor/");
  await page.locator("#source-text").fill(source);
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toContainText(
    "No result was accepted",
  );
  await expect(page.locator("#source-text")).toHaveValue(source);
  await expect(page.locator(".entity-workspace")).toHaveCount(0);
  await expect(page.locator("#extra-results")).toBeHidden();
  await expect(page.locator("#extra-download")).not.toBeVisible();
  await expect(page.locator("#extra-ask")).toBeEnabled();
  expect(calls).toBe(1);
});
