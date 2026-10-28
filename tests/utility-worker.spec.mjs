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

for (const [date, first, last] of [
  ["2026-03-04", "2026-03-04T14:00:00.000Z", "2026-03-10T13:00:00.000Z"],
  ["2026-10-28", "2026-10-28T13:00:00.000Z", "2026-11-03T14:00:00.000Z"],
])
  test(`actual Worker and extracted artifact preview clock-change week ${date}`, async ({
    page,
  }) => {
    let api = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/")) api++;
    });
    await page.goto("/tools/cron-explainer/");
    await page.getByLabel("Cron expression", { exact: true }).fill("0 9 * * *");
    await page
      .getByLabel("Schedule timezone", { exact: true })
      .fill("America/New_York");
    await page.getByLabel("Show run times in", { exact: true }).fill("UTC");
    await page.getByLabel("Preview", { exact: true }).selectOption("week");
    await page.getByLabel("Week starting", { exact: true }).fill(date);
    await page
      .getByRole("button", { name: "Show selected week", exact: true })
      .click();
    const times = page.locator("#cron-runs time");
    await expect(times).toHaveCount(7);
    await expect(times.first()).toHaveAttribute("datetime", first);
    await expect(times.last()).toHaveAttribute("datetime", last);
    await expect(page.locator("#cron-runs")).toContainText("UTC-05:00");
    await expect(page.locator("#cron-runs")).toContainText("UTC-04:00");
    const event = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download run times", exact: true })
      .click();
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(await (await event).path(), "utf8");
    expect(text.match(/^\d+\. /gm)).toHaveLength(7);
    expect(text).toContain(first);
    expect(text).toContain(last);
    expect(text).toContain("inclusive");
    expect(text).toContain("exclusive");
    expect(api).toBe(0);
  });

test("actual Worker and extracted artifact flatten selected screenshot pixels", async ({
  page,
  context,
}) => {
  await context.route("**/*", (r) =>
    ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  await page.goto("/tools/redact-screenshot/");
  await page
    .locator("#redaction-file")
    .setInputFiles(
      new URL("./fixtures/redaction-review-source.png", import.meta.url)
        .pathname,
    );
  await expect(page.locator("#redaction-canvas")).toHaveJSProperty(
    "width",
    600,
  );
  for (const [id, n] of Object.entries({
    x: 65,
    y: 45,
    width: 360 - 65,
    height: 120 - 45,
  }))
    await page.locator("#redaction-" + id).fill(String(n));
  await page.locator("#redaction-add").click();
  const event = page.waitForEvent("download");
  await page.locator("#redaction-download").click();
  const d = await event;
  expect(d.suggestedFilename()).toBe("redacted.png");
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(await d.path());
  expect(bytes.includes(Buffer.from("PRIVATE_ORIGINAL_SENTINEL"))).toBe(false);
  const pixel = await page.evaluate(
    async (array) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(array)], { type: "image/png" }),
      );
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const x = c.getContext("2d");
      x.drawImage(image, 0, 0);
      return [...x.getImageData(100, 80, 1, 1).data];
    },
    [...bytes],
  );
  expect(pixel).toEqual([0, 0, 0, 255]);
});

test("actual Worker and extracted artifact compare selected XLSX sheets without numeric coercion", async ({
  page,
  context,
}) => {
  await context.route("**/*", (r) =>
    ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  await page.goto("/tools/compare-spreadsheets/");
  for (const name of ["before", "after"]) {
    await page
      .locator("#diff-" + name + "-file")
      .setInputFiles(
        new URL("./fixtures/compare-" + name + ".xlsx", import.meta.url)
          .pathname,
      );
    await page
      .locator("#diff-" + name + "-sheet")
      .selectOption({ label: "Inventory" });
  }
  await page.locator("#diff-key").selectOption("SKU");
  await page.locator("#diff-run").click();
  await expect(page.locator("#diff-counts")).toContainText("1 changed");
  const event = page.waitForEvent("download");
  await page.locator("#diff-json").click();
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(await readFile(await (await event).path(), "utf8"));
  expect(data.rows.some((r) => r.key === "900719925474099312345")).toBe(true);
  expect(data.rows.find((r) => r.key === "000123").before.Formula).toBe(
    "=SUM(C2:C3)",
  );
});
