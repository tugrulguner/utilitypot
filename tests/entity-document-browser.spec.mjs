import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
// Protocol-correct presentation oracle, not live-provider quality evidence.
function reply(input) {
  const names = [...input.text.matchAll(/Ada \d+/g)].map((m) => ({
    type: "Person",
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
  const entities = [],
    continuation = [];
  for (const line of input.definitions.split("\n")) {
    const type = line.slice(0, line.indexOf(":"));
    const after = input.after[type];
    const picked = names
      .filter(
        (e) => e.type === type && e.start >= after && e.start < input.range.end,
      )
      .slice(0, 3);
    entities.push(...picked);
    continuation.push({
      type,
      starts: picked.map((e) => e.start),
      after: Math.max(after, ...picked.map((e) => e.end)),
      exhausted: picked.length < 3,
      batchSize: 3,
    });
  }
  return {
    source: "jev",
    model: "PROTOCOL FIXTURE — NOT LIVE",
    confidence: { fixture: 0.9 },
    plan: { entities, continuation },
  };
}
const text =
  "  " +
  Array.from({ length: 165 }, () => "word").join(" ") +
  "\n\n" +
  Array.from({ length: 6 }, (_, i) => `Ada ${i}`).join(" met ") +
  "  ";
test("complete source beyond120 tokens and3 names renders, reviews and exports exact global spans", async ({
  page,
}) => {
  test.setTimeout(120000);
  let calls = 0;
  await page.route("**/api/utilities/interpret", (route) => {
    calls++;
    return route.fulfill({ json: reply(route.request().postDataJSON().input) });
  });
  await page.goto("/tools/entity-extractor/");
  await page.locator("#source-text").fill(text);
  await page.locator("#extra-ask").click();
  await page
    .locator(".entity-workspace, #extra-status.error")
    .first()
    .waitFor({ timeout: 90000 });
  await expect(page.locator(".entity-workspace")).toBeVisible({
    timeout: 2000,
  });
  await expect(page.locator(".entity-document")).toHaveText(text, {
    useInnerText: false,
  });
  await expect(
    page.locator(".entity-category-chip").filter({ hasText: "Person" }),
  ).toContainText("6");
  expect(calls).toBeGreaterThan(2);
  const download = page.waitForEvent("download");
  await page.locator("#extra-download").click();
  const items = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  expect(items).toHaveLength(6);
  for (const e of items) expect(text.slice(e.start, e.end)).toBe(e.text);
  await page.locator(".entity-occurrence").last().click();
  await expect(page.locator("mark.is-current")).toHaveText("Ada 5");
  await expect(page.locator("#extra-status")).not.toContainText("120");
  await expect(page.locator(".entity-workspace")).not.toContainText("Up to 3");
});
test("a later failed window accepts no partial names or export", async ({
  page,
}) => {
  test.setTimeout(60000);
  let calls = 0;
  await page.route("**/api/utilities/interpret", (route) =>
    ++calls === 2
      ? route.fulfill({
          status: 503,
          json: { error: "Processing is unavailable." },
        })
      : route.fulfill({ json: reply(route.request().postDataJSON().input) }),
  );
  await page.goto("/tools/entity-extractor/");
  await page.locator("#source-text").fill("Ada 0 " + text);
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toHaveClass(/error/, {
    timeout: 45000,
  });
  await expect(page.locator("#extra-results")).toBeHidden();
  await expect(page.locator(".entity-workspace")).toHaveCount(0);
  expect(calls).toBe(2);
});
test("editing the source cancels pending inference and prevents remaining windows", async ({
  page,
}) => {
  let release;
  const gate = new Promise((r) => (release = r));
  let calls = 0;
  await page.route("**/api/utilities/interpret", async (route) => {
    calls++;
    const data = reply(route.request().postDataJSON().input);
    await gate;
    await route.fulfill({ json: data });
  });
  await page.goto("/tools/entity-extractor/");
  await page.locator("#source-text").fill(text);
  await page.locator("#extra-ask").click();
  await expect.poll(() => calls).toBe(1);
  await page.locator("#source-text").fill("Different source");
  release();
  await expect(page.locator("#extra-ask")).toBeEnabled();
  await expect(page.locator("#extra-results")).toBeHidden();
  await expect(page.locator("#source-text")).toHaveValue("Different source");
  expect(calls).toBe(1);
});
