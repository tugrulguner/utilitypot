import { test, expect } from "@playwright/test";
test("actual Worker serves local utilities and fails closed for AI without a key", async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto("/tools/fix-excel-dates/");
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page.getByRole("button", { name: "Fix dates", exact: true }).click();
  await expect(page.locator("#result-view")).toContainText("2026-03-25");
  await page.goto("/tools/entity-extractor/");
  await page.locator("#source-text").fill("Ada joined Acme Labs.");
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toContainText("unavailable");
  await expect(page.locator("#extra-results")).toBeHidden();
  const headers = { Origin: new URL(baseURL).origin };
  const response = await request.post("/api/utilities/interpret", {
    headers,
    data: {
      tool: "qa",
      input: { text: "Inputs stay here.", question: "Where are inputs?" },
    },
  });
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toBe("no-store");
  for (const tool of ["csv", "dates", "meeting", "jsonCsv", "cron"]) {
    const denied = await request.post("/api/utilities/interpret", {
      headers,
      data: { tool, input: {} },
    });
    expect(denied.status()).toBe(400);
  }
  const unknown = await request.get("/api/unknown");
  expect(unknown.status()).toBe(404);
});

test("actual Worker and extracted artifact execute cron locally and export its five instants", async ({
  page,
}) => {
  let api = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) api++;
  });
  await page.goto("/tools/cron-explainer/");
  await page
    .getByLabel("Cron expression", { exact: true })
    .fill("*/15 * * * *");
  await page.getByLabel("Schedule timezone", { exact: true }).fill("UTC");
  await page.getByLabel("Show run times in", { exact: true }).fill("UTC");
  const start = Date.now();
  await page
    .getByRole("button", { name: "Show next five runs", exact: true })
    .click();
  const times = page.locator("#cron-runs time");
  await expect(times).toHaveCount(5);
  const values = await times.evaluateAll((es) => es.map((e) => e.dateTime));
  expect(Date.parse(values[0])).toBeGreaterThan(start);
  for (let i = 1; i < values.length; i++)
    expect(Date.parse(values[i]) - Date.parse(values[i - 1])).toBe(
      15 * 60 * 1000,
    );
  await expect(page.locator(".skip-link")).not.toBeInViewport();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download run times", exact: true })
    .click();
  const download = await event;
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(await download.path(), "utf8");
  for (const value of values) expect(text).toContain(value);
  expect(api).toBe(0);
});
