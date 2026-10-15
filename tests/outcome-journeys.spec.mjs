import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
for (const width of [1280, 390]) {
  for (const [slug, action, result] of [
    ["csv-to-nested-json", "Create nested JSON", "#results"],
    ["fix-excel-dates", "Fix dates", "#results"],
    ["meeting-time-finder", "Find times", "#results"],
    ["json-to-csv", "Convert", "#extra-results"],
    ["entity-extractor", "Extract with Jev", "#extra-results"],
    ["text-to-mermaid", "Create diagram", "#extra-results"],
    ["ask-a-webpage", "Find answer", "#extra-results"],
  ])
    test(`${width}px default journey ${slug} (AI responses are regression fixtures)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      let calls = 0;
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/utilities/interpret", async (route) => {
        calls++;
        const { tool, input } = route.request().postDataJSON();
        const plan =
          tool === "entities"
            ? { entities: [{ type: "Person", text: "Ada", start: 0, end: 3 }] }
            : {
                status: "answered",
                excerpts: [
                  { text: input.text, start: 0, end: input.text.length },
                ],
              };
        await route.fulfill({
          json: {
            source: "jev",
            model: "regression-fixture",
            plan,
            confidence: {},
          },
        });
      });
      await page.goto(`/tools/${slug}/`);
      await page.getByRole("button", { name: /^Load example:/ }).click();
      expect(calls).toBe(0);
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(page.locator(result)).toBeVisible();
      expect(calls).toBe(
        ["entity-extractor", "ask-a-webpage"].includes(slug) ? 1 : 0,
      );
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download result", exact: true })
        .click();
      const file = await pending;
      expect(
        (await fs.readFile(await file.path(), "utf8")).length,
      ).toBeGreaterThan(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
}
test("JSON arrays are selected only when unique, nested arrays require explicit policy", async ({
  page,
}) => {
  await page.goto("/tools/json-to-csv/");
  await page
    .locator("#source-text")
    .fill('{"people":[{"id":"001","tags":["x"]}],"orders":[{"id":"002"}]}');
  await page.locator("#extra-run").click();
  await expect(page.locator("#row-path")).toHaveValue("");
  await expect(page.locator("#extra-results")).toBeHidden();
  await page.locator("#row-path").selectOption("people");
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-status")).toContainText("explicit policy");
  await page.locator("#array-policy").selectOption("join");
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-results")).toBeVisible();
});
test("branching AI failure stays visible and manual graph editing recovers without another call", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/utilities/interpret", (route) => {
    calls++;
    return route.fulfill({
      status: 503,
      json: { error: "Inconsistent decision branches." },
    });
  });
  await page.goto("/tools/text-to-mermaid/");
  await page.locator("#source-text").fill("Start\nApproved?\nShip\nReject");
  await page.locator("#diagram-mode").selectOption("jev");
  await page.locator("#instructions").fill("If yes ship, if no reject");
  await page.locator("#create-diagram").click();
  await expect(page.locator("#extra-status")).toContainText(
    "No AI graph was accepted",
  );
  await expect(page.locator("#extra-results")).toBeHidden();
  await page.locator("#prepare-extra").click();
  await page
    .getByLabel("Step 2 type", { exact: true })
    .selectOption("decision");
  await page
    .getByLabel("Step 2 yes destination", { exact: true })
    .selectOption("n2");
  await page
    .getByLabel("Step 2 no destination", { exact: true })
    .selectOption("n3");
  await page
    .getByLabel("Step 3 next destination", { exact: true })
    .selectOption("");
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-output")).toContainText("n1 -->|no| n3");
  expect(calls).toBe(1);
});
test("local uploads and literal CSV header preservation", async ({ page }) => {
  await page.goto("/tools/csv-to-nested-json/");
  await page.locator("#source-file").setInputFiles({
    name: "data.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Client ID,a.b\n001,002"),
  });
  await expect(page.locator("#group-by")).toHaveValue("Client ID");
  await page.locator("#run").click();
  const pending = page.waitForEvent("download");
  await page.locator("#download").click();
  const file = await pending;
  expect(JSON.parse(await fs.readFile(await file.path(), "utf8"))).toEqual([
    { "Client ID": "001", rows: [{ "a.b": "002" }] },
  ]);
});

test("entity correction computes an exact repeated mention and blocks invented text", async ({
  page,
}) => {
  await page.goto("/tools/entity-extractor/");
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page.locator("#entity-review > summary").click();
  await page.getByLabel("Mention 1", { exact: true }).fill("Lin");
  await page.getByLabel("Mention 1", { exact: true }).press("Tab");
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-visual mark").first()).toHaveText(
    "Acme Labs",
  );
  await expect(page.locator("#extra-visual mark").last()).toHaveText("Lin");
  await page.getByLabel("Mention 1", { exact: true }).fill("Invented");
  await page.getByLabel("Mention 1", { exact: true }).press("Tab");
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-results")).toBeHidden();
  await expect(page.locator("#extra-status")).toContainText("exactly match");
});
test("URL action reads then interprets once and preserves truncated coverage and source link (fixtures)", async ({
  page,
}) => {
  const calls = [];
  const source = "Python supports asynchronous I/O.";
  await page.route("**/api/utilities/read-page", (route) => {
    calls.push("read");
    return route.fulfill({
      json: {
        text: source,
        url: "https://docs.python.org/3/library/asyncio.html",
        truncated: true,
      },
    });
  });
  await page.route("**/api/utilities/interpret", (route) => {
    calls.push("interpret");
    expect(route.request().postDataJSON().input.text).toBe(source);
    return route.fulfill({
      json: {
        source: "jev",
        model: "fixture",
        confidence: {},
        plan: {
          status: "answered",
          excerpts: [{ text: source, start: 0, end: source.length }],
        },
      },
    });
  });
  await page.goto("/tools/ask-a-webpage/");
  await page.getByRole("tab", { name: "Public URL", exact: true }).click();
  await page
    .locator("#page-url")
    .fill("https://docs.python.org/3/library/asyncio.html");
  await page.locator("#instructions").fill("What does Python support?");
  expect(calls).toEqual([]);
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-visual blockquote")).toHaveText(source);
  expect(calls).toEqual(["read", "interpret"]);
  await expect(page.locator("#source-coverage")).toContainText("truncated");
  await expect(page.locator("#extra-visual a")).toHaveAttribute(
    "href",
    "https://docs.python.org/3/library/asyncio.html",
  );
});
