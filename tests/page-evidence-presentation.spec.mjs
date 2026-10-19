import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { sourceAnswerFixture } from "./helpers/source-answer-fixture.mjs";
const route = "/tools/ask-a-webpage/";
function legacy(
  source,
  spans,
  status = "answered",
  confidence = { raw: 0.81 },
) {
  return {
    source: "jev",
    model: "PRESENTATION FIXTURE — NOT LIVE",
    confidence,
    plan: {
      status,
      excerpts: spans.map(([text, role = "direct"]) => {
        const start = source.indexOf(text);
        return { id: "legacy", start, end: start + text.length, text, role };
      }),
    },
  };
}
function answer(input, data, source) {
  return sourceAnswerFixture(input, data, source);
}
test("article answer retains exact cancellation/refund facts, sources and human Markdown export", async ({
  page,
}) => {
  const source =
      "The service is available worldwide.\n\nYou can cancel at any time before renewal.\n\nRefunds are processed within 14 days.",
    facts = [
      "You can cancel at any time before renewal.",
      "Refunds are processed within 14 days.",
    ];
  await page.route("**/api/utilities/interpret", (r) =>
    r.fulfill({
      json: answer(
        r.request().postDataJSON().input,
        legacy(
          source,
          facts.map((x) => [x]),
        ),
        source,
      ),
    }),
  );
  await page.goto(route);
  await page.locator("#source-text").fill(source);
  await page
    .locator("#instructions")
    .fill("How do cancellation and refunds work?");
  await page.locator("#extra-ask").click();
  const result = page.locator(".source-answer");
  await expect(result).toBeVisible();
  for (const f of facts) await expect(result).toContainText(f);
  await expect(result.locator(".answer-citation")).toHaveCount(2);
  await result.locator(".answer-citation").first().click();
  await expect(result.locator(".answer-sources")).toHaveAttribute("open", "");
  const dl = page.waitForEvent("download");
  await page.locator("#extra-download").click();
  const d = await dl;
  expect(d.suggestedFilename()).toBe("utilitypot-answer.md");
  const md = await readFile(await d.path(), "utf8");
  for (const f of facts) expect(md).toContain(f);
  const json = page.waitForEvent("download");
  await result.locator(".answer-processing > summary").click();
  const btn = result.getByRole("button", {
    name: "Download source data (JSON)",
  });
  await btn.click();
  const jd = await json;
  const obj = JSON.parse(await readFile(await jd.path(), "utf8"));
  expect(obj.confidence["window0.raw"]).toBe(0.81);
  expect(obj.model).toContain("NOT LIVE");
  expect(obj.plan.excerpts.map((x) => x.text)).toEqual(facts);
});
test("not-answered and partial outcomes remain uncertainty rather than errors", async ({
  page,
}) => {
  for (const [status, span, label] of [
    ["not-answered", [], "There isn’t enough relevant information"],
    ["partial", [["Observed", "direct"]], "Some aspects"],
  ]) {
    const source = "Observed text.";
    await page.route("**/api/utilities/interpret", (r) =>
      r.fulfill({
        json: answer(
          r.request().postDataJSON().input,
          legacy(source, span, status),
          source,
        ),
      }),
    );
    await page.goto(route);
    await page.locator("#source-text").fill(source);
    await page.locator("#instructions").fill("A question");
    await page.locator("#extra-ask").click();
    await expect(page.locator(".source-answer")).toContainText(label);
    await expect(
      page.locator(".source-answer .answer-processing"),
    ).toBeVisible();
  }
});
test("low raw confidence does not override declared answered status", async ({
  page,
}) => {
  const source = "The source says something.";
  await page.route("**/api/utilities/interpret", (r) =>
    r.fulfill({
      json: answer(
        r.request().postDataJSON().input,
        legacy(source, [[source]], "answered", { answerability: 0.03 }),
        source,
      ),
    }),
  );
  await page.goto(route);
  await page.locator("#source-text").fill(source);
  await page.locator("#instructions").fill("A review question");
  await page.locator("#extra-ask").click();
  await expect(page.locator(".source-answer .answer-question")).toHaveText(
    "A review question",
  );
  await expect(page.locator(".answer-raw")).toContainText("0.03");
});
test("truncated URL answer retains canonical source link and disclosure", async ({
  page,
}) => {
  const text = "Evidence from the fetched page.";
  await page.route("**/api/utilities/read-page", (r) =>
    r.fulfill({
      json: {
        text,
        url: "https://example.org/final",
        truncated: true,
        redirects: ["https://example.org/start"],
      },
    }),
  );
  await page.route("**/api/utilities/interpret", (r) =>
    r.fulfill({
      json: answer(
        r.request().postDataJSON().input,
        legacy(text, [[text]]),
        text,
      ),
    }),
  );
  await page.goto(route);
  await page.locator("#url-tab").click();
  await page.locator("#page-url").fill("https://example.org/start");
  await page.locator("#instructions").fill("What evidence?");
  await page.locator("#extra-ask").click();
  const result = page.locator(".source-answer");
  await expect(result.locator(".answer-original")).toHaveAttribute(
    "href",
    "https://example.org/final",
  );
  await expect(result.locator(".answer-notice")).toContainText(
    "retrieved portion",
  );
});
