import { entityWindows } from "../src/lib/utilities/entity-document.js";
import { fulfillEntityDocumentFixture } from "./helpers/entity-document-fixture.mjs";
import { expect, test } from "@playwright/test";

// Explicit provider fixture: validates the existing exact-span presentation, not live Jev quality.
const source =
  "Nora Ivers met Mateo Silva at Willow & Finch.\n\n" +
  "Background context remains readable without adding selected names.\n\n".repeat(
    11,
  ) +
  "\n\nNora Ivers returned to Willow & Finch after visiting Helix Grid.";
const mention = (type, text, last = false) => {
  const start = last ? source.lastIndexOf(text) : source.indexOf(text);
  return { type, text, start, end: start + text.length };
};
const mentions = [
  mention("Person", "Nora Ivers"),
  mention("Person", "Mateo Silva"),
  mention("Person", "Nora Ivers", true),
  mention("Organization", "Willow & Finch"),
  mention("Organization", "Helix Grid"),
  mention("Organization", "Willow & Finch", true),
];
async function showManual(page) {
  await page.route("**/api/utilities/interpret", (route) =>
    fulfillEntityDocumentFixture(route, {
      json: {
        source: "jev",
        model: "TEST FIXTURE — NOT LIVE JEV",
        confidence: {},
        needsReview: true,
        plan: { entities: mentions },
      },
    }),
  );
  await page.goto("/tools/entity-extractor/");
  await page.locator("#source-text").fill(source);
  await page.locator("#extra-ask").click();
  await expect(page.locator(".entity-workspace")).toBeVisible();
}
for (const width of [1280, 390]) {
  test(`fixture-validated NER source has navigable exact occurrences and no inner scroll at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let api = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/utilities/")) api++;
    });
    await page.addInitScript(() => {
      const scrollIntoView = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        if (this.id === "extra-results")
          window.__resultRevealBehavior = options?.behavior;
        return scrollIntoView.call(this, options);
      };
    });
    await showManual(page);
    expect(await page.evaluate(() => window.__resultRevealBehavior)).toBe(
      "auto",
    );
    const workspace = page.locator(".entity-workspace");
    await expect(
      workspace.getByRole("heading", { name: "Person (3)", exact: true }),
    ).toBeVisible();
    await expect(
      workspace.getByRole("heading", { name: "Organization (3)", exact: true }),
    ).toBeVisible();
    const groupBounds = await page
      .locator(".entity-index > section")
      .evaluateAll((nodes) =>
        nodes.map((e) => e.getBoundingClientRect().toJSON()),
      );
    expect(groupBounds).toHaveLength(2);
    expect(groupBounds[1].top).toBeGreaterThanOrEqual(groupBounds[0].bottom);
    const indexBounds = await page.locator(".entity-index").boundingBox();
    for (const box of groupBounds) {
      expect(box.left).toBeGreaterThanOrEqual(indexBounds.x);
      expect(box.right).toBeLessThanOrEqual(indexBounds.x + indexBounds.width);
    }
    expect(await page.locator(".entity-document").textContent()).toBe(source);
    const layout = await page.locator(".entity-document").evaluate((e) => ({
      height: e.getBoundingClientRect().height,
      maxHeight: getComputedStyle(e).maxHeight,
      overflowY: getComputedStyle(e).overflowY,
    }));
    expect(layout.height).toBeGreaterThan(700);
    expect(layout.maxHeight).toBe("none");
    expect(["auto", "scroll"]).not.toContain(layout.overflowY);
    const jump = workspace.getByRole("button", {
      name: "Person Nora Ivers, occurrence 2",
      exact: true,
    });
    await jump.focus();
    await page.keyboard.press("Enter");
    const selected = workspace.locator("mark.is-current");
    await expect(selected).toHaveText("Nora Ivers");
    await expect(selected).toBeFocused();
    await expect(selected).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Back to matches", exact: true }),
    ).toBeInViewport();
    await page
      .getByRole("button", { name: "Back to matches", exact: true })
      .click();
    await expect(jump).toBeFocused();
    await expect(jump).toBeInViewport();
    await expect(page.locator(".entity-index")).toBeInViewport();
    await expect(workspace).not.toContainText("Up to 3 mentions per category");
    await expect(workspace).toContainText(
      "Review each name and its exact source occurrences.",
    );
    const download = page.waitForEvent("download");
    await page.locator("#extra-download").click();
    const file = await download;
    const fs = await import("node:fs/promises");
    expect(JSON.parse(await fs.readFile(await file.path(), "utf8"))).toEqual(
      [...mentions].sort(
        (a, b) =>
          a.start - b.start || a.end - b.end || a.type.localeCompare(b.type),
      ),
    );
    expect(api).toBe(entityWindows(source).length);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.locator("#source-text").fill("Changed source");
    await expect(page.locator("#extra-results")).toBeHidden();
    await expect(page.locator(".entity-workspace")).toHaveCount(0);
  });
}
