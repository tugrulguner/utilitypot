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
  await page.getByRole("button", { name: "Load example", exact: true }).click();
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
  await page.goto("/tools/entity-extractor/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.locator("#entity-review > summary").click();
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(page.locator("#extra-visual mark")).toHaveText([
    "Ada",
    "Acme Labs",
  ]);
  await page
    .locator("details")
    .evaluateAll((es) => es.forEach((e) => (e.open = true)));
  await page
    .locator("#review-plan")
    .fill('[{"type":"Person","text":"Invented","start":0,"end":3}]');
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(page.locator("#extra-status")).toContainText("exactly match");
});
test("reviewed Mermaid flowchart renders SVG and downloads valid Mermaid source", async ({
  page,
}) => {
  await page.goto("/tools/text-to-mermaid/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.locator("#graph-panel > summary").click();
  await page.getByRole("button", { name: "Update diagram" }).click();
  await expect(page.locator("#extra-status")).toContainText("sandboxed");
  await expect(page.getByTitle("Rendered Mermaid flowchart")).toHaveAttribute(
    "sandbox",
    "",
  );
  await expect(page.frameLocator("iframe").locator("svg")).toBeVisible();
  await expect(page.locator("#extra-output")).toContainText("n1 -->|yes| n2");
});
test("webpage questions show selected exact evidence and no-answer, using explicit fixtures", async ({
  page,
}) => {
  let payload;
  await page.route("**/api/utilities/interpret", async (route) => {
    payload = route.request().postDataJSON();
    const text = payload.input.text;
    await route.fulfill({
      json: {
        source: "jev",
        model: "fixture",
        confidence: { answerability: 0.95, passage: 0.9 },
        plan: {
          status: "answered",
          excerpts: [
            {
              id: "p2",
              text: text.split("\n\n")[2],
              start: text.indexOf(text.split("\n\n")[2]),
              end: text.length,
            },
          ],
        },
      },
    });
  });
  await page.goto("/tools/ask-a-webpage/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.getByRole("button", { name: "Find answer", exact: true }).click();
  await expect(page.locator("#extra-output")).toContainText(
    "does not store submitted text",
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
  await expect(page.locator("#extra-visual")).toHaveText(
    "Not answered by the supplied source.",
  );
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
        page.getByRole("link", { name: "ModePot", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(slug + "-" + width + ".png"),
      });
    }
  }
  expect(errors).toEqual([]);
});
