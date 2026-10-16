import { test, expect } from "@playwright/test";
const slugs = [
  "csv-to-nested-json",
  "fix-excel-dates",
  "meeting-time-finder",
  "json-to-csv",
  "entity-extractor",
  "text-to-mermaid",
  "ask-a-webpage",
];
test.beforeEach(async ({ page }) => {
  await page.route("**/*posthog.com/**", (route) => route.abort());
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"Unavailable fixture"}',
    }),
  );
});
for (const slug of slugs)
  test(`${slug}: attribution, related tools and project roots on mobile`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/tools/${slug}/`);
    const intro = page.locator('[data-discovery-surface="intro"]');
    await expect(
      intro.getByRole("link", { name: "ModePot", exact: true }),
    ).toHaveAttribute("href", "https://modepot.io/");
    await expect(
      intro.getByRole("link", { name: "Tugrul Guner", exact: true }),
    ).toHaveAttribute("href", "https://tugrul.modepot.io/");
    await expect(page.locator("[data-result-discovery]")).toBeHidden();
    await expect(page.locator("[data-project-showcase]")).toBeVisible();
    const related = page.locator("[data-related-tools] a");
    expect(await related.count()).toBe(2);
    for (const href of await related.evaluateAll((es) =>
      es.map((e) => e.getAttribute("href")),
    )) {
      expect(href).not.toBe(`/tools/${slug}/`);
      expect(slugs.some((s) => href === `/tools/${s}/`)).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
for (const [slug, run, edit] of [
  ["csv-to-nested-json", "#run", "#csv-input"],
  ["fix-excel-dates", "#run", "#dates-input"],
  ["meeting-time-finder", "#run", "#duration"],
  ["json-to-csv", "#extra-run", "#source-text"],
  ["entity-extractor", "#extra-run", "#source-text"],
  ["text-to-mermaid", "#extra-run", "#source-text"],
])
  test(`${slug}: completed private result then edit clears discovery`, async ({
    page,
  }) => {
    let api = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/")) api++;
    });
    await page.goto(`/tools/${slug}/`);
    await page.getByRole("button", { name: /^Load example:/ }).click();
    await page
      .locator("details")
      .evaluateAll((es) => es.forEach((e) => (e.open = true)));
    await page.locator(run).click();
    const discovery = page.locator("[data-result-discovery]");
    await expect(discovery).toBeVisible();
    expect(
      await discovery.evaluate(
        (e) =>
          !!(
            e.compareDocumentPosition(
              document.querySelector("#copy, #extra-copy"),
            ) & Node.DOCUMENT_POSITION_PRECEDING
          ),
      ),
    ).toBe(true);
    await page
      .locator(edit)
      .fill(edit === "#duration" ? "45" : "PRIVATE_EDIT_SENTINEL");
    await expect(discovery).toBeHidden();
    expect(api).toBe(0);
  });
test("portfolio telemetry preserves primary, keyboard and middle navigation without duplicates", async ({
  page,
}) => {
  await page.goto("/tools/fix-excel-dates/");
  await page.evaluate(() => {
    window.__events = [];
    window.__linkChecks = [];
    window.posthog.capture = (event, properties, options) =>
      window.__events.push({ event, properties, options });
    for (const type of ["click", "auxclick"])
      document.addEventListener(type, (event) => {
        if (!event.target.closest("a[data-discovery-destination]")) return;
        // Observe application behavior before this test prevents external navigation.
        window.__linkChecks.push({
          type,
          button: event.button,
          prevented: event.defaultPrevented,
        });
        event.preventDefault();
      });
  });
  await page.locator("#dates-input").fill("2026-01-02");
  await page.locator("#run").click();
  const link = page.locator("[data-result-discovery] a").first();
  await expect(link).toHaveClass(/ph-no-autocapture/);
  await link.click();
  await link.focus();
  await link.press("Enter");
  await link.click({ button: "middle" });
  await link.dispatchEvent("auxclick", { button: 2 });
  const events = await page.evaluate(() => window.__events);
  const intents = events.filter((e) => e.event === "modepot_clicked");
  expect(intents).toHaveLength(3);
  for (const intent of intents)
    expect(intent).toEqual({
      event: "modepot_clicked",
      properties: {
        destination: "https://modepot.io/",
        surface: "utility_result",
      },
      options: { transport: "sendBeacon", send_instantly: true },
    });
  expect(await page.evaluate(() => window.__linkChecks)).toEqual([
    { type: "click", button: 0, prevented: false },
    { type: "click", button: 0, prevented: false },
    { type: "auxclick", button: 1, prevented: false },
    { type: "auxclick", button: 2, prevented: false },
  ]);
  expect(
    events.some(
      (e) =>
        e.event === "utility_action_completed" &&
        e.properties.outcome === "success",
    ),
  ).toBe(true);
  expect(JSON.stringify(events)).not.toContain("2026-01-02");
  await page.evaluate(() => {
    window.posthog.capture = () => {
      throw Error("blocked fixture");
    };
  });
  await link.click();
  await link.click({ button: "middle" });
  expect(
    await page.evaluate(() =>
      window.__linkChecks.slice(-2).every((e) => !e.prevented),
    ),
  ).toBe(true);
});
test("failed AI and invalid manual result never show discovery", async ({
  page,
}) => {
  await page.goto("/tools/json-to-csv/");
  await page.locator("#source-text").fill("{broken");
  await page.locator("#extra-run").click();
  await expect(page.locator("[data-result-discovery]")).toBeHidden();
  await page.goto("/tools/ask-a-webpage/");
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toContainText(
    "Unavailable fixture",
  );
  await expect(page.locator("[data-result-discovery]")).toBeHidden();
});

for (const status of ["answered", "partial", "not-answered"])
  test(`webpage ${status}: fixture result discovery respects answer presence`, async ({
    page,
  }) => {
    await page.route("**/api/utilities/interpret", (route) => {
      const text = route.request().postDataJSON().input.text;
      return route.fulfill({
        json: {
          source: "jev",
          model: "discovery-test-fixture",
          confidence: {},
          plan: {
            status,
            excerpts:
              status === "not-answered"
                ? []
                : [{ id: "p0", text, start: 0, end: text.length }],
          },
        },
      });
    });
    await page.goto("/tools/ask-a-webpage/");
    await page.getByRole("button", { name: /^Load example:/ }).click();
    await page.locator("#extra-ask").click();
    await expect(page.locator("#extra-results")).toBeVisible();
    if (status === "answered")
      await expect(page.locator("[data-result-discovery]")).toBeVisible();
    else await expect(page.locator("[data-result-discovery]")).toBeHidden();
    await page.locator("#instructions").fill("Changed question");
    await expect(page.locator("[data-result-discovery]")).toBeHidden();
  });

test("edited source cancels pending fixture result discovery", async ({
  page,
}) => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route("**/api/utilities/interpret", async (route) => {
    await gate;
    await route.fulfill({
      json: {
        source: "jev",
        model: "discovery-test-fixture",
        plan: { convention: "day-first" },
        confidence: {},
      },
    });
  });
  await page.goto("/tools/fix-excel-dates/");
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page
    .locator("details")
    .evaluateAll((es) => es.forEach((e) => (e.open = true)));
  const pending = page.waitForRequest("**/api/utilities/interpret");
  await page.locator("#ask-jev").click();
  await pending;
  await page.locator("#dates-input").fill("2026-02-03");
  release();
  await expect(page.locator("#ask-jev")).toBeEnabled();
  await expect(page.locator("[data-result-discovery]")).toBeHidden();
  await page.locator("#run").click();
  await expect(page.locator("[data-result-discovery]")).toBeVisible();
});

test("rejected graph preview is not promoted as a successful result", async ({
  page,
}) => {
  await page.goto("/tools/text-to-mermaid/");
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page
    .locator("details")
    .evaluateAll((es) => es.forEach((e) => (e.open = true)));
  const graph = JSON.parse(await page.locator("#review-plan").inputValue());
  const decision = graph.nodes.find((n) => n.type === "decision");
  expect(decision).toBeTruthy();
  decision.type = "terminal";
  await page.locator("#review-plan").fill(JSON.stringify(graph));
  await page.locator("#import-plan").click();
  await expect(page.locator("#extra-status")).toHaveClass(/error/);
  await expect(page.locator("[data-result-discovery]")).toBeHidden();
});

test("discovery screenshots on desktop and mobile", async ({ page }, info) => {
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tools/fix-excel-dates/");
    await page.getByRole("button", { name: /^Load example:/ }).click();
    await page.locator("#run").click();
    await expect(page.locator("[data-result-discovery]")).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`discovery-${width}.png`),
      fullPage: true,
    });
  }
});
