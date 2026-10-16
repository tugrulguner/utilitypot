import { test, expect } from "@playwright/test";

// Deliberate browser fault injection, NOT live/provider qualification.
const routes = [
  "csv-to-nested-json",
  "fix-excel-dates",
  "meeting-time-finder",
  "json-to-csv",
  "entity-extractor",
  "text-to-mermaid",
  "ask-a-webpage",
];
for (const slug of routes) {
  test(`no JavaScript: ${slug} actions are disabled and explain recovery`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL: test.info().project.use.baseURL,
    });
    try {
      const page = await context.newPage();
      await page.goto(`/tools/${slug}/`);
      const buttons = page.locator(".utility-app button");
      expect(await buttons.count()).toBeGreaterThan(0);
      for (const button of await buttons.all())
        await expect(button).toBeDisabled();
      await expect(page.locator("#utility-startup")).toBeVisible();
      await expect(page.locator("#utility-startup")).toContainText(
        "JavaScript",
      );
      // Assert emitted fallback markup too: CDP script disabling does not
      // consistently expose noscript descendants through text locators.
      expect(await page.content()).toContain("Enable JavaScript, then reload");
    } finally {
      await context.close();
    }
  });
}

test("blocked extra module gives actionable failure and retains copyable input", async ({
  page,
}) => {
  await page.clock.install();
  let apiCalls = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/utilities/")) apiCalls++;
  });
  await page.route("**/_astro/*UtilityApp*.js", (route) =>
    route.abort("failed"),
  );
  await page.goto("/tools/json-to-csv/");
  await page.locator("#source-text").fill('[{"id":"keep-this-input"}]');
  await expect(page.locator("#extra-run")).toBeDisabled();
  await page.clock.runFor(12001);
  await expect(page.locator("#utility-startup")).toContainText("reload");
  await expect(page.locator("#source-text")).toHaveValue(
    '[{"id":"keep-this-input"}]',
  );
  expect(apiCalls).toBe(0);
});

test("blocked main module gives a failure state without sending source", async ({
  page,
}) => {
  await page.clock.install();
  let apiCalls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/utilities/")) apiCalls++;
  });
  await page.route("**/_astro/*UtilityApp*.js", (r) => r.abort("failed"));
  await page.goto("/tools/csv-to-nested-json/");
  await page.locator("#csv-input").fill("Team,Task\nV-42,Registration");
  await expect(page.locator("#run")).toBeDisabled();
  await page.clock.runFor(12001);
  await expect(page.locator("#utility-startup")).toContainText("reload");
  await expect(page.locator("#csv-input")).toHaveValue(
    "Team,Task\nV-42,Registration",
  );
  expect(apiCalls).toBe(0);
});

for (const scenario of [
  {
    slug: "json-to-csv",
    source: "#source-text",
    button: "#extra-run",
    text: '[{"id":"pre-init-paste"}]',
  },
  {
    slug: "csv-to-nested-json",
    source: "#csv-input",
    button: "#run",
    text: "Team,Task\nV-42,Registration",
  },
]) {
  test(`held module preserves early input and enables a working ${scenario.slug}`, async ({
    page,
  }) => {
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("**/_astro/*UtilityApp*.js", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`/tools/${scenario.slug}/`, { waitUntil: "commit" });
    try {
      await page.locator(scenario.source).fill(scenario.text);
      await expect(page.locator(scenario.button)).toBeDisabled();
    } finally {
      release();
    }
    await expect(page.locator(scenario.button)).toBeEnabled();
    await expect(page.locator("#utility-startup")).toBeHidden();
    await expect(page.locator(scenario.source)).toHaveValue(scenario.text);
    if (scenario.slug === "csv-to-nested-json")
      await page.locator("#group-by").selectOption("Team");
    await page.locator(scenario.button).click();
    await expect(
      page.locator(
        scenario.slug === "json-to-csv" ? "#extra-results" : "#results",
      ),
    ).toContainText(
      scenario.slug === "json-to-csv" ? "pre-init-paste" : "V-42",
    );
  });
}

test("unsafe numeric IDs stop local and AI conversion, including upload; quoted correction exports exact digits", async ({
  page,
}) => {
  let apiCalls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/utilities/")) apiCalls++;
  });
  await page.goto("/tools/json-to-csv/");
  const unsafe = '[{"transactionId":9007199254740993}]';
  await page.locator("#source-text").fill(unsafe);
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-status")).toContainText(
    "Quote identifiers",
  );
  await expect(page.locator("#extra-results")).toBeHidden();
  await page.getByText("Choose records with Jev", { exact: true }).click();
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toContainText(
    "Quote identifiers",
  );
  await page.locator("#source-file").setInputFiles({
    name: "payments.json",
    mimeType: "application/json",
    buffer: Buffer.from(unsafe),
  });
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-results")).toBeHidden();
  expect(apiCalls).toBe(0);
  await page
    .locator("#source-text")
    .fill('[{"transactionId":"9007199254740993","approved":false,"amount":0}]');
  await page.locator("#extra-run").click();
  const pending = page.waitForEvent("download");
  await page.locator("#extra-download").click();
  const download = await pending;
  const path = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(path);
  const { readFile } = await import("node:fs/promises");
  expect(await readFile(path, "utf8")).toContain("9007199254740993,false,0");
});
