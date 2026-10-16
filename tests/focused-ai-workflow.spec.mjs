import { test, expect } from "@playwright/test";

const routes = {
  jsonCsv: "/tools/json-to-csv/",
  entities: "/tools/entity-extractor/",
  diagram: "/tools/text-to-mermaid/",
  qa: "/tools/ask-a-webpage/",
};

test("JSON to CSV is a fixed local workflow with inspectable selections", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/utilities/**", (route) => {
    calls++;
    return route.abort();
  });
  await page.goto(routes.jsonCsv);
  await expect(page.locator("[data-processing]")).toHaveAttribute(
    "data-processing",
    "local",
  );
  await page.locator("#source-text").fill('[{"id":"001","items":[{"x":2}]}]');
  await expect(page.locator("#row-path")).toBeVisible();
  await expect(page.locator("#array-policy")).toBeVisible();
  await page.locator("#array-policy").selectOption("join");
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-results")).toBeVisible();
  await expect(page.locator("#extra-visual table")).toContainText("001");
  expect(calls).toBe(0);
  await expect(page.locator("#extra-ask")).toHaveCount(0);
  await expect(page.locator("#instructions")).toHaveCount(0);
});

test("AI tools expose one disclosed Jev action and no alternate execution path", async ({
  page,
}) => {
  for (const [tool, path] of Object.entries(routes).filter(
    ([k]) => k !== "jsonCsv",
  )) {
    await page.goto(path);
    await expect(page.locator("[data-processing]")).toHaveAttribute(
      "data-processing",
      "ai",
    );
    await expect(page.locator("#extra-example")).toBeVisible();
    await expect(
      page.locator("#import-plan, #prepare-extra, #review-plan"),
    ).toHaveCount(0);
    if (tool === "entities") {
      await expect(page.locator("#extra-ask")).toHaveText("Find matches");
      await expect(page.locator("#source-text")).toHaveAttribute(
        "maxlength",
        "5000",
      );
      await expect(page.locator("#processing-disclosure")).toBeVisible();
      await expect(page.locator("#example-outcome")).toContainText("source");
    } else if (tool === "diagram") {
      await expect(page.locator("#create-diagram")).toHaveText(
        "Create flowchart",
      );
      await expect(page.locator("#diagram-mode")).toHaveCount(0);
      await expect(page.locator("#processing-disclosure")).toBeVisible();
    } else {
      await expect(page.locator("#extra-ask")).toHaveText("Find answer");
      await expect(page.locator("#processing-disclosure")).toBeVisible();
    }
  }
});

test("entity example loads source inputs, never a fabricated accepted plan", async ({
  page,
}) => {
  await page.goto(routes.entities);
  await page.locator("#extra-example").click();
  await expect(page.locator("#source-text")).toHaveValue(
    /Ada works at Acme Labs/,
  );
  await expect(page.locator("#review-plan")).toHaveCount(0);
  await expect(page.locator("#entity-editor")).toBeEmpty();
});

test("consented entity interpretation is reviewed against the full source", async ({
  page,
}) => {
  let payload;
  const text = "Ada joined Acme Labs. Ada led the review.";
  await page.route("**/api/utilities/interpret", async (route) => {
    payload = route.request().postDataJSON();
    const orgStart = text.indexOf("Acme Labs");
    return route.fulfill({
      json: {
        source: "jev",
        model: "test-fixture",
        confidence: { t0_m0_start: 1 },
        plan: {
          entities: [
            { type: "Person", text: "Ada", start: 0, end: 3 },
            {
              type: "Organization",
              text: "Acme Labs",
              start: orgStart,
              end: orgStart + 9,
            },
          ],
        },
      },
    });
  });
  await page.goto(routes.entities);
  await page.locator("#source-text").fill(text);
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-results")).toBeVisible();
  await expect(page.locator(".entity-document")).toHaveText(text);
  await expect(page.locator(".entity-document mark")).toHaveText([
    "Ada",
    "Acme Labs",
  ]);
  expect(payload.tool).toBe("entities");
  expect(payload.input.text).toBe(text);
});

test("AI transmission requires the primary action with visible, programmatically associated disclosure", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/utilities/interpret", (route) => {
    calls++;
    return route.fulfill({
      status: 503,
      json: { error: "Fixture service unavailable" },
    });
  });
  await page.goto(routes.entities);
  await page.locator("#source-text").fill("Ada works at Acme Labs.");
  const action = page.locator("#extra-ask");
  await expect(action).toHaveAttribute(
    "aria-describedby",
    "processing-disclosure",
  );
  await expect(page.locator("#processing-disclosure")).toContainText(
    "Selecting Find matches sends text",
  );
  expect(calls).toBe(0);
  await action.click();
  await expect(page.locator("#extra-status")).toContainText(
    "No AI matches were accepted",
  );
  expect(calls).toBe(1);
});
