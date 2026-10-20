import { test, expect } from "@playwright/test";
import { fulfillEntityDocumentFixture } from "./helpers/entity-document-fixture.mjs";
import { fulfillSourceAnswerFixture } from "./helpers/source-answer-fixture.mjs";
import { approvalGraph } from "./workflow-fixtures.mjs";
const tools = [
  ["csv-to-nested-json", "Create nested JSON"],
  ["fix-excel-dates", "Fix dates"],
  ["meeting-time-finder", "Find times"],
  ["cron-explainer", "Show next five runs"],
  ["json-to-csv", "Convert"],
  ["entity-extractor", "Extract names"],
  ["text-to-mermaid", "Create flowchart"],
  ["ask-a-webpage", "Find answer"],
];
const ai = new Set(["entity-extractor", "text-to-mermaid", "ask-a-webpage"]);
async function fixtures(page, state) {
  await page.route("**/api/utilities/read-page", (r) => r.abort());
  await page.route("**/api/utilities/interpret", async (route) => {
    state.calls++;
    if (state.fail)
      return route.fulfill({
        status: 503,
        json: { error: "Controlled verification outage." },
      });
    const { tool, input } = route.request().postDataJSON();
    const text =
      tool === "qa"
        ? await page.locator("#source-text").inputValue()
        : input.text;
    const plan =
      tool === "entities"
        ? { entities: [{ type: "Person", text: "Ada", start: 0, end: 3 }] }
        : tool === "diagram"
          ? { graph: approvalGraph }
          : {
              status: "answered",
              excerpts: [{ text, start: 0, end: text.length }],
            };
    return (
      tool === "qa" ? fulfillSourceAnswerFixture : fulfillEntityDocumentFixture
    )(
      route,
      {
        json: {
          source: "jev",
          model: "feedback-presentation-fixture",
          plan,
          confidence: {},
        },
      },
      () => page.locator("#source-text").inputValue(),
    );
  });
}
async function verifyLink(page, link, slug, label) {
  await expect(link).toHaveText(new RegExp("^" + label + "\\s*↗$"));
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toHaveClass(/ph-no-autocapture/);
  await expect(link).toHaveCSS("text-decoration-line", "underline");
  await expect(link).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const href = await link.getAttribute("href"),
    url = new URL(href);
  expect(url.origin + url.pathname).toBe(
    "https://github.com/tugrulguner/utilitypot/issues/new",
  );
  expect(url.searchParams.get("body")).toContain(
    "Page: https://utilitypot.modepot.io/tools/" + slug + "/",
  );
  for (const marker of [
    "RAW_PRIVATE_SENTINEL",
    "QUERY_PRIVATE_SENTINEL",
    "RESULT_PRIVATE_SENTINEL",
    "PRIVATE_FRAGMENT",
  ])
    expect(decodeURIComponent(href)).not.toContain(marker);
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport();
  const hit = await link.evaluate((e) => {
    const r = e.getBoundingClientRect(),
      p = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { height: r.height, hit: p === e || e.contains(p) };
  });
  expect(hit.height).toBeGreaterThanOrEqual(44);
  expect(hit.hit).toBe(true);
  await link.focus();
  await expect(link).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
for (const width of [1280, 320])
  for (const [slug, action] of tools) {
    test(`${slug}: report beside exports at ${width}px (AI fixtures)`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const state = { calls: 0, fail: false };
      await fixtures(page, state);
      await page.goto(
        "/tools/" + slug + "/?marker=QUERY_PRIVATE_SENTINEL#PRIVATE_FRAGMENT",
      );
      await page
        .getByLabel("Color theme", { exact: true })
        .selectOption(width === 320 ? "dark" : "light");
      await page.getByRole("button", { name: /^Load example:/ }).click();
      if (slug === "csv-to-nested-json")
        await page
          .locator("#csv-input")
          .fill(
            (await page.locator("#csv-input").inputValue()).replace(
              "Ada",
              "RAW_PRIVATE_SENTINEL",
            ),
          );
      if (slug === "ask-a-webpage")
        await page
          .locator("#source-text")
          .fill(
            (await page.locator("#source-text").inputValue()) +
              "\nRAW_PRIVATE_SENTINEL",
          );
      await page.getByRole("button", { name: action, exact: true }).click();
      const result = page.locator("#results, #extra-results");
      await expect(result).toBeVisible();
      const report = result.locator('a[data-tool-feedback="result"]');
      await verifyLink(page, report, slug, "Report an issue");
      expect(
        await report.evaluate((e) =>
          Boolean(e.closest(".actions, .reader-result-toolbar")),
        ),
      ).toBe(true);
      await expect(page.locator('[data-tool-feedback="error"]')).toBeHidden();
      await expect(
        page.locator(".utility-main > .utility-support"),
      ).toHaveCount(0);
      await expect(
        page.locator(".utility-footer .feedback-link a"),
      ).toHaveCount(1);
      expect(state.calls).toBe(ai.has(slug) ? 1 : 0);
      await page.screenshot({
        path: info.outputPath(slug + "-" + width + "-result.png"),
      });
    });
    test(`${slug}: report beside actual failure and hide on recovery at ${width}px (controlled errors)`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const state = { calls: 0, fail: ai.has(slug) };
      await fixtures(page, state);
      await page.goto(
        "/tools/" + slug + "/?marker=QUERY_PRIVATE_SENTINEL#PRIVATE_FRAGMENT",
      );
      await page
        .getByLabel("Color theme", { exact: true })
        .selectOption(width === 320 ? "dark" : "light");
      const error = page.locator('[data-tool-feedback="error"]');
      await expect(error).toBeHidden();
      await page.getByRole("button", { name: /^Load example:/ }).click();
      if (slug === "csv-to-nested-json")
        await page.locator("#csv-input").fill("");
      if (slug === "fix-excel-dates")
        await page.locator("#dates-input").fill("");
      if (slug === "meeting-time-finder")
        await page.locator("#duration").fill("0");
      if (slug === "cron-explainer")
        await page.locator("#cron-expression").fill("RAW_PRIVATE_SENTINEL");
      if (slug === "json-to-csv")
        await page.locator("#source-text").fill("{ RAW_PRIVATE_SENTINEL");
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(error).toBeVisible();
      const status = page.locator("#utility-status, #extra-status");
      await expect(status).toHaveClass(/error/);
      if (slug === "csv-to-nested-json") {
        // Missing-input validation keeps focus at the repair field. Read its error
        // without changing that recovery behavior; the report must be beside it.
        await expect(page.locator("#csv-input")).toBeFocused();
        await status.evaluate((e) =>
          e.scrollIntoView({ block: "center", behavior: "instant" }),
        );
      }
      await expect(error).toBeInViewport();
      const before = await status.boundingBox();
      expect(before.y).toBeGreaterThanOrEqual(0);
      expect(before.y + before.height).toBeLessThanOrEqual(900);
      await verifyLink(page, error, slug, "Report this problem");
      await page.screenshot({
        path: info.outputPath(slug + "-" + width + "-error.png"),
      });
      state.fail = false;
      if (slug === "csv-to-nested-json")
        await page.locator("#csv-input").fill("Customer,Name\n001,Ada");
      if (slug === "fix-excel-dates")
        await page.locator("#dates-input").fill("2026-03-06");
      if (slug === "meeting-time-finder")
        await page.locator("#duration").fill("30");
      if (slug === "cron-explainer")
        await page.locator("#cron-expression").fill("0 9 * * *");
      if (slug === "json-to-csv")
        await page.locator("#source-text").fill('[{"name":"Ada"}]');
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(page.locator('[data-tool-feedback="result"]')).toBeVisible();
      await expect(error).toBeHidden();
    });
  }
