import { liveTarget } from "./live-target.mjs";
const target = liveTarget(process.env.BASE_URL);
import { chromium, expect } from "@playwright/test";
import Papa from "papaparse";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const root =
  "test-results-live/" + new Date().toISOString().replace(/[:.]/g, "-");
await mkdir(root, { recursive: true });
console.log("Evidence directory:", root);
console.log("Target:", target.origin, "—", target.mode);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: "block",
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const results = [];
let lastCall = 0;
let current;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function pace() {
  const delay = 13000 - (Date.now() - lastCall);
  if (delay > 0) await wait(delay);
  lastCall = Date.now();
}
page.on("response", async (r) => {
  if (r.url().includes("/api/utilities/")) {
    try {
      const target = current;
      const body = await r.json();
      target?.network.push({
        url: r.url(),
        status: r.status(),
        fromServiceWorker: r.fromServiceWorker(),
        body,
      });
    } catch {}
  }
});
async function ask(extra = false) {
  await pace();
  const button = page.locator(
    extra
      ? (await page.locator("#create-diagram").count())
        ? "#create-diagram"
        : "#extra-ask"
      : (await page.locator("#availability-mode").count())
        ? "#run"
        : "#ask-jev",
  );

  const responsePromise = page.waitForResponse(
    (r) =>
      r.url() === target.origin + "/api/utilities/interpret" &&
      r.request().method() === "POST",
    { timeout: 45000 },
  );
  await button.click();
  const response = await responsePromise;
  const body = await response.json();
  current.interpretation = { http: response.status(), ...body };
  if (target.mode.startsWith("local")) {
    const headers = response.headers();
    assert.equal(
      headers["x-qa-real-upstream"],
      "https://utilitypot.modepot.io",
      "Local UI must use the real production API bridge",
    );
    current.realBackend = {
      origin: headers["x-qa-real-upstream"],
      cfRay: headers["x-qa-upstream-cf-ray"],
    };
  }
  assert.equal(response.status(), 200, JSON.stringify(body));
  assert.equal(body.source, "jev");
  assert.match(body.model, /^jev-/);
  assert.equal(response.fromServiceWorker(), false);
  await expect(button).toBeEnabled({ timeout: 25000 });
  // An unresolved mapping may correctly show a local validation error here.
  // The response is verified above; corrections are recorded by each case.
  return body.plan;
}
async function download(selector, name) {
  const [file] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator(selector).click(),
  ]);
  const path = root + "/" + current.id + "-" + name;
  await file.saveAs(path);
  const body = await readFile(path, "utf8");
  current.downloads.push({
    path,
    suggestedFilename: file.suggestedFilename(),
    bytes: Buffer.byteLength(body),
  });
  return body;
}
async function goto(slug) {
  await page.goto(target.origin + "/tools/" + slug + "/");
  const advanced = {
    "csv-to-nested-json": "Advanced structure and custom mapping",
    "fix-excel-dates": "Interpret source context with Jev",
    "json-to-csv": "Choose records with Jev",
  }[slug];
  if (advanced)
    await page.locator("summary").filter({ hasText: advanced }).click();
  if (slug === "text-to-mermaid")
    await page.locator("#diagram-mode").selectOption("jev");
  if (slug === "meeting-time-finder")
    await page.locator("#availability-mode").selectOption("jev");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
const cases = [
  [
    "csv-to-nested-json",
    async () => {
      await goto("csv-to-nested-json");
      await page
        .locator("#csv-input")
        .fill(
          "ClientID,CustomerName,ProductCode,Units\n001,Maya,A01,2\n001,Maya,A02,3\n002,Omar,B01,1",
        );
      await page.locator("#json-example").fill(
        JSON.stringify({
          id: "001",
          name: "Maya",
          items: [{ sku: "A01", quantity: "2" }],
        }),
      );
      await page
        .locator("#csv-intent")
        .fill(
          "One parent per ClientID. CustomerName is the parent name. Collect each source row as an item: ProductCode maps to sku and Units maps to quantity. Preserve identifiers and quantities as strings.",
        );
      const plan = await ask();
      assert.equal(plan.groupBy, "ClientID");
      await expect(page.locator("#group-by")).toHaveValue("ClientID");
      const missing = plan.fields.filter((f) => !f.column);
      if (missing.length) {
        assert.deepEqual(
          missing.map((f) => f.path),
          ["name"],
        );
        await page
          .getByLabel("Source column for name", { exact: true })
          .selectOption("CustomerName");
        current.manualCorrections = [
          {
            path: "name",
            from: "",
            to: "CustomerName",
            reason: "Real user review of an unresolved Jev mapping",
          },
        ];
      }
      if (missing.length) await page.locator("#run").click();
      const value = JSON.parse(await download("#download", "result.json"));
      assert.deepEqual(value, [
        {
          id: "001",
          name: "Maya",
          items: [
            { sku: "A01", quantity: "2" },
            { sku: "A02", quantity: "3" },
          ],
        },
        { id: "002", name: "Omar", items: [{ sku: "B01", quantity: "1" }] },
      ]);
      current.checks = [
        "Jev returned fresh mapping proposals; any review correction is recorded",
        "grouped 3 rows into 2 records",
        "identifiers retained leading zeros",
        "downloaded JSON exactly matches expected records",
      ];
    },
  ],
  [
    "fix-excel-dates",
    async () => {
      await goto("fix-excel-dates");
      await page
        .locator("#dates-input")
        .fill("25/03/2026\n03/04/2026\n2026-02\n2025-02-29");
      await page
        .locator("#date-context")
        .fill(
          "UK office export. Numeric dates are DD/MM/YYYY. Preserve partial dates and flag invalid dates.",
        );

      const plan = await ask();
      assert.equal(plan.convention, "day-first");
      await expect(page.locator("#date-convention")).toHaveValue("day-first");
      const csv = await download("#download", "dates.csv");
      assert.ok(
        csv.includes("2026-04-03") &&
          csv.includes("2026-03-25") &&
          csv.includes("2026-02"),
      );
      const parsed = Papa.parse(csv, {
        header: true,
        skipEmptyLines: true,
      }).data;
      assert.ok(
        parsed.some(
          (r) => r.original === "2025-02-29" && r.status === "invalid",
        ),
      );
      current.checks = [
        "Jev chose day-first",
        "ambiguous numeric date normalized using reviewed convention",
        "partial date retained",
        "invalid leap-day flagged in downloaded report",
      ];
    },
  ],
  [
    "meeting-time-finder",
    async () => {
      await goto("meeting-time-finder");
      await page.locator("#meeting-date").fill("2026-06-15");
      await page.locator("#duration").fill("30");
      for (const [i, name, zone, text] of [
        [0, "London", "Europe/London", "Available from 9am until noon."],
        [1, "India", "Asia/Kolkata", "Available from 2pm until 4pm."],
      ]) {
        const p = page.locator(".participant").nth(i);
        await p.locator("[data-field=name]").fill(name);
        await p.locator("[data-field=zone]").fill(zone);
        await p.locator("[data-field=text]").fill(text);
      }
      const plan = await ask();
      assert.ok(plan.participants.every((p) => p.scope === "supported"));
      assert.deepEqual(
        plan.participants.map((p) => [p.start, p.end]),
        [
          ["09:00", "12:00"],
          ["14:00", "16:00"],
        ],
      );
      await expect(page.locator("#result-view")).toContainText(
        "2026-06-15T08:30:00Z",
      );
      const promise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download calendar event", exact: true })
        .click();
      const d = await promise;
      await d.saveAs(root + "/" + current.id + ".ics");
      const ics = await readFile(await d.path(), "utf8");
      assert.ok(ics.includes("DTSTART:20260615T083000Z"));
      current.downloads.push({
        path: root + "/" + current.id + ".ics",
        suggestedFilename: d.suggestedFilename(),
      });
      current.checks = [
        "Jev populated previously empty windows from natural language",
        "London/India half-hour offset calculated correctly",
        "calendar download matches selected UTC instant",
      ];
    },
  ],
  [
    "json-to-csv",
    async () => {
      await goto("json-to-csv");
      await page.locator("#source-text").fill(
        JSON.stringify({
          metadata: { tenant: "qa" },
          invoices: [
            { invoiceId: "001", client: { name: "Maya" }, total: 12 },
            { invoiceId: "002", client: { name: "Omar" }, total: 25 },
          ],
        }),
      );
      await page
        .locator("#instructions")
        .fill(
          "One CSV row per invoice in invoices. Flatten client.name. Keep invoiceId as text. Reject unresolved nested arrays. Do not export metadata.",
        );
      const plan = await ask(true);
      assert.equal(plan.path, "invoices");
      await expect(page.locator("#row-path")).toHaveValue("invoices");
      const csv = await download("#extra-download", "invoices.csv");
      const rows = Papa.parse(csv, { header: true, skipEmptyLines: true }).data;
      assert.deepEqual(rows, [
        { invoiceId: "001", "client.name": "Maya", total: "12" },
        { invoiceId: "002", "client.name": "Omar", total: "25" },
      ]);
      current.checks = [
        "Jev selected actual invoice array",
        "nested object flattened",
        "metadata omitted",
        "downloaded CSV values and leading zeros verified",
      ];
    },
  ],
  [
    "entity-extractor",
    async () => {
      await goto("entity-extractor");
      const source = "Maya joined Cedar Labs. Omar works at Cedar Labs.";
      await page.locator("#source-text").fill(source);

      const plan = await ask(true);
      const entities = plan.entities;
      assert.equal(entities.length, 4);
      for (const e of entities)
        assert.equal(source.slice(e.start, e.end), e.text);
      assert.deepEqual(
        entities.filter((e) => e.type === "Person").map((e) => e.text),
        ["Maya", "Omar"],
      );
      assert.deepEqual(
        entities.filter((e) => e.type === "Organization").map((e) => e.text),
        ["Cedar Labs", "Cedar Labs"],
      );
      await expect(page.locator("#review-plan")).not.toHaveValue("");
      const exported = JSON.parse(
        await download("#extra-download", "entities.json"),
      );
      assert.deepEqual(exported, entities);
      assert.equal(await page.locator("#extra-visual mark").count(), 4);
      current.checks = [
        "real Jev found both people and both organization mentions",
        "every span matches exact source offsets",
        "reviewed export matches proposal",
        "all four mentions highlighted",
      ];
    },
  ],
  [
    "text-to-mermaid-linear",
    async () => {
      await goto("text-to-mermaid");
      await page
        .locator("#source-text")
        .fill("Receive request\nStore request\nSend receipt");
      await page
        .locator("#instructions")
        .fill(
          "A strictly sequential workflow: receive the request, then store it, then send the receipt. There are no decisions, alternative paths or loops.",
        );
      const plan = await ask(true);
      assert.deepEqual(
        plan.graph.edges.map((e) => [e.from, e.to]),
        [
          ["n0", "n1"],
          ["n1", "n2"],
        ],
      );
      await expect(
        page
          .frameLocator('iframe[title="Rendered Mermaid flowchart"]')
          .locator("svg"),
      ).toBeVisible({ timeout: 20000 });
      const code = await download("#extra-download", "sequential.mmd");
      assert.ok(code.includes("n0 --> n1") && code.includes("n1 --> n2"));
      const [file] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download SVG", exact: true }).click(),
      ]);
      const path = root + "/" + current.id + ".svg";
      await file.saveAs(path);
      assert.ok((await readFile(path, "utf8")).includes("<svg"));
      current.downloads.push({
        path,
        suggestedFilename: file.suggestedFilename(),
      });
      current.checks = [
        "real Jev sequential graph verified",
        "actual webpage SVG rendered",
        "downloaded Mermaid edges and SVG verified",
      ];
    },
  ],
  [
    "text-to-mermaid",
    async () => {
      await goto("text-to-mermaid");
      await page
        .locator("#source-text")
        .fill("Receive order\nStock available?\nShip item\nNotify backorder");
      await page
        .locator("#instructions")
        .fill(
          "Receive the order, then decide whether stock is available. If yes ship the item. If no notify backorder. Both outcomes end the flow; do not connect them to each other.",
        );
      const plan = await ask(true);
      assert.equal(
        plan.graph.nodes.find((n) => n.id === "n1").type,
        "decision",
      );
      assert.ok(
        plan.graph.edges.some(
          (e) => e.from === "n1" && e.to === "n2" && e.label === "yes",
        ),
      );
      assert.ok(
        plan.graph.edges.some(
          (e) => e.from === "n1" && e.to === "n3" && e.label === "no",
        ),
      );
      await expect(
        page
          .frameLocator('iframe[title="Rendered Mermaid flowchart"]')
          .locator("svg"),
      ).toBeVisible({ timeout: 20000 });
      const code = await download("#extra-download", "flowchart.mmd");
      assert.ok(
        code.includes("Stock available?") &&
          code.includes("Ship item") &&
          code.includes("Notify backorder"),
      );
      const svgPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download SVG", exact: true })
        .click();
      const svgFile = await svgPromise;
      await svgFile.saveAs(root + "/" + current.id + ".svg");
      assert.ok(
        (await readFile(await svgFile.path(), "utf8")).includes("<svg"),
      );
      current.downloads.push({ path: root + "/" + current.id + ".svg" });
      current.checks = [
        "real Jev selected decision and both supported branches",
        "rendered actual Mermaid SVG in webpage",
        "Mermaid and SVG downloads validated",
      ];
    },
  ],
  [
    "ask-a-webpage-pasted",
    async () => {
      await goto("ask-a-webpage");
      const source =
        "Harbor Clinic opens Monday through Friday, from 08:30 to 17:00.\n\nAppointments can be cancelled without a fee at least 24 hours before the scheduled time.\n\nThe reception team answers calls at extension 204.";
      await page.locator("#source-text").fill(source);
      await page
        .locator("#instructions")
        .fill(
          "How far in advance can an appointment be cancelled without a fee?",
        );
      const plan = await ask(true);
      assert.equal(plan.status, "answered");
      assert.ok(plan.excerpts.some((e) => e.text.includes("24 hours")));
      for (const e of plan.excerpts)
        assert.equal(source.slice(e.start, e.end), e.text);
      const exported = JSON.parse(
        await download("#extra-download", "evidence.json"),
      );
      assert.deepEqual(exported, plan);
      current.checks = [
        "real Jev selected answer-bearing source evidence",
        "24-hour cancellation condition retained",
        "exact excerpt offsets and downloaded evidence verified",
      ];
    },
  ],
  [
    "ask-a-webpage-public-url",
    async () => {
      await goto("ask-a-webpage");
      await page.getByRole("tab", { name: "Public URL", exact: true }).click();
      await page
        .locator("#page-url")
        .fill("https://docs.python.org/3/library/asyncio.html");
      await page.locator("#instructions").fill("What is asyncio used for?");
      const plan = await ask(true);
      const source = await page.locator("#source-text").inputValue();
      assert.ok(source.includes("asyncio"));
      assert.ok(["answered", "partial"].includes(plan.status));
      assert.ok(
        plan.excerpts.some((e) => /concurrent|async\/await/i.test(e.text)),
      );
      for (const e of plan.excerpts)
        assert.equal(source.slice(e.start, e.end), e.text);
      await download("#extra-download", "public-evidence.json");
      current.checks = [
        "public URL read through actual webpage button",
        "fetched source sent to real Jev",
        "relevant source-backed asyncio evidence verified",
      ];
    },
  ],
  [
    "ask-a-webpage-absent-answer",
    async () => {
      await goto("ask-a-webpage");
      await page
        .locator("#source-text")
        .fill(
          "Harbor Clinic opens Monday to Friday. Appointments can be cancelled at least 24 hours in advance.",
        );
      await page
        .locator("#instructions")
        .fill("What is the clinic owner's personal mobile phone number?");
      const plan = await ask(true);
      assert.equal(plan.status, "not-answered");
      assert.deepEqual(plan.excerpts, []);
      await expect(page.locator("#extra-visual")).toContainText("Not answered");
      current.checks = [
        "real Jev abstained when answer is absent",
        "no invented phone number or excerpt",
      ];
    },
  ],
  [
    "date-ambiguity",
    async () => {
      await goto("fix-excel-dates");
      await page.locator("#dates-input").fill("03/04/2026");
      await page
        .locator("#date-context")
        .fill(
          "The export has no locale information. The numeric date could mean March 4 or April 3; leave the convention unresolved.",
        );
      const plan = await ask();
      assert.equal(plan.convention, "auto");
      const text = await page.locator("#result-view").innerText();
      assert.ok(text.includes("review"));
      current.checks = [
        "real Jev preserved explicit ambiguity",
        "local result flags the unresolved date rather than guessing",
      ];
    },
  ],
];
const selected = process.env.UTILITYPOT_CASES
  ? cases.filter(([id]) => process.env.UTILITYPOT_CASES.split(",").includes(id))
  : cases;
try {
  assert.ok(selected.length, "No live cases selected");
  if (process.env.UTILITYPOT_CASES)
    assert.deepEqual(
      new Set(selected.map(([id]) => id)),
      new Set(process.env.UTILITYPOT_CASES.split(",")),
      "Unknown live case name",
    );
  for (const [id, run] of selected) {
    current = {
      id,
      startedAt: new Date().toISOString(),
      network: [],
      downloads: [],
      status: "running",
    };
    try {
      await run();
      current.status = current.manualCorrections?.length
        ? "passed-with-manual-correction"
        : "passed";
    } catch (e) {
      current.status = "failed";
      current.error = e.stack || String(e);
      try {
        current.visibleStatus = await page
          .locator("#utility-status,#extra-status")
          .allTextContents();
      } catch {}
    }
    try {
      await page.screenshot({ path: root + "/" + id + ".png", fullPage: true });
    } catch {}
    current.finishedAt = new Date().toISOString();
    results.push(current);
    await writeFile(
      root + "/results.json",
      JSON.stringify(
        {
          origin: target.origin,
          integration: target.mode,
          mocking: false,
          plannedCaseCount: selected.length,
          results,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({
        id,
        status: current.status,
        model: current.interpretation?.model,
        http: current.interpretation?.http,
        error: current.status === "failed" ? current.error : undefined,
        visibleStatus: current.visibleStatus,
      }),
    );
  }
  assert.equal(results.length, selected.length);
  assert.equal(new Set(results.map((r) => r.id)).size, selected.length);
  const summary = {
    directory: root,
    total: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    passedWithManualCorrection: results
      .filter((r) => r.status === "passed-with-manual-correction")
      .map((r) => r.id),
    failed: results.filter((r) => r.status === "failed").map((r) => r.id),
    actualJevResponses: results.filter(
      (r) => r.interpretation?.source === "jev",
    ).length,
  };
  await writeFile(
    root + "/summary.json",
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed.length) process.exitCode = 1;
} finally {
  await browser.close();
}
