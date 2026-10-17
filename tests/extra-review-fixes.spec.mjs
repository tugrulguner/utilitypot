import { test, expect } from "@playwright/test";

test("local latency fixture: two valid 11-second entity stages fit the client deadline", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.route("**/api/utilities/interpret", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 22000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "jev",
        model: "local-latency-fixture",
        plan: {
          entities: [{ type: "Person", text: "Mina", start: 0, end: 4 }],
        },
        confidence: {},
        needsReview: true,
      }),
    });
  });
  await page.goto("/tools/entity-extractor/");
  await page.locator("#source-text").fill("Mina met Noah.");
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-results")).toBeVisible({ timeout: 25000 });
  await expect(page.locator("#extra-visual mark")).toHaveText("Mina");
  await expect(page.locator("#extra-status")).not.toContainText("timed out");
});

test("rejected entity interpretation accepts no spans and exposes no pre-result manual fallback", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/utilities/interpret", (route) => {
    calls++;
    return route.fulfill(
      calls === 1
        ? {
            status: 503,
            json: {
              error:
                "AI interpretation could not be verified. Try again later.",
            },
          }
        : {
            json: {
              source: "jev",
              model: "fixture",
              confidence: {},
              plan: {
                entities: [{ type: "Person", text: "Noah", start: 9, end: 13 }],
              },
            },
          },
    );
  });
  await page.goto("/tools/entity-extractor/");
  await page.locator("#source-text").fill("Mina met Noah.");
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toContainText(
    "No AI matches were accepted",
  );
  await expect(page.locator("#extra-results")).toBeHidden();
  await expect(page.locator("#entity-review")).toBeHidden();
  await expect(page.locator("#add-mention")).toBeHidden();
  expect(calls).toBe(1);
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-visual mark")).toHaveText("Noah");
  expect(calls).toBe(2);
});

test("single JSON object offers an explicit one-row conversion", async ({
  page,
}) => {
  await page.goto("/tools/json-to-csv/");
  await page
    .locator("#source-text")
    .fill('{"id":"001","customer":{"name":"Ada"}}');
  await expect(page.locator("#row-path")).toContainText(
    "The whole object · 1 row",
  );
  await expect(page.locator("#row-path")).toHaveValue("$object");
  await expect(page.locator("#row-path")).toBeHidden();
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
    .getByRole("button", { name: "Create flowchart", exact: true })
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
