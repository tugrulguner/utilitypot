import {
  fixturePlan,
  exampleEntities,
  approvalGraph,
} from "./workflow-fixtures.mjs";
import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("editing a URL during its fixture read cancels the whole answer pipeline", async ({
  page,
}) => {
  let release;
  const gate = new Promise((r) => (release = r));
  let inference = 0;
  await page.route("**/api/utilities/read-page", async (route) => {
    await gate;
    await route.fulfill({
      json: {
        text: "Old source",
        url: "https://docs.python.org/3/",
        truncated: false,
      },
    });
  });
  await page.route("**/api/utilities/interpret", async (route) => {
    inference++;
    await route.fulfill({ status: 503, json: { error: "Must not be called" } });
  });
  await page.goto("/tools/ask-a-webpage/");
  await page.getByRole("tab", { name: "Public URL", exact: true }).click();
  await page.locator("#page-url").fill("https://docs.python.org/3/");
  await page.locator("#instructions").fill("What is this?");
  const pending = page.waitForRequest("**/api/utilities/read-page");
  await page.locator("#extra-ask").click();
  await pending;
  await page
    .locator("#page-url")
    .fill("https://docs.python.org/3/library/json.html");
  release();
  await expect(page.locator("#extra-ask")).toBeEnabled();
  expect(inference).toBe(0);
  await expect(page.locator("#extra-results")).toBeHidden();
});

test("JSON to CSV downloads actual nested values locally", async ({ page }) => {
  await page.goto("/tools/json-to-csv/");
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page.getByRole("button", { name: "Convert" }).click();
  await expect(page.locator("#extra-output")).toContainText("customer.name");
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download result", exact: true })
    .click();
  const d = await promise;
  expect(await fs.readFile(await d.path(), "utf8")).toContain("001,Ada,12");
});
test("entity review validates exact offsets and highlights real source text", async ({
  page,
}) => {
  await fixturePlan(page, { entities: exampleEntities });
  await page.goto("/tools/entity-extractor/");
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page.locator("#extra-ask").click();
  await page.locator("#entity-review > summary").click();
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(page.locator("#extra-visual mark")).toHaveText([
    "Ada",
    "Acme Labs",
  ]);
  await page.getByLabel("Mention 1", { exact: true }).fill("Invented");
  await page.getByLabel("Mention 1", { exact: true }).press("Tab");
  await page
    .getByRole("button", { name: "Update preview", exact: true })
    .click();
  await expect(page.locator("#extra-status")).toContainText("exactly match");
});
for (const [label, entities, expected] of [
  [
    "multiple",
    [
      { type: "Person", text: "Nora", start: 0, end: 4 },
      { type: "Organization", text: "Acme", start: 15, end: 19 },
    ],
    "2 unique entities; 2 mentions across 2 categories. Review each exact source occurrence.",
  ],
  [
    "one",
    [{ type: "Person", text: "Nora", start: 0, end: 4 }],
    "1 unique entity; 1 mention across 1 category. Review each exact source occurrence.",
  ],
  ["none", [], "No matching names or terms found for the selected categories."],
]) {
  test(`entity results show useful ${label} match feedback, not model workflow`, async ({
    page,
  }) => {
    await page.route("**/api/utilities/interpret", (route) =>
      route.fulfill({
        json: {
          source: "jev",
          model: "jev-1.13.0",
          confidence: { t0_m0_start: 1, unused_absence: 0.1 },
          plan: { entities, needsReview: true },
        },
      }),
    );
    await page.goto("/tools/entity-extractor/");
    await page.locator("#source-text").fill("Nora joined at Acme.");
    await page.locator("#extra-ask").click();
    await expect(page.locator("#extra-results")).toBeVisible();
    await expect(page.locator("#extra-status")).toHaveText(expected);
    await expect(page.locator("#extra-status")).not.toHaveClass(/error/);
    await expect(page.locator("#extra-status")).not.toContainText(
      /Jev|proposal|offset|jev-/,
    );
    await expect(page.locator("#extra-visual mark")).toHaveText(
      entities.map((e) => e.text),
    );
  });
}

test("reviewed Mermaid flowchart renders SVG and downloads valid Mermaid source", async ({
  page,
}) => {
  await fixturePlan(page, { graph: approvalGraph });
  await page.goto("/tools/text-to-mermaid/");
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page.locator("#create-diagram").click();
  await page.locator("#graph-panel > summary").click();
  await page.getByRole("button", { name: "Update diagram" }).click();
  await expect(page.locator("#extra-status")).toContainText(
    "Flowchart created",
  );
  await expect(page.getByTitle("Rendered Mermaid flowchart")).toHaveAttribute(
    "sandbox",
    "",
  );
  await expect(page.frameLocator("iframe").locator("svg")).toBeVisible();
  await expect(page.locator("#extra-output")).toContainText("n1 -->|yes| n2");
});
test("captured ModePot answer stays successful when passage confidence is low", async ({
  page,
}) => {
  let payload;
  await page.route("**/api/utilities/interpret", async (route) => {
    payload = route.request().postDataJSON();
    const text = payload.input.text;
    await route.fulfill({
      json: {
        source: "jev",
        model: "jev-1.13.0",
        confidence: { answerability: 1, passage: 0.43 },
        plan: {
          status: "answered",
          excerpts: [
            {
              id: "p3",
              text: "ModePot is an open-source workshop for modernizing software foundations—and inventing what comes next. AI-native and agent-friendly where they add real value.",
              start: text.indexOf("ModePot is an open-source workshop"),
              end:
                text.indexOf("ModePot is an open-source workshop") +
                "ModePot is an open-source workshop for modernizing software foundations—and inventing what comes next. AI-native and agent-friendly where they add real value."
                  .length,
            },
          ],
        },
      },
    });
  });
  await page.goto("/tools/ask-a-webpage/");
  await page
    .locator("#source-text")
    .fill(
      "ModePot is an open-source workshop for modernizing software foundations—and inventing what comes next. AI-native and agent-friendly where they add real value.",
    );
  await page.locator("#instructions").fill("What is this webpage about?");
  await page.getByRole("button", { name: "Find answer", exact: true }).click();
  await expect(page.locator("#extra-results-title")).toHaveText(
    "Source evidence",
  );
  await expect(page.locator("#extra-visual blockquote")).toHaveText(
    "ModePot is an open-source workshop for modernizing software foundations—and inventing what comes next. AI-native and agent-friendly where they add real value.",
  );
  await expect(
    page.locator("#extra-visual [data-evidence-outcome]"),
  ).toContainText("Answer found in the source.");
  await expect(page.locator(".evidence-selection-note")).toContainText(
    "Several passages may fit; review the selected exact excerpt.",
  );
  await expect(page.locator("#extra-status")).not.toHaveClass(/error/);
  await expect(page.locator("#extra-status")).not.toContainText("jev-1.13.0");
  await expect(page.locator("#extra-status")).not.toContainText(
    "evidence selected",
  );
  expect(payload.tool).toBe("qa");
  await page.unroute("**/api/utilities/interpret");
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      json: {
        source: "jev",
        model: "fixture",
        plan: { status: "not-answered", excerpts: [] },
        confidence: {},
      },
    }),
  );
  await page.getByRole("button", { name: "Find answer", exact: true }).click();
  await expect(
    page.locator("#extra-visual [data-evidence-outcome]"),
  ).toHaveText("No answer found in the supplied source.");
  await expect(
    page.locator("#extra-visual [data-evidence-outcome]"),
  ).toContainText("No answer found in the supplied source.");
  await expect(page.locator("#extra-status")).not.toContainText(
    "Several passages may fit",
  );
  await expect(page.locator("#extra-status")).not.toHaveClass(/error/);
});
test("partial reader results state partial evidence without error styling", async ({
  page,
}) => {
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      json: {
        source: "jev",
        model: "fixture",
        confidence: { answerability: 0.55, passage: 0.4 },
        plan: {
          status: "partial",
          excerpts: [
            { id: "p1", text: "A relevant passage.", start: 0, end: 19 },
          ],
        },
      },
    }),
  );
  await page.goto("/tools/ask-a-webpage/");
  await page.locator("#source-text").fill("A relevant passage.");
  await page.locator("#instructions").fill("What happened?");
  await page.getByRole("button", { name: "Find answer", exact: true }).click();
  await expect(page.locator("#extra-visual blockquote")).toHaveText(
    "A relevant passage.",
  );
  await expect(
    page.locator("#extra-visual [data-evidence-outcome]"),
  ).toContainText("Partial evidence found in the source.");
  await expect(page.locator(".evidence-selection-note")).toContainText(
    "Several passages may fit; review the selected exact excerpt.",
  );
  await expect(page.locator("#extra-status")).not.toHaveClass(/error/);
});

test("reader interpretation API failures remain visible errors", async ({
  page,
}) => {
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({ status: 503, json: { error: "Jev is unavailable." } }),
  );
  await page.goto("/tools/ask-a-webpage/");
  await page.locator("#source-text").fill("Source text.");
  await page.locator("#instructions").fill("What is this?");
  await page.getByRole("button", { name: "Find answer", exact: true }).click();
  await expect(page.locator("#extra-status")).toContainText(
    "Jev is unavailable.",
  );
  await expect(page.locator("#extra-status")).toHaveClass(/error/);
  await expect(page.locator("#extra-results")).toBeHidden();
  await expect(page.locator("#extra-ask")).toBeEnabled();
});

test("uncertain answerability is disclosed without calling a valid response an error", async ({
  page,
}) => {
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      json: {
        source: "jev",
        model: "fixture",
        confidence: { answerability: 0.4, passage: 0.95 },
        plan: {
          status: "answered",
          excerpts: [
            { id: "p0", text: "A relevant passage.", start: 0, end: 19 },
          ],
        },
      },
    }),
  );
  await page.goto("/tools/ask-a-webpage/");
  await page.locator("#source-text").fill("A relevant passage.");
  await page.locator("#instructions").fill("What happened?");
  await page.getByRole("button", { name: "Find answer", exact: true }).click();
  await expect(
    page.locator("#extra-visual [data-evidence-outcome]"),
  ).toContainText("Possible answer — review this source evidence.");
  await expect(
    page.locator("#extra-visual [data-evidence-outcome]"),
  ).toBeVisible();
  await expect(page.locator("#extra-status")).not.toHaveClass(/error/);
  await expect(page.locator("#extra-visual blockquote")).toHaveText(
    "A relevant passage.",
  );
});

test("answered response without an excerpt is a failure, not empty success", async ({
  page,
}) => {
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      json: {
        source: "jev",
        model: "fixture",
        confidence: { answerability: 1, passage: 1 },
        plan: { status: "answered", excerpts: [] },
      },
    }),
  );
  await page.goto("/tools/ask-a-webpage/");
  await page.locator("#source-text").fill("A relevant passage.");
  await page.locator("#instructions").fill("What happened?");
  await page.getByRole("button", { name: "Find answer", exact: true }).click();
  await expect(page.locator("#extra-status")).toHaveClass(/error/);
  await expect(page.locator("#extra-results")).toBeHidden();
  await expect(page.locator("#extra-ask")).toBeEnabled();
});

test("all seven utility pages are readable at desktop and mobile widths without runtime errors", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    for (const slug of [
      "csv-to-nested-json",
      "fix-excel-dates",
      "meeting-time-finder",
      "json-to-csv",
      "entity-extractor",
      "text-to-mermaid",
      "ask-a-webpage",
    ]) {
      await page.goto("/tools/" + slug + "/");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page
          .locator("header .family-nav")
          .getByRole("link", { name: "ModePot", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(slug + "-" + width + ".png"),
      });
    }
  }
  expect(errors).toEqual([]);
});

test("bare ModePot URL submits a page read; fetch failure is distinct and never submits AI", async ({
  page,
}) => {
  let inference = 0,
    reads = 0;
  await page.route("**/api/utilities/read-page", async (route) => {
    reads++;
    expect(route.request().postDataJSON()).toEqual({ url: "modepot.io/about" });
    await route.fulfill({
      status: 502,
      json: {
        code: "fetch_unavailable",
        error:
          "The public page could not be fetched. Try again or paste page text.",
      },
    });
  });
  await page.route("**/api/utilities/interpret", async (route) => {
    inference++;
    await route.fulfill({ status: 503, json: { error: "Must not be called" } });
  });
  await page.goto("/tools/ask-a-webpage/");
  await page.getByRole("tab", { name: "Public URL", exact: true }).click();
  await expect(page.getByLabel("Public page URL")).toBeVisible();
  await expect(page.locator("#url-panel")).toContainText("Public HTTP/HTTPS");
  await page.locator("#page-url").fill("modepot.io/about");
  await page.locator("#instructions").fill("What is ModePot?");
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toContainText(
    "could not be fetched",
  );
  expect(reads).toBe(1);
  expect(inference).toBe(0);
  await expect(page.locator("#source-inspection")).toBeHidden();
});
