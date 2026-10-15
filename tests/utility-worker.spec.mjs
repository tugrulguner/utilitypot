import { test, expect } from "@playwright/test";
test("actual Worker serves utility assets and fails closed without a key", async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto("/tools/fix-excel-dates/");
  await page
    .locator("details")
    .evaluateAll((es) => es.forEach((e) => (e.open = true)));
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.getByRole("button", { name: "Fix with Jev", exact: true }).click();
  await expect(page.locator("#utility-status")).toContainText(
    "AI is unavailable",
  );
  await page.getByRole("button", { name: "Fix dates", exact: true }).click();
  await expect(page.locator("#result-view")).toContainText("2026-03-25");
  const response = await request.post("/api/utilities/interpret", {
    headers: { Origin: new URL(baseURL).origin },
    data: {
      tool: "dates",
      input: { sample: "03/04/2026", context: "UK export" },
    },
  });
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const unknown = await request.get("/api/unknown");
  expect(unknown.status()).toBe(404);
});
