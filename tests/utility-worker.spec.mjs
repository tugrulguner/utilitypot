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
  for (const tool of ["csv", "dates", "meeting", "jsonCsv"]) {
    const denied = await request.post("/api/utilities/interpret", {
      headers,
      data: { tool, input: {} },
    });
    expect(denied.status()).toBe(400);
  }
  const unknown = await request.get("/api/unknown");
  expect(unknown.status()).toBe(404);
});
