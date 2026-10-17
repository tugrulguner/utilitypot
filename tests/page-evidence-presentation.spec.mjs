import { test, expect } from "@playwright/test";

const route = "/tools/ask-a-webpage/";

test("page evidence presents answer, navigable exact passages, provenance and unchanged export", async ({
  page,
}) => {
  const source =
    "The service is available worldwide.\n\nYou can cancel at any time before renewal.\n\nRefunds are processed within 14 days.";
  const excerpts = [
    {
      id: "p1",
      start: source.indexOf("You can cancel"),
      end:
        source.indexOf("You can cancel") +
        "You can cancel at any time before renewal.".length,
      text: "You can cancel at any time before renewal.",
    },
    {
      id: "p2",
      start: source.indexOf("Refunds"),
      end: source.length,
      text: "Refunds are processed within 14 days.",
    },
  ];
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      json: {
        source: "jev",
        model: "presentation-fixture",
        confidence: { answerability: 0.81, passage: 0.52 },
        plan: { status: "answered", excerpts },
      },
    }),
  );
  await page.goto(route);
  await page.locator("#source-text").fill(source);
  await page
    .locator("#instructions")
    .fill("How do cancellation and refunds work?");
  await page.locator("#extra-ask").click();
  const result = page.locator("#extra-visual");
  await expect(result.locator("[data-evidence-outcome]")).toContainText(
    "Answer found",
  );
  await expect(result.locator(".evidence-selection-note")).toContainText(
    "Several passages may fit",
  );
  await expect(result.locator("[data-passage-nav] button")).toHaveCount(2);
  await expect(result.locator("[data-passage-text]")).toHaveText(
    excerpts[0].text,
  );
  await expect(result.locator("[data-evidence-source]")).toContainText(
    "Pasted text",
  );
  await expect(result.locator("details")).toHaveCount(2);
  await expect(result.locator(".evidence-provenance")).toHaveJSProperty(
    "open",
    false,
  );
  await page.keyboard.press("Tab");
  await result.locator("[data-passage-nav] button").nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(result.locator("[data-passage-text]")).toHaveText(
    excerpts[1].text,
  );
  const download = page.waitForEvent("download");
  await page.locator("#extra-download").click();
  const file = await download;
  const fs = await import("node:fs/promises");
  const bytes = await fs.readFile(await file.path());
  expect(bytes.toString("utf8")).toBe(
    await page.locator("#extra-output").textContent(),
  );
  const parsed = JSON.parse(bytes.toString("utf8"));
  expect(parsed.excerpts).toEqual(excerpts);
  expect(parsed).not.toHaveProperty("confidence");
  expect(parsed).not.toHaveProperty("model");
  await result.locator(".evidence-provenance > summary").click();
  await expect(result.locator(".evidence-metadata")).toContainText("0.81");
  await expect(result.locator(".evidence-metadata")).toContainText(
    "presentation-fixture",
  );
});

test("page evidence distinguishes not-found and partial outcomes without false certainty", async ({
  page,
}) => {
  for (const [status, excerpt, label] of [
    ["not-answered", [], "No answer found"],
    [
      "partial",
      [{ id: "p1", start: 0, end: 8, text: "Observed" }],
      "Partial evidence",
    ],
  ]) {
    await page.route("**/api/utilities/interpret", (route) =>
      route.fulfill({
        json: {
          source: "jev",
          model: "presentation-fixture",
          confidence: { answerability: 0.41, passage: 0.7 },
          plan: { status, excerpts: excerpt },
        },
      }),
    );
    await page.goto(route);
    await page.locator("#source-text").fill("Observed text.");
    await page.locator("#instructions").fill("A question");
    await page.locator("#extra-ask").click();
    await expect(
      page.locator("#extra-visual [data-evidence-outcome]"),
    ).toContainText(label);
  }
});

test("low answerability confidence remains a possible answer, not a not-found claim", async ({
  page,
}) => {
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      json: {
        source: "jev",
        model: "presentation-fixture",
        confidence: { answerability: 0.43, passage: 0.91 },
        plan: {
          status: "answered",
          excerpts: [
            {
              id: "p0",
              start: 0,
              end: "The source says something.".length,
              text: "The source says something.",
            },
          ],
        },
      },
    }),
  );
  await page.goto(route);
  await page.locator("#source-text").fill("The source says something.");
  await page.locator("#instructions").fill("A review question");
  await page.locator("#extra-ask").click();
  await expect(page.locator("[data-evidence-outcome]")).toContainText(
    "Possible answer",
  );
  await expect(page.locator("[data-evidence-outcome]")).not.toContainText(
    "No answer found",
  );
});

test("truncated URL evidence retains its source link and coverage disclosure", async ({
  page,
}) => {
  const text = "Evidence from the fetched page.";
  await page.route("**/api/utilities/read-page", (route) =>
    route.fulfill({
      json: {
        text,
        url: "https://example.org/final",
        truncated: true,
        redirects: ["https://example.org/start"],
      },
    }),
  );
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      json: {
        source: "jev",
        model: "presentation-fixture",
        confidence: { answerability: 0.9, passage: 0.9 },
        plan: {
          status: "answered",
          excerpts: [{ id: "p1", start: 0, end: text.length, text }],
        },
      },
    }),
  );
  await page.goto(route);
  await page.locator("#url-tab").click();
  await page.locator("#page-url").fill("https://example.org/start");
  await page.locator("#instructions").fill("What evidence?");
  await page.locator("#extra-ask").click();
  const result = page.locator("#extra-visual");
  await expect(result.locator("[data-evidence-source]")).toContainText(
    "example.org",
  );
  await expect(result.locator(".evidence-coverage-note")).toContainText(
    "truncated",
  );
  await expect(result.locator(".evidence-provenance")).toContainText(
    "truncated",
  );
});
