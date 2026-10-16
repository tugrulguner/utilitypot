// Hosted acceptance for fixed local4/AI3 workflows. Never mocks requests or retries inference.
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import Papa from "papaparse";
const origin = process.env.UX_ORIGIN;
assert.match(
  origin || "",
  /^https:\/\/(?:[a-f0-9]{8}-utilitypot-site\.tugrul-gunr\.workers\.dev|utilitypot\.modepot\.io)$/,
);
assert.ok(
  process.env.UX_RESULTS_DIR,
  "Set a dedicated UX_RESULTS_DIR; failed attempts must remain separate.",
);
const dir = resolve(process.env.UX_RESULTS_DIR),
  root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(dir, { recursive: true });
const browser = await chromium.launch(),
  page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
page.setDefaultTimeout(15000);
const records = [],
  responses = [],
  requests = [],
  consoleErrors = [],
  downloads = [],
  pending = new Set();
let lastPaid = 0;
page.on("request", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/utilities/")) {
    requests.push({
      path: new URL(r.url()).pathname,
      method: r.method(),
      at: new Date().toISOString(),
    });
    if (r.method() === "POST" && r.url().endsWith("/interpret"))
      lastPaid = Date.now();
  }
});
page.on("pageerror", (e) =>
  consoleErrors.push({ kind: "pageerror", message: e.message }),
);
page.on("console", (e) => {
  if (e.type() === "error")
    consoleErrors.push({ kind: "console", message: e.text() });
});
page.on("response", (r) => {
  if (!new URL(r.url()).pathname.startsWith("/api/utilities/")) return;
  const job = (async () => {
    let body;
    try {
      body = await r.json();
    } catch {
      body = (await r.text()).slice(0, 1000);
    }
    responses.push({
      path: new URL(r.url()).pathname,
      status: r.status(),
      body,
      at: new Date().toISOString(),
    });
  })();
  pending.add(job);
  job.finally(() => pending.delete(job));
});
const source = {
  head: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  dirty: !!execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
};
async function persist() {
  await Promise.allSettled([...pending]);
  await writeFile(
    join(dir, "results.json"),
    JSON.stringify(
      {
        origin,
        method:
          "Real hosted UI and Worker/Jev; no request mocks, inference retries or local AI fallback",
        source,
        records,
        requests,
        responses,
        consoleErrors,
        downloads,
      },
      null,
      2,
    ),
  );
}
async function go(slug) {
  const r = await page.goto(origin + "/tools/" + slug + "/", {
    waitUntil: "domcontentloaded",
  });
  assert.equal(r.status(), 200);
  await expect(page.locator(".primary").first()).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}
async function saveDownload(selector, name) {
  const event = page.waitForEvent("download");
  await page.locator(selector).click();
  const d = await event;
  const path = join(dir, name + "-" + d.suggestedFilename());
  await d.saveAs(path);
  const text = await readFile(path, "utf8");
  downloads.push({
    path,
    sha256: createHash("sha256").update(text).digest("hex"),
  });
  return text;
}
async function screenshot(name) {
  const path = join(dir, name + ".png");
  await page.screenshot({ path, fullPage: false });
  return path;
}
async function views(name, selector) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  const desktop = await screenshot(name + "-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(selector).scrollIntoViewIfNeeded();
  const mobile = await screenshot(name + "-mobile");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "No document-wide overflow",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  return { desktop, mobile };
}
async function paid(selector) {
  await page.waitForTimeout(Math.max(0, 13500 - (Date.now() - lastPaid)));
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/utilities/interpret",
    { timeout: 55000 },
  );
  await page.locator(selector).click();
  const r = await response,
    body = await r.json();
  assert.equal(r.status(), 200, JSON.stringify(body));
  assert.equal(body.source, "jev");
  assert.ok(body.model);
  await expect(page.locator(selector)).toBeEnabled({ timeout: 55000 });
  await expect(
    page.locator("[data-interpretation-details]"),
  ).not.toHaveAttribute("open", "");
  return body;
}
async function scenario(name, run) {
  const started = new Date().toISOString(),
    before = requests.length;
  try {
    const details = await run();
    records.push({
      name,
      passed: true,
      started,
      apiRequests: requests.length - before,
      ...details,
    });
    console.log("PASS", name);
  } catch (error) {
    let screenshotPath;
    try {
      screenshotPath = await screenshot(name + "-FAILED");
    } catch {}
    records.push({
      name,
      passed: false,
      started,
      apiRequests: requests.length - before,
      error: error.stack,
      screenshotPath,
    });
    console.error("FAIL", name, error.message);
  } finally {
    await persist();
  }
}
async function outputLocal(slug, button, result, download, name) {
  const before = requests.length;
  await go(slug);
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page.locator(button).click();
  await expect(page.locator(result)).toBeVisible();
  const text = await saveDownload(download, name);
  assert.ok(text.length);
  assert.equal(
    requests.length,
    before,
    "Deterministic utility must not call any API",
  );
  const screenshots = await views(name, result);
  return { text, screenshots };
}
async function noJargon(id) {
  await expect(page.locator(id)).not.toHaveClass(/error/);
  await expect(page.locator(id)).not.toContainText(
    /Jev|proposal ready|model:/i,
  );
}
async function exactEntities(text) {
  const raw = JSON.parse(
    await saveDownload("#extra-download", "entities-" + records.length),
  );
  assert.ok(
    Array.isArray(raw) && raw.length,
    "Expected useful extracted matches",
  );
  for (const e of raw) assert.equal(text.slice(e.start, e.end), e.text);
  await expect(page.locator(".entity-document")).toHaveText(text);
  await noJargon("#extra-status");
  return raw;
}
try {
  for (const [slug, button, result, download] of [
    ["csv-to-nested-json", "#run", "#results", "#download"],
    ["fix-excel-dates", "#run", "#results", "#download"],
    ["meeting-time-finder", "#run", "#results", "#download"],
    ["json-to-csv", "#extra-run", "#extra-results", "#extra-download"],
  ])
    await scenario("default-" + slug, async () => {
      const { text, screenshots } = await outputLocal(
        slug,
        button,
        result,
        download,
        "default-" + slug,
      );
      if (slug === "meeting-time-finder")
        assert.match(
          await saveDownload(
            'button:has-text("Add to calendar")',
            "default-calendar",
          ),
          /BEGIN:VCALENDAR/,
        );
      await noJargon(
        slug === "json-to-csv" ? "#extra-status" : "#utility-status",
      );
      return { bytes: Buffer.byteLength(text), screenshots };
    });
  await scenario("csv-custom-mapping-exact-values", async () => {
    const before = requests.length;
    await go("csv-to-nested-json");
    await page
      .locator("#csv-input")
      .fill("Customer,SKU,Qty\n001,A01,0\n001,A02,3");
    await page.locator("#group-by").selectOption("Customer");
    await page
      .getByText("Output structure and custom field mapping", { exact: true })
      .click();
    await page.locator("#custom-schema").check();
    await page
      .locator("#json-example")
      .fill('{"customer":"001","items":[{"sku":"A01","quantity":"0"}]}');
    await page.locator("#prepare").click();
    for (const [i, column] of ["Customer", "SKU", "Qty"].entries())
      await page.locator("#map-" + i).selectOption(column);
    await page.locator("#run").click();
    assert.deepEqual(
      JSON.parse(await saveDownload("#download", "csv-custom")),
      [
        {
          customer: "001",
          items: [
            { sku: "A01", quantity: "0" },
            { sku: "A02", quantity: "3" },
          ],
        },
      ],
    );
    assert.equal(requests.length, before);
    return { screenshots: await views("csv-custom", "#results") };
  });
  await scenario("dates-filter-preserves-full-report", async () => {
    const before = requests.length;
    await go("fix-excel-dates");
    await page
      .locator("#dates-input")
      .fill("25/03/2026\n03/04/2026\nJanuary 2027\nnot-a-date");
    await page.locator("#run").click();
    await page.locator("#date-filter").selectOption("attention");
    await expect(
      page.locator("#result-view tbody tr").filter({ hasText: "25/03/2026" }),
    ).toBeHidden();
    await expect(
      page.locator("#result-view tbody tr").filter({ hasText: "not-a-date" }),
    ).toBeVisible();
    const csv = await saveDownload("#download", "dates-full");
    assert.match(csv, /25\/03\/2026,2026-03-25/);
    assert.match(csv, /03\/04\/2026,,review/);
    assert.match(csv, /January 2027,2027-01,partial/);
    assert.match(csv, /not-a-date,,invalid/);
    assert.equal(requests.length, before);
    return { screenshots: await views("dates-filter", "#results") };
  });
  await scenario("meeting-boston-calendar-parity", async () => {
    const before = requests.length;
    await go("meeting-time-finder");
    await page.locator("#meeting-date").fill("2027-02-11");
    await page.locator("#duration").fill("45");
    for (const [i, zone, start, end] of [
      [0, "Berlin", "14:00", "18:00"],
      [1, "Boston", "09:00", "12:00"],
    ]) {
      await page.locator("#p" + i + "-zone").fill(zone);
      await page.locator("#p" + i + "-start").fill(start);
      await page.locator("#p" + i + "-end").fill(end);
    }
    await page.locator("#run").click();
    await expect(page.locator("#result-view")).toContainText("Boston");
    assert.match(
      await saveDownload(
        'button:has-text("Add to calendar")',
        "boston-calendar",
      ),
      /DTSTART:20270211T140000Z/,
    );
    assert.match(await saveDownload("#download", "boston-result"), /Boston/);
    assert.equal(requests.length, before);
    return { screenshots: await views("boston", "#results") };
  });
  await scenario(
    "json-explicit-records-policy-precision-formula-safety",
    async () => {
      const before = requests.length;
      await go("json-to-csv");
      await page
        .locator("#source-text")
        .fill(
          JSON.stringify({
            orders: [
              {
                id: "9007199254740993",
                note: "=SUM(1,2)",
                paid: false,
                tags: ["a", "b"],
              },
            ],
            other: [{ id: "ignore" }],
          }),
        );
      await expect(page.locator("#row-path")).toHaveValue("");
      await page.locator("#row-path").selectOption("orders");
      await page.locator("#extra-run").click();
      await expect(page.locator("#extra-results")).toBeHidden();
      await page.locator("#array-policy").selectOption("join");
      await page.locator("#extra-run").click();
      const row = Papa.parse(
        await saveDownload("#extra-download", "json-precise"),
        { header: true },
      ).data[0];
      assert.equal(row.id, "9007199254740993");
      assert.equal(row.paid, "false");
      assert.ok(row.note.startsWith("'="));
      assert.match(row.tags, /a/);
      assert.equal(requests.length, before);
      return { screenshots: await views("json-policy", "#extra-results") };
    },
  );
  await scenario("entities-default-real-interpretation", async () => {
    await go("entity-extractor");
    await page.locator("#extra-example").click();
    const text = await page.locator("#source-text").inputValue();
    await paid("#extra-ask");
    const entities = await exactEntities(text);
    assert.ok(entities.some((e) => e.text === "Ada"));
    assert.ok(entities.some((e) => e.text === "Acme Labs"));
    return {
      entities,
      screenshots: await views("entities-default", "#extra-results"),
    };
  });
  await scenario(
    "entities-long-source-navigation-custom-category",
    async () => {
      await go("entity-extractor");
      const text =
        "Mina Rao and Noah Kim joined Atlas Labs in Paris.\nThe team discussed clear timelines and reviewed the records carefully.\n" +
        "\n".repeat(18) +
        "Mina Rao returned to Paris.";
      await page.locator("#source-text").fill(text);
      await page.locator("#custom-category").check();
      await page.locator("#instructions").fill("City: a named city");
      await paid("#extra-ask");
      const entities = await exactEntities(text);
      assert.ok(entities.some((e) => e.type === "City" && e.text === "Paris"));
      const last = page.locator(".entity-index button").last();
      await last.click();
      assert.ok(
        (await page.locator("mark.is-current").allTextContents()).join(""),
      );
      await page
        .getByRole("button", { name: "Back to matches", exact: true })
        .click();
      await expect(last).toBeFocused();
      assert.ok(
        await page
          .locator(".entity-document")
          .evaluate((e) => e.getBoundingClientRect().height > 500),
      );
      return {
        entities,
        screenshots: await views("entities-long", "#extra-results"),
      };
    },
  );
  for (const custom of [false, true])
    await scenario(
      custom
        ? "diagram-custom-decision-branches"
        : "diagram-default-real-interpretation",
      async () => {
        await go("text-to-mermaid");
        if (custom) {
          await page
            .locator("#source-text")
            .fill(
              "Receive application\nCheck eligibility?\nSend invite\nSend rejection",
            );
          await page
            .locator("#instructions")
            .fill(
              "At Check eligibility: if yes send invite; if no send rejection.",
            );
        } else await page.locator("#extra-example").click();
        await paid("#create-diagram");
        await expect(
          page.frameLocator("#extra-visual iframe").locator("svg"),
        ).toBeVisible();
        const code = await saveDownload(
          "#extra-download",
          custom ? "graph-custom" : "graph-default",
        );
        assert.match(code, /\{[^}]+\}/);
        assert.match(code, /\|(yes|true)\|/i);
        assert.match(code, /\|(no|false)\|/i);
        assert.match(
          await saveDownload(
            "#extra-svg",
            custom ? "graph-custom-svg" : "graph-default-svg",
          ),
          /<svg/,
        );
        await noJargon("#extra-status");
        const count = requests.length;
        await page
          .getByRole("button", { name: "Actual size", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Actual size", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await page
          .getByRole("button", { name: "Fit width", exact: true })
          .click();
        assert.equal(requests.length, count, "View controls must not call AI");
        return {
          code,
          screenshots: await views(
            custom ? "diagram-custom" : "diagram-default",
            "#extra-results",
          ),
        };
      },
    );
  await scenario("reader-pasted-exact-source-quote", async () => {
    await go("ask-a-webpage");
    const text =
      "Harbor Library opens at 09:00 on weekdays. It closes at 17:30. Sunday visits require a reservation.";
    await page.locator("#source-text").fill(text);
    await page
      .locator("#instructions")
      .fill("What time does Harbor Library close?");
    const { plan } = await paid("#extra-ask");
    assert.equal(plan.status, "answered");
    for (const e of plan.excerpts)
      assert.equal(text.slice(e.start, e.end), e.text);
    await expect(page.locator("#extra-output")).toContainText("17:30");
    await saveDownload("#extra-download", "reader-paste");
    await noJargon("#extra-status");
    return { screenshots: await views("reader-paste", "#extra-results") };
  });
  await scenario("reader-live-public-url-overview", async () => {
    await go("ask-a-webpage");
    await page.getByRole("tab", { name: "Public URL", exact: true }).click();
    await page.locator("#page-url").fill("https://modepot.io/");
    await page.locator("#instructions").fill("What is this webpage about?");
    const { plan } = await paid("#extra-ask");
    assert.equal(plan.status, "answered");
    await expect(page.locator("#extra-results")).toBeVisible();
    await expect(page.locator("#extra-status")).toContainText(
      "Answer found in the source.",
    );
    await expect(page.locator("#extra-status")).not.toHaveClass(/error/);
    const source = await page.locator("#source-text").inputValue();
    for (const e of plan.excerpts)
      assert.equal(source.slice(e.start, e.end), e.text);
    await saveDownload("#extra-download", "reader-url");
    return {
      sourceCharacters: source.length,
      screenshots: await views("reader-url", "#extra-results"),
    };
  });
  await scenario("reader-absent-answer-abstains", async () => {
    await go("ask-a-webpage");
    await page
      .locator("#source-text")
      .fill("Harbor Library opens at 09:00 and closes at 17:30.");
    await page
      .locator("#instructions")
      .fill("What is the annual membership price?");
    const { plan } = await paid("#extra-ask");
    assert.equal(plan.status, "not-answered");
    assert.deepEqual(plan.excerpts, []);
    await expect(page.locator("#extra-status")).toContainText(
      "No supporting passage found",
    );
    await expect(page.locator("#extra-status")).not.toHaveClass(/error/);
    return { screenshots: await views("reader-abstention", "#extra-results") };
  });
} finally {
  await persist();
  await browser.close();
}
const successfulInterpretations = responses.filter(
  (r) =>
    r.path === "/api/utilities/interpret" &&
    r.status === 200 &&
    r.body?.source === "jev",
).length;
const summary = {
  total: records.length,
  passed: records.filter((r) => r.passed).length,
  failed: records.filter((r) => !r.passed).length,
  successfulInterpretations,
  downloads: downloads.length,
  consoleErrors: consoleErrors.length,
  dir,
};
await writeFile(join(dir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.failed || summary.consoleErrors) process.exitCode = 1;
