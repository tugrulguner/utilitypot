import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("a newer Jev request invalidates an older pending page read", async ({
  page,
}) => {
  let releaseRead, releaseAsk;
  const readStarted = new Promise((resolve) => {
    page.route("**/api/utilities/read-page", async (route) => {
      await new Promise((release) => {
        releaseRead = release;
        resolve();
      });
      await route.fulfill({
        json: {
          text: "Different source B.",
          url: "https://docs.python.org/3/",
          truncated: false,
        },
      });
    });
  });
  const askStarted = new Promise((resolve) => {
    page.route("**/api/utilities/interpret", async (route) => {
      const source = route.request().postDataJSON().input.text;
      await new Promise((release) => {
        releaseAsk = release;
        resolve();
      });
      await route.fulfill({
        json: {
          source: "jev",
          model: "fixture",
          plan: { status: "answered", excerpts: [{ id: "p0", text: source }] },
          confidence: {},
        },
      });
    });
  });
  await page.goto("/tools/ask-a-webpage/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  const original = await page.locator("#source-text").inputValue();
  await page.locator("#page-url").fill("https://docs.python.org/3/");
  await page.locator("#extra-consent").check();
  await page.locator("#read-page").click();
  await readStarted;
  await page.locator("#extra-ask").click();
  await askStarted;
  releaseRead();
  await expect(page.locator("#read-page")).toBeEnabled();
  await expect(page.locator("#source-text")).toHaveValue(original);
  releaseAsk();
  await expect(page.locator("#extra-results")).toBeVisible();
  await expect(page.locator("#extra-output")).toContainText(
    "does not store submitted text",
  );
  await expect(page.locator("#source-text")).toHaveValue(original);
});

test("JSON to CSV downloads actual nested values locally", async ({ page }) => {
  await page.goto("/tools/json-to-csv/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.locator("#extra-reviewed").check();
  await page
    .getByRole("button", { name: "Convert JSON to CSV locally" })
    .click();
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
  await page.locator("#extra-reviewed").check();
  await page
    .getByRole("button", { name: "Validate and export entities" })
    .click();
  await expect(page.locator("#extra-visual mark")).toHaveText([
    "Ada",
    "Acme Labs",
  ]);
  await page
    .locator("#review-plan")
    .fill('[{"type":"Person","text":"Invented","start":0,"end":3}]');
  await page.locator("#extra-reviewed").check();
  await page
    .getByRole("button", { name: "Validate and export entities" })
    .click();
  await expect(page.locator("#extra-status")).toContainText("exactly match");
});
test("reviewed Mermaid flowchart renders SVG and downloads valid Mermaid source", async ({
  page,
}) => {
  await page.goto("/tools/text-to-mermaid/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.locator("#extra-reviewed").check();
  await page.getByRole("button", { name: "Render Mermaid locally" }).click();
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
          excerpts: [{ id: "p2", text: text.split("\n\n")[2] }],
        },
      },
    });
  });
  await page.goto("/tools/ask-a-webpage/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.locator("#extra-consent").check();
  await page.getByRole("button", { name: "Ask Jev", exact: true }).click();
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
  await page.getByRole("button", { name: "Ask Jev", exact: true }).click();
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
