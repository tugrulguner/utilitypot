import { test, expect } from "@playwright/test";

test("local failure fixture: rejected entity boundaries offer manual recovery without accepting spans", async ({
  page,
}) => {
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error:
          "AI interpretation could not be verified. Use manual controls or try later.",
      }),
    }),
  );
  await page.goto("/tools/entity-extractor/");
  await page.locator("#source-text").fill("Mina met Noah.");
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toContainText(
    "No AI matches were accepted",
  );
  await expect(page.locator("#extra-status")).toContainText(
    "Add mention manually",
  );
  await expect(page.locator("#add-mention")).toBeVisible();
  await expect(page.locator("#extra-results")).toBeHidden();
  await page.locator("#add-mention").click();
  await page.getByLabel("Mention 1", { exact: true }).fill("Noah");
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-visual mark")).toHaveText("Noah");
});

test("single JSON object offers an explicit one-row conversion", async ({
  page,
}) => {
  await page.goto("/tools/json-to-csv/");
  await page
    .locator("#source-text")
    .fill('{"id":"001","customer":{"name":"Ada"}}');
  await expect(page.locator("#row-path")).toContainText(
    "Single object — 1 row",
  );
  await page.locator("#row-path").selectOption("$object");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page.locator("#extra-output")).toContainText("001,Ada");
});

test("ambiguous records do not choose an array and nested-array paths explain recovery", async ({
  page,
}) => {
  await page.goto("/tools/json-to-csv/");
  await page
    .locator("#source-text")
    .fill('{"left":[{"id":1,"tags":["a"]}],"right":[{"id":2}]}');
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page.locator("#row-path")).toHaveValue("");
  await page.locator("#row-path").selectOption("left");
  await expect(page.locator("#nested-array-help")).toContainText("left");
  await expect(page.locator("#array-policy")).toHaveValue("reject");
});

test("invalid JSON and empty diagram input get actionable field-specific guidance", async ({
  page,
}) => {
  await page.goto("/tools/json-to-csv/");
  await page.locator("#source-text").fill("{");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page.locator("#extra-status")).toContainText("JSON");
  await expect(page.locator("#extra-status")).toContainText("double quotes");
  await page.goto("/tools/text-to-mermaid/");
  await page
    .getByRole("button", { name: "Create diagram", exact: true })
    .click();
  await expect(page.locator("#extra-status")).toContainText(
    "Add at least one step",
  );
});

test("completed fixture result is focused and brought into view on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      json: {
        source: "jev",
        model: "LOCAL TEST FIXTURE — NOT LIVE JEV",
        confidence: { answerability: 0.95, passage: 0.9 },
        plan: {
          status: "answered",
          excerpts: [
            { id: "p1", text: "The answer is available.", start: 0, end: 25 },
          ],
        },
      },
    }),
  );
  await page.goto("/tools/ask-a-webpage/");
  await page.locator("#source-text").fill("The answer is available.");
  await page.locator("#instructions").fill("What is available?");
  await page.getByRole("button", { name: "Find answer" }).click();
  await expect(page.locator("#extra-results")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("#extra-results")
        .evaluate((el) => el.getBoundingClientRect().top),
    )
    .toBeLessThan(844);
  await expect(page.locator("#extra-results")).toBeFocused();
});
