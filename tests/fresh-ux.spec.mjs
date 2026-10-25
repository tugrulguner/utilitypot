import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fulfillEntityDocumentFixture } from "./helpers/entity-document-fixture.mjs";

async function downloadText(page, button) {
  const pending = page.waitForEvent("download");
  await page.locator(button).click();
  const downloaded = await pending;
  const path = test.info().outputPath(downloaded.suggestedFilename());
  await downloaded.saveAs(path);
  return readFile(path, "utf8");
}

test("UX-06 homepage discovers the guarded public reader", async ({ page }) => {
  await page.goto("/");
  const card = page
    .locator("article")
    .filter({ has: page.locator('a[href="/tools/ask-a-webpage/"]') });
  await expect(card).toContainText("source-backed answers");
  await expect(card).not.toContainText("supported documentation site");
  const text = await (await page.request.get("/llms.txt")).text();
  expect(text).toContain("redirect");
  expect(text).not.toContain("approved-host allowlist");
});

const orders = {
  orders: [
    {
      id: "0008",
      buyer: { name: "Zoë Ramos", city: "Porto" },
      tags: ["priority", "gift"],
      paid: false,
      total: 0,
    },
    {
      id: "0009",
      buyer: { name: "Emre Kaya", city: "Ankara" },
      tags: [],
      paid: true,
      total: 12.5,
    },
  ],
};

test("UX-01 explicit array policy persists across local recomputation, source edits and uploads", async ({
  page,
}) => {
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/utilities/")) calls++;
  });
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      json: {
        source: "jev",
        model: "LOCAL FIXTURE — NOT LIVE QUALITY",
        plan: { path: "orders", arrays: "reject" },
        confidence: { arrays: 0.28 },
      },
    }),
  );
  await page.goto("/tools/json-to-csv/");
  await page.locator("#source-text").fill(JSON.stringify(orders));
  await expect(page.locator("#row-path")).toHaveValue("orders");
  await page.locator("#array-policy").selectOption("join");
  await page.locator("#extra-run").click();
  await expect(page.locator("#array-policy")).toHaveValue("join");
  await expect(page.locator("#extra-results")).toBeVisible();
  expect(await downloadText(page, "#extra-download")).toContain("priority");
  const replacement = { orders: [{ id: "0010", tags: ["replacement"] }] };
  await page.locator("#source-text").fill(JSON.stringify(replacement));
  await expect(page.locator("#array-policy")).toHaveValue("join");
  await page.locator("#extra-run").click();
  await expect(page.locator("#array-policy")).toHaveValue("join");
  await expect(page.locator("#extra-results")).toBeVisible();
  expect(await downloadText(page, "#extra-download")).toContain("replacement");
  await page.locator("#source-file").setInputFiles({
    name: "replacement.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(orders)),
  });
  await expect(page.locator("#source-text")).toHaveValue(
    JSON.stringify(orders),
  );
  await page.locator("#extra-run").click();
  await expect(page.locator("#array-policy")).toHaveValue("join");
  await expect(page.locator("#extra-results")).toBeVisible();
  await page.locator("#array-policy").selectOption("reject");
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-results")).toBeHidden();
  await expect(page.locator("#extra-status")).toContainText("explicit policy");
  expect(calls).toBe(0);
  await expect(page.locator("#extra-ask")).toHaveCount(0);
});

test("UX-02 mobile CSV cells keep complete atomic values and export parity", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/json-to-csv/");
  await page.locator("#source-text").fill(JSON.stringify(orders));
  await page.locator("#array-policy").selectOption("join");
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-results")).toBeVisible();
  for (const value of ["0008", "false", "12.5"]) {
    const cell = page
      .locator("#extra-visual td")
      .filter({ hasText: new RegExp(`^${value.replace(".", "\\.")}$`) });
    const lines = await cell.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getClientRects().length;
    });
    expect(lines, `${value} must occupy a single readable line`).toBe(1);
  }
  await expect(
    page.getByRole("columnheader", { name: "buyer.name", exact: true }),
  ).toBeVisible();
  const region = page.getByRole("region", {
    name: "CSV preview — scroll horizontally for all columns",
  });
  await expect(region).toBeVisible();
  expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  await region.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("mobile-left.png") });
  await region.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await page.screenshot({ path: testInfo.outputPath("mobile.png") });
  const csv = await downloadText(page, "#extra-download");
  expect(csv).toContain("0008");
  expect(csv).toContain("false,0");
  expect(csv).toContain("true,12.5");
  await page.evaluate(() => {
    window.copied = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copied = text;
        },
      },
    });
  });
  await page.locator("#extra-copy").click();
  expect(await page.evaluate(() => window.copied)).toBe(csv);
});

for (const mode of ["url", "paste"])
  test(`UX-03 ${mode} evidence downloads exact provenance and copy parity`, async ({
    page,
  }) => {
    const source = "Privacy matters.\n\nPeople control their information.";
    const question = "Who controls the information?";
    await page.route("**/api/utilities/read-page", (route) =>
      route.fulfill({
        json: {
          url: "https://www.mozilla.org/en-US/about/manifesto/",
          text: source,
          truncated: true,
          redirects: [
            {
              from: "https://mozilla.org/en-US/about/manifesto/",
              to: "https://www.mozilla.org/en-US/about/manifesto/",
            },
          ],
        },
      }),
    );
    await page.route("**/api/utilities/interpret", (route) =>
      fulfillEntityDocumentFixture(route, {
        json: {
          source: "jev",
          model: "LOCAL FIXTURE — NOT LIVE QUALITY",
          plan: {
            status: "answered",
            excerpts: [
              {
                id: "p1",
                text: source.slice(18),
                start: 18,
                end: source.length,
              },
            ],
            needsReview: true,
          },
          confidence: {},
        },
      }),
    );
    await page.goto("/tools/ask-a-webpage/");
    if (mode === "url") {
      await page.locator('[data-source-mode="url"]').click();
      await page
        .locator("#page-url")
        .fill("https://mozilla.org/en-US/about/manifesto/");
    } else await page.locator("#source-text").fill(source);
    await page.locator("#instructions").fill(question);
    await page.locator("#extra-ask").click();
    await expect(page.locator("#extra-results")).toBeVisible();
    const raw = await downloadText(page, "#extra-download");
    expect(raw).toContain(source.slice(18));
    await page.locator(".answer-processing > summary").click();
    const jsonDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download source data (JSON)", exact: true })
      .click();
    const jsonFile = await jsonDownload;
    const result = JSON.parse(await readFile(await jsonFile.path(), "utf8"));
    expect(result.question).toBe(question);
    expect(result.source.kind).toBe(
      mode === "url" ? "fetched-url" : "pasted-text",
    );
    expect(result.source.text).toBe(source);
    expect(result.source.coverage).toEqual({
      characters: source.length,
      paragraphs: 2,
      truncated: mode === "url",
    });
    if (mode === "url") {
      expect(result.source.url).toBe(
        "https://www.mozilla.org/en-US/about/manifesto/",
      );
      expect(result.source.retrieval).toEqual({
        redirects: [
          {
            from: "https://mozilla.org/en-US/about/manifesto/",
            to: "https://www.mozilla.org/en-US/about/manifesto/",
          },
        ],
      });
    } else {
      expect(result.source.url).toBeUndefined();
      expect(result.source.retrieval).toBeUndefined();
    }
    expect(JSON.stringify(result)).not.toMatch(/retrievedAt|timestamp/);
    for (const e of result.plan.excerpts)
      expect(result.source.text.slice(e.start, e.end)).toBe(e.text);
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.copied = text;
          },
        },
      }),
    );
    await page.locator("#extra-copy").click();
    expect(await page.evaluate(() => window.copied)).toBe(raw);
    await expect(page.locator(".answer-lead .answer-text")).toHaveText(
      source.slice(18),
    );
    await page.locator("#instructions").fill("A changed question");
    await expect(page.locator("#extra-results")).toBeHidden();
    if (mode === "url") {
      await page.route("**/api/utilities/read-page", (route) =>
        route.fulfill({ status: 400, json: { error: "Unsafe URL" } }),
      );
      await page.locator("#page-url").fill("http://127.0.0.1/");
      await page.locator("#extra-ask").click();
      await expect(page.locator("#extra-status")).toContainText("Unsafe URL");
      await expect(page.locator("#extra-results")).toBeHidden();
    }
  });

test("UX-04 captured contradictory diagram opens actionable type review", async ({
  page,
}) => {
  const capture = JSON.parse(
    await readFile(
      new URL(
        "../src/lib/utilities/fixtures/diagram-returns-fresh-audit.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({ json: capture.response }),
  );
  await page.goto("/tools/text-to-mermaid/");
  await page.locator("#source-text").fill(capture.input.text);
  await page.locator("#instructions").fill(capture.input.instructions);
  await page.locator("#create-diagram").click();
  await expect(page.locator("#extra-status")).toContainText(
    "incoming and outgoing",
    { timeout: 15000 },
  );
  await expect(page.locator("#graph-panel")).toHaveAttribute("open", "");
  await expect(page.locator("#extra-status")).not.toContainText(
    "proposal ready",
  );
});

test("UX-04 two-stage diagram fixture fits the bounded client deadline", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.route("**/api/utilities/interpret", async (route) => {
    await new Promise((r) => setTimeout(r, 21000));
    await route.fulfill({
      json: {
        source: "jev",
        model: "LOCAL LATENCY FIXTURE",
        confidence: {},
        plan: {
          graph: {
            nodes: [
              { id: "n0", label: "Start", type: "terminal" },
              { id: "n1", label: "End", type: "terminal" },
            ],
            edges: [{ from: "n0", to: "n1", label: "" }],
          },
        },
      },
    });
  });
  await page.goto("/tools/text-to-mermaid/");
  await page.locator("#source-text").fill("Start\nEnd");
  await page.locator("#instructions").fill("Start then end.");
  await page.locator("#create-diagram").click();
  await expect(page.locator("#extra-results")).toBeVisible({ timeout: 27000 });
});

test("UX-08 missing fields focus the visible repair without network or lost input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let requests = 0;
  await page.route("**/api/utilities/**", (route) => {
    requests++;
    return route.fulfill({
      status: 400,
      json: { error: "Invalid input. Use a supported, small sample." },
    });
  });
  await page.goto("/tools/entity-extractor/");
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toContainText(
    "Paste text to extract from",
  );
  await expect(page.locator("#source-text")).toBeFocused();
  await page.locator("#source-text").fill("Keep this original text.");
  await page.locator("#people-category").uncheck();
  await page.locator("#companies-category").uncheck();
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toContainText(
    "Choose at least one entity type",
  );
  await expect(page.locator("#people-category")).toBeFocused();
  await expect(page.locator("#source-text")).toHaveValue(
    "Keep this original text.",
  );
  await page.goto("/tools/ask-a-webpage/");
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toContainText(
    "Paste webpage text",
  );
  await expect(page.locator("#source-text")).toBeFocused();
  await page
    .locator("#source-text")
    .fill("Actual multiline source.\n\nSecond paragraph.");
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toContainText("Enter a question");
  await expect(page.locator("#instructions")).toBeFocused();
  await expect(page.locator("#source-text")).toHaveValue(
    "Actual multiline source.\n\nSecond paragraph.",
  );
  await page.locator('[data-source-mode="url"]').click();
  await page.locator("#extra-ask").click();
  await expect(page.locator("#extra-status")).toContainText(
    "Enter a public webpage URL",
  );
  await expect(page.locator("#page-url")).toBeFocused();
  expect(requests).toBe(0);
  await page.goto("/tools/csv-to-nested-json/");
  await page.locator("#run").click();
  await expect(page.locator("#utility-status")).toContainText("Paste CSV data");
  await expect(page.locator("#csv-input")).toBeFocused();
  await page.goto("/tools/meeting-time-finder/");
  await page.locator("#run").click();
  await expect(page.locator("#utility-status")).toContainText(
    "Choose a meeting date",
  );
  await expect(page.locator("#meeting-date")).toBeFocused();
  await page.locator("#meeting-date").fill("2027-02-11");
  await page.locator("#run").click();
  await expect(page.locator("#utility-status")).toContainText(
    "Enter a city or timezone for participant 1",
  );
  await expect(page.locator("#p0-zone")).toBeFocused();
  expect(requests).toBe(0);
});

test("UX-05 Boston is discoverable on mobile and keeps its city label when explicit windows change, with calendar parity", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/meeting-time-finder/");
  await page
    .getByText("Supported cities and timezones", { exact: true })
    .click();
  await page.getByLabel("Search supported cities or aliases").fill("Boston");
  await expect(page.locator("#city-matches li:visible")).toHaveText([
    "Boston · America/New_York",
  ]);
  await page
    .getByText("Supported cities and timezones", { exact: true })
    .click();
  await page.locator("#meeting-date").fill("2027-02-11");
  await page.locator("#duration").fill("45");
  for (const [i, city, start, end] of [
    [0, "Berlin", "14:00", "18:00"],
    [1, "Boston", "08:00", "12:00"],
  ]) {
    await page.locator(`#p${i}-zone`).fill(city);
    if (
      !(await page
        .locator(".participant-hours")
        .nth(i)
        .evaluate((el) => el.open))
    )
      await page.locator(".participant-hours > summary").nth(i).click();
    await page.locator(`#p${i}-start`).fill(start);
    await page.locator(`#p${i}-end`).fill(end);
  }
  await page.locator("#run").click();
  await expect(page.locator("#result-view")).toContainText("Boston");
  const calendar = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download calendar (.ics)", exact: true })
    .click();
  const calendarFile = await calendar;
  const calendarPath = testInfo.outputPath(calendarFile.suggestedFilename());
  await calendarFile.saveAs(calendarPath);
  expect(await readFile(calendarPath, "utf8")).toContain(
    "DTSTART:20270211T130000Z",
  );
  await page.screenshot({ path: testInfo.outputPath("mobile.png") });
  let calls = 0;
  await page.route("**/api/utilities/**", (route) => {
    calls++;
    return route.abort();
  });
  await page.locator("#p1-start").fill("09:00");
  await page.locator("#p1-end").fill("11:00");
  await page.locator("#run").click();
  await expect(page.locator("#utility-status")).toContainText("feasible slots");
  await expect(page.locator("#p1-zone")).toHaveValue("Boston");
  await expect(page.locator("#result-view")).toContainText("Boston");
  const updated = await downloadText(
    page,
    'button:has-text("Download calendar (.ics)")',
  );
  expect(updated).toContain("DTSTART:20270211T140000Z");
  expect(calls).toBe(0);
});

test("UX-07 partial dates remain readable on mobile and exact in downloaded CSV", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/fix-excel-dates/");
  await expect(page.locator("main")).toContainText("MM/YYYY");
  await page
    .locator("#dates-input")
    .fill("January 2027\n01/2027\n13/2027\n\n9 January 2027");
  await page.locator("#run").click();
  await expect(page.locator(".date-records")).toContainText("2027-01");
  const csv = await downloadText(page, "#download");
  expect(csv).toContain("January 2027,2027-01,partial");
  expect(csv).toContain("01/2027,2027-01,partial");
  expect(csv).toContain("13/2027,,invalid");
  expect(csv).toContain("9 January 2027,2027-01-09,converted");
  await page.locator(".date-record").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("mobile.png") });
});
