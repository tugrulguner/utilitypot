import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import Papa from "papaparse";
import { liveTarget } from "./live-target.mjs";
const target = liveTarget(process.env.BASE_URL);
const origin = target.origin;
const folder = resolve(
  process.env.RESULTS_DIR ||
    "test-results-live/first-use-" +
      new Date().toISOString().replaceAll(":", "-"),
);
await mkdir(folder, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const results = [],
  api = [],
  errors = [],
  missing = [],
  networkFailures = [];
const selected = process.env.FIRST_USE_ONLY?.split(",");
let lastPaid = 0;
page.on("console", (m) => {
  if (m.type() === "error") networkFailures.push({ console: m.text() });
});
page.on("requestfailed", (r) =>
  networkFailures.push({ url: r.url(), failure: r.failure() }),
);
page.on("request", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/"))
    api.push({ url: r.url(), method: r.method() });
});
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() === 404 && r.url().includes("/_astro/")) missing.push(r.url());
});
async function warmRendererAssets() {
  const files = (
    await readdir(new URL("../dist/_astro/", import.meta.url))
  ).filter((f) => f.endsWith(".js"));
  let pending = files;
  for (let attempt = 0; attempt < 40 && pending.length; attempt++) {
    const failed = [];
    for (let i = 0; i < pending.length; i += 6)
      await Promise.all(
        pending.slice(i, i + 6).map(async (f) => {
          const r = await page.evaluate(
            async (path) => {
              try {
                const r = await fetch(path, { cache: "reload" });
                return {
                  status: r.status,
                  type: r.headers.get("content-type"),
                };
              } catch (e) {
                return { error: e.message };
              }
            },
            origin + "/_astro/" + f,
          );
          if (r.status !== 200 || !r.type?.includes("javascript"))
            failed.push(f);
        }),
      );
    pending = failed;
    if (pending.length) {
      console.log("Renderer asset readiness", pending.length, attempt + 1);
      await page.waitForTimeout(3000);
    }
  }
  assert.equal(
    pending.length,
    0,
    "Candidate lazy-renderer assets must be available before diagram action",
  );
}
async function goto(slug) {
  for (let i = 0; i < 40; i++) {
    const n = missing.length,
      r = await page.goto(
        origin + "/tools/" + slug + "/?first-use-readiness=" + Date.now(),
      );
    if (
      r.status() === 200 &&
      missing.length === n &&
      (await page.locator("#example-outcome").count())
    )
      return;
    await page.waitForTimeout(3000);
  }
  throw Error("Candidate HTML/assets did not become ready: " + slug);
}
async function example(slug, button) {
  await goto(slug);
  if (
    slug === "text-to-mermaid" &&
    process.env.PREFLIGHT_RENDERER_ASSETS === "1"
  ) {
    await warmRendererAssets();
    await page.reload();
  }
  const before = api.length;
  await expect(page.locator("#example-outcome")).not.toHaveText("");
  const label = await page.locator(button).innerText();
  assert.ok(!/^Load example$/i.test(label));
  await page.locator(button).click();
  await page.waitForTimeout(250);
  assert.equal(
    api.length,
    before,
    "An example must not submit source or read a URL",
  );
  return {
    exampleLabel: label,
    explanation: await page.locator("#example-outcome").innerText(),
  };
}
async function download(selector, name) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.locator(selector).click(),
  ]);
  const path = folder + "/" + name;
  await file.saveAs(path);
  return readFile(path, "utf8");
}
async function ask() {
  const delay = 13000 - (Date.now() - lastPaid);
  if (delay > 0) await page.waitForTimeout(delay);
  lastPaid = Date.now();
  const responsePromise = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/utilities/interpret",
    { timeout: 45000 },
  );
  await page.locator("#extra-ask").click();
  const response = await responsePromise;
  const body = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(body));
  assert.equal(body.source, "jev");
  assert.match(body.model, /^jev-/);
  return body;
}
async function run(id, fn) {
  if (selected && !selected.includes(id)) return;
  const row = { id, status: "running" };
  results.push(row);
  try {
    Object.assign(row, await fn());
    row.status = row.manualCorrections?.length
      ? "passed-with-manual-correction"
      : "passed";
    await page.screenshot({ path: folder + "/" + id + ".png", fullPage: true });
  } catch (e) {
    row.status = "failed";
    row.error = String(e.stack || e);
    await page
      .screenshot({ path: folder + "/" + id + "-failure.png", fullPage: true })
      .catch(() => {});
  }
  await writeFile(
    folder + "/summary.json",
    JSON.stringify(
      { origin, mode: target.mode, results, api, errors, networkFailures },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(row));
}
try {
  await run("csv-example-to-fresh-orders", async () => {
    const meta = await example("csv-to-nested-json", "#load-example");
    await page
      .locator("#csv-input")
      .fill(
        'order_id,buyer,sku,qty\n007,"Alex, R",P1,2\n007,"Alex, R",P2,1\n008,Sam,P3,4',
      );
    await page.locator("#group-by").selectOption("order_id");
    await page.locator("#run").click();
    const body = JSON.parse(await download("#download", "fresh-orders.json"));
    assert.equal(body.length, 2);
    assert.equal(body[0].order_id, "007");
    const children = Object.values(body[0]).find(Array.isArray);
    assert.deepEqual(
      children.map((x) => x.sku),
      ["P1", "P2"],
    );
    assert.equal(children[0].qty, "2");
    const raw = await page.locator("#csv-input").inputValue(),
      result = await page.locator("#result-view").innerText();
    page.once("dialog", (d) => d.dismiss());
    await page.locator("#load-example").click();
    assert.equal(await page.locator("#csv-input").inputValue(), raw);
    assert.equal(await page.locator("#result-view").innerText(), result);
    const before = api.length;
    page.once("dialog", (d) => d.accept());
    await page.locator("#load-example").click();
    assert.notEqual(await page.locator("#csv-input").inputValue(), raw);
    await expect(page.locator("#results")).toBeHidden();
    assert.equal(api.length, before);
    return {
      ...meta,
      checks: [
        "fresh grouping",
        "literal IDs/strings",
        "download",
        "cancel preserves source and result",
        "accepted replacement clears result without AI",
      ],
    };
  });
  await run("dates-example-to-fresh-values", async () => {
    const meta = await example("fix-excel-dates", "#load-example");
    await page
      .locator("#dates-input")
      .fill("2027-11-14\n03/04/2027\n2027-11\nbad-date");
    await page.locator("#run").click();
    const text = await page.locator("#result-view").innerText();
    assert.match(text, /ambiguous/);
    assert.match(text, /partial/);
    assert.match(text, /invalid/);
    await page.locator("#date-convention").selectOption("day-first");
    await page.locator("#run").click();
    const csv = await download("#download", "fresh-dates.csv");
    assert.ok(csv.includes("2027-04-03"));
    assert.ok(csv.includes("2027-11-14"));
    assert.ok(csv.includes("bad-date"));
    return {
      ...meta,
      checks: [
        "fresh ambiguity retained",
        "explicit convention",
        "partial and invalid preserved",
        "download",
      ],
    };
  });
  await run("meeting-example-to-fresh-cities", async () => {
    const meta = await example("meeting-time-finder", "#load-example");
    for (const i of [0, 1])
      await expect(page.locator(`#p${i}-name`)).toBeHidden();
    await page.locator("#meeting-date").fill("2027-01-19");
    for (const [i, city] of [
      [0, "Paris"],
      [1, "New York"],
    ]) {
      await page.locator(`#p${i}-zone`).fill(city);
      await page.locator(`#p${i}-start`).fill("09:00");
      await page.locator(`#p${i}-end`).fill("17:00");
    }
    await page.locator("#run").click();
    await page.locator("#slot-choice").selectOption("1");
    const ics = await download(
      'button:has-text("Add to calendar")',
      "fresh-selected-meeting.ics",
    );
    assert.match(ics, /BEGIN:VCALENDAR/);
    const expected = new Date(
      Date.parse("2027-01-19T09:00:00-05:00") + 15 * 60 * 1000,
    )
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(".000", "");
    assert.ok(ics.includes("DTSTART:" + expected));
    await page.locator("#add-person").click();
    await expect(page.locator("#p2-name")).toBeHidden();
    return {
      ...meta,
      checks: [
        "optional names collapsed for initial and added participants",
        "fresh cities",
        "selected calendar export",
      ],
    };
  });
  await run("json-example-to-fresh-records", async () => {
    const meta = await example("json-to-csv", "#extra-example");
    await page.locator("#source-text").fill(
      JSON.stringify({
        orders: [{ id: "007", items: ["A", "B"], customer: { name: "Alex" } }],
        people: [{ name: "Sam" }],
      }),
    );
    await expect(page.locator("#row-path")).toHaveValue("");
    await page.locator("#row-path").selectOption("orders");
    await page.locator("#array-policy").selectOption("reject");
    await page.locator("#extra-run").click();
    await expect(page.locator("#extra-status")).toContainText("Keep");
    await page.locator("#array-policy").selectOption("join");
    await page.locator("#extra-run").click();
    const rows = Papa.parse(
      await download("#extra-download", "fresh-records.csv"),
      { header: true, skipEmptyLines: true },
    ).data;
    assert.equal(rows[0].id, "007");
    assert.equal(rows[0]["customer.name"], "Alex");
    assert.deepEqual(JSON.parse(rows[0].items), ["A", "B"]);
    return {
      ...meta,
      checks: [
        "multiple-list choice stays explicit",
        "nested list stop/keep recovery",
        "leading-zero ID",
        "download",
      ],
    };
  });
  await run("diagram-example-to-fresh-steps", async () => {
    const meta = await example("text-to-mermaid", "#extra-example");
    await page
      .locator("#source-text")
      .fill("Receive application\nCheck details\nSend confirmation");
    await page.locator("#create-diagram").click();
    const mmd = await download("#extra-download", "fresh-flowchart.mmd");
    assert.ok(mmd.includes("Receive application"));
    assert.ok(mmd.includes("Send confirmation"));
    return {
      ...meta,
      checks: ["fresh steps", "private rendering and Mermaid download"],
    };
  });
  await run("entities-example-to-fresh-names-real-jev", async () => {
    const meta = await example("entity-extractor", "#extra-example");
    const source =
      "Alex Rivera joined Pine Studio. Morgan Lee met Alex Rivera.";
    await page.locator("#source-text").fill(source);
    const body = await ask();
    const rawProposal = structuredClone(body.plan),
      manualCorrections = [];
    assert.equal(body.plan.entities.length, 4);
    for (const e of body.plan.entities)
      assert.equal(source.slice(e.start, e.end), e.text);
    const expected = [
      "Alex Rivera",
      "Morgan Lee",
      "Alex Rivera",
      "Pine Studio",
    ];
    for (let i = 0; i < expected.length; i++)
      assert.ok(
        (i === 0 || i === 2 ? ["Alex", expected[i]] : [expected[i]]).includes(
          body.plan.entities[i].text,
        ),
        "Unexpected extraction beyond supported span correction",
      );
    for (const i of [0, 2])
      if (body.plan.entities[i].text !== expected[i]) {
        if (
          !(await page
            .getByLabel("Mention " + (i + 1), { exact: true })
            .isVisible())
        )
          await page.locator("#entity-review > summary").click();
        await page
          .getByLabel("Mention " + (i + 1), { exact: true })
          .fill(expected[i]);
        await page
          .getByLabel("Mention " + (i + 1), { exact: true })
          .press("Tab");
        await page
          .getByLabel("Source occurrence " + (i + 1), { exact: true })
          .selectOption(i === 0 ? "0" : "1");
        manualCorrections.push({
          mention: i + 1,
          from: body.plan.entities[i].text,
          to: expected[i],
          occurrence: i === 0 ? 1 : 2,
        });
      }
    if (manualCorrections.length) await page.locator("#extra-run").click();
    const exported = JSON.parse(
      await download("#extra-download", "fresh-entities.json"),
    );
    const entities = Array.isArray(exported) ? exported : exported.entities;
    assert.deepEqual(
      entities.map((e) => e.text),
      expected,
    );
    for (const e of entities)
      assert.equal(source.slice(e.start, e.end), e.text);
    return {
      ...meta,
      model: body.model,
      rawProposal,
      manualCorrections,
      checks: [
        "fresh names",
        "real Jev",
        "review and exact-source correction when needed",
        "distinct repeated source spans",
        "download verified",
      ],
    };
  });
  await run("qa-example-to-fresh-passage-real-jev", async () => {
    const meta = await example("ask-a-webpage", "#extra-example");
    await page
      .locator("#source-text")
      .fill(
        "Every order is reviewed before dispatch.\n\nCancellations are accepted until noon on the next business day.\n\nRefunds return to the original payment method.",
      );
    await page
      .locator("#instructions")
      .fill("Until when can an order be cancelled?");
    const body = await ask();
    await expect(page.locator("#extra-visual")).toContainText(
      "Cancellations are accepted until noon on the next business day.",
    );
    return {
      ...meta,
      model: body.model,
      checks: [
        "fresh passage and question",
        "real Jev",
        "literal supporting source quotation",
      ],
    };
  });
} finally {
  await browser.close();
  const failed = results.filter((x) => !x.status.startsWith("passed"));
  console.log(
    JSON.stringify({
      folder,
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.map((x) => x.id),
      errors,
    }),
  );
  if (failed.length || results.length !== (selected?.length || 7))
    process.exitCode = 1;
}
