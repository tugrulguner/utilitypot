import { fulfillEntityDocumentFixture } from "./helpers/entity-document-fixture.mjs";
import { test, expect } from "@playwright/test";
// UI rendering regression with an explicitly labelled interpretation fixture.
test("flowchart view offers full-size inspection without rerunning inference", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/utilities/interpret", (route) => {
    calls++;
    return fulfillEntityDocumentFixture(route, {
      json: {
        source: "jev",
        model: "fixture",
        confidence: { roles: 1 },
        plan: {
          graph: {
            nodes: [
              { id: "n0", label: "Receive request", type: "process" },
              { id: "n1", label: "Send reply", type: "terminal" },
            ],
            edges: [{ from: "n0", to: "n1", label: "" }],
          },
        },
      },
    });
  });
  await page.goto("/tools/text-to-mermaid/");
  await page.locator("#source-text").fill("Receive request\nSend reply");
  await page
    .locator("#instructions")
    .fill("Receive the request, then send the reply.");
  await page.locator("#create-diagram").click();
  await expect(page.locator("#extra-results")).toBeVisible();
  const fit = page.getByRole("button", { name: "Fit width", exact: true }),
    actual = page.getByRole("button", { name: "Actual size", exact: true });
  await expect(fit).toHaveAttribute("aria-pressed", "true");
  await actual.click();
  await expect(actual).toHaveAttribute("aria-pressed", "true");
  const frame = page.getByTitle("Rendered Mermaid flowchart");
  await expect(frame).toHaveAttribute("sandbox", "");
  const width = await frame.evaluate((e) => ({
    actual: e.getBoundingClientRect().width,
    native: Number(e.dataset.intrinsicWidth),
  }));
  expect(Math.abs(width.actual - width.native)).toBeLessThan(1);
  await fit.click();
  await expect(fit).toHaveAttribute("aria-pressed", "true");
  expect(calls).toBe(1);
});

test("source edits discard stale AI corrections as well as highlighted results", async ({
  page,
}) => {
  await page.route("**/api/utilities/interpret", (route) =>
    fulfillEntityDocumentFixture(route, {
      json: {
        source: "jev",
        model: "fixture",
        confidence: { names: 1 },
        plan: { entities: [{ type: "Person", text: "Ada", start: 0, end: 3 }] },
      },
    }),
  );
  await page.goto("/tools/entity-extractor/");
  await expect(page.locator("#entity-review")).toBeHidden();
  await page.locator("#source-text").fill("Ada joined the team.");
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-results")).toBeVisible();
  await expect(page.locator("#entity-review")).toBeVisible();
  await page.locator("#source-text").fill("A new, unrelated source.");
  await expect(page.locator("#extra-results")).toBeHidden();
  await expect(page.locator("#entity-review")).toBeHidden();
  await expect(page.locator("#entity-editor")).toBeEmpty();
});
