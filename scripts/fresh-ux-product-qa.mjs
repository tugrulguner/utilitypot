import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import Papa from "papaparse";
const origin = process.env.UX_ORIGIN;
assert.match(
  origin || "",
  /^https:\/\/(?:[a-f0-9]{8}-utilitypot-site\.tugrul-gunr\.workers\.dev|utilitypot\.modepot\.io)$/,
);
const dir = resolve(
  process.env.UX_RESULTS_DIR ||
    "test-results-live/fresh-ux-" +
      new Date().toISOString().replaceAll(":", "-"),
);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
});
const records = [],
  responses = [],
  consoleErrors = [],
  pending = new Set(),
  setup = { assetAttempts: [], localReadiness: [] };
let lastPaid = 0;
page.on("request", (r) => {
  if (
    r.method() === "POST" &&
    new URL(r.url()).pathname === "/api/utilities/interpret"
  )
    lastPaid = Date.now();
});
page.on("pageerror", (e) =>
  consoleErrors.push({ type: "pageerror", message: e.message }),
);
page.on("console", (e) => {
  if (e.type() === "error")
    consoleErrors.push({ type: "console", message: e.text() });
});
page.on("response", (r) => {
  if (!new URL(r.url()).pathname.startsWith("/api/")) return;
  const p = (async () => {
    let body;
    try {
      body = await r.json();
    } catch {
      body = (await r.text()).slice(0, 1000);
    }
    responses.push({
      url: r.url(),
      status: r.status(),
      body,
      observedAt: new Date().toISOString(),
    });
  })();
  pending.add(p);
  p.finally(() => pending.delete(p));
});
async function flush() {
  await Promise.allSettled([...pending]);
}
async function persist() {
  await flush();
  await writeFile(
    join(dir, "results.json"),
    JSON.stringify(
      {
        origin,
        method:
          "Candidate hosted UI + real hosted Worker/Jev; no request mocks or provider retries",
        records,
        responses,
        consoleErrors,
        setup,
      },
      null,
      2,
    ),
  );
}
async function shot(id) {
  const path = join(dir, id + ".png");
  await page.screenshot({ path, fullPage: false });
  return path;
}
async function mobile(id, selector) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(selector).scrollIntoViewIfNeeded();
  const path = await shot(id);
  await page.setViewportSize({ width: 1280, height: 900 });
  return path;
}
async function go(slug) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const url =
      origin +
      "/tools/" +
      slug +
      "/" +
      (attempt ? "?fresh-ux-navigation=" + Date.now() : "");
    const r = await page.goto(url, { waitUntil: "networkidle" });
    if (r.status() === 200) {
      await expect(
        page.locator("#extra-ask,#run,#create-diagram,#extra-run").first(),
      ).toBeAttached();
      return;
    }
    const text = await page.locator("body").innerText();
    setup.navigationAttempts ??= [];
    setup.navigationAttempts.push({
      slug,
      attempt,
      status: r.status(),
      ray: r.headers()["cf-ray"],
      bodyPrefix: text.slice(0, 300),
    });
    await writeFile(join(dir, "setup.json"), JSON.stringify(setup, null, 2));
    if (r.status() !== 404 || !text.includes("There is nothing here yet"))
      throw Error(
        "Unexpected navigation response " +
          r.status() +
          " " +
          text.slice(0, 200),
      );
    await page.waitForTimeout(3000);
  }
  throw Error("Preview route did not leave Cloudflare placeholder: " + slug);
}
async function paid(selector) {
  await page.waitForTimeout(Math.max(0, 13500 - (Date.now() - lastPaid)));
  lastPaid = Date.now();
  const promise = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/utilities/interpret",
    { timeout: 50000 },
  );
  await page.locator(selector).click();
  const r = await promise;
  const body = await r.json();
  assert.equal(r.status(), 200, JSON.stringify(body));
  assert.equal(body.source, "jev");
  assert.ok(body.model);
  await expect(page.locator(selector)).toBeEnabled({ timeout: 50000 });
  await flush();
  return body;
}
async function download(selector, id) {
  const promise = page.waitForEvent("download");
  await page.locator(selector).click();
  const d = await promise,
    path = join(dir, id + "-" + d.suggestedFilename());
  await d.saveAs(path);
  return { path, text: await readFile(path, "utf8") };
}
async function scenario(id, fn) {
  if (process.env.UX_ONLY && !process.env.UX_ONLY.split(",").includes(id))
    return;
  const row = {
    id,
    status: "running",
    startedAt: new Date().toISOString(),
    responseStart: responses.length,
  };
  try {
    row.evidence = await fn();
    row.status = "passed";
  } catch (e) {
    row.status = "failed";
    row.error = String(e.stack || e);
  }
  try {
    row.screenshot = await shot(id);
    row.visibleText = await page.locator("body").innerText();
  } catch {}
  row.completedAt = new Date().toISOString();
  records.push(row);
  await persist();
  console.log(
    JSON.stringify({
      id,
      status: row.status,
      error: row.error,
      evidence: row.evidence,
    }),
  );
}
const leaves = (v) =>
  typeof v === "string"
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(leaves)
      : v && typeof v === "object"
        ? Object.values(v).flatMap(leaves)
        : [];
async function readiness() {
  const source = process.env.UX_SOURCE_DIR || process.cwd();
  const files = (await readdir(join(source, "dist/_astro"))).filter((f) =>
    /\.(js|css|woff2?)$/.test(f),
  );
  let pendingAssets = files;
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await page.goto(
      origin + "/tools/json-to-csv/?asset-readiness=" + Date.now(),
      { waitUntil: "domcontentloaded" },
    );
    const failed = [];
    for (let i = 0; i < pendingAssets.length; i += 6) {
      const rows = await page.evaluate(
        async (urls) =>
          Promise.all(
            urls.map(async (url) => {
              try {
                const r = await fetch(url, { cache: "reload" });
                await r.arrayBuffer();
                return {
                  url,
                  status: r.status,
                  type: r.headers.get("content-type"),
                };
              } catch (e) {
                return { url, status: 0, error: e.message };
              }
            }),
          ),
        pendingAssets.slice(i, i + 6).map((f) => origin + "/_astro/" + f),
      );
      for (const r of rows)
        if (
          r.status !== 200 ||
          (/\.js$/.test(r.url) && !r.type?.includes("javascript")) ||
          (/\.css$/.test(r.url) && !r.type?.includes("text/css"))
        )
          failed.push(r);
    }
    setup.assetAttempts.push({
      attempt,
      htmlStatus: response.status(),
      failed,
    });
    await writeFile(join(dir, "setup.json"), JSON.stringify(setup, null, 2));
    pendingAssets = failed.map((r) => r.url.split("/").at(-1));
    if (!pendingAssets.length && response.status() === 200) break;
    if (attempt === 39)
      throw Error("Candidate HTML/assets not ready; no paid action attempted");
    await page.waitForTimeout(3000);
  }
  await go("json-to-csv");
  await page
    .locator("#source-text")
    .fill('{"records":[{"probe":"ready-extra"}]}');
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-results")).toContainText("ready-extra");
  setup.localReadiness.push("extra module: real private JSON conversion");
  await go("csv-to-nested-json");
  await page.locator("#csv-input").fill("Group,Value\ng,ready-main");
  await page.locator("#group-by").selectOption("Group");
  await page.locator("#run").click();
  await expect(page.locator("#results")).toContainText("ready-main");
  setup.localReadiness.push("main module: real private CSV conversion");
  assert.equal(responses.length, 0, "Readiness must not call the API");
  setup.consoleErrors = consoleErrors.splice(0);
  await writeFile(join(dir, "setup.json"), JSON.stringify(setup, null, 2));
  console.log(
    JSON.stringify({
      readiness: "passed",
      assets: files.length,
      attempts: setup.assetAttempts.length,
      localReadiness: setup.localReadiness,
    }),
  );
}
try {
  await readiness();
  await scenario("csv-fresh-custom", async () => {
    await go("csv-to-nested-json");
    await page
      .locator("#csv-input")
      .fill(
        'Order,Customer,Item,Qty\nA-17,Samira Vale,"Notebook, dotted",2\nA-17,Samira Vale,Pen,3\nB-04,Luis Costa,Folder,1',
      );
    await page.locator("#group-by").selectOption("Order");
    await page
      .locator("summary")
      .filter({ hasText: "Advanced structure" })
      .click();
    await page.locator("#custom-schema").check();
    await page
      .locator("#json-example")
      .fill(
        '{"orderId":"A-17","customer":"Samira Vale","items":[{"product":"Notebook, dotted","quantity":"2"}]}',
      );
    await page
      .locator("#csv-intent")
      .fill(
        "Group by Order. Keep Customer once per order. Put Item and Qty in items. Rename fields to match the example; preserve all values as strings.",
      );
    const r = await paid("#ask-jev");
    const out = await download("#download", "csv");
    assert.deepEqual(JSON.parse(out.text), [
      {
        orderId: "A-17",
        customer: "Samira Vale",
        items: [
          { product: "Notebook, dotted", quantity: "2" },
          { product: "Pen", quantity: "3" },
        ],
      },
      {
        orderId: "B-04",
        customer: "Luis Costa",
        items: [{ product: "Folder", quantity: "1" }],
      },
    ]);
    return {
      model: r.model,
      download: out.path,
      mobile: await mobile("csv-mobile", "#results"),
    };
  });
  await scenario("dates-partial-and-context", async () => {
    await go("fix-excel-dates");
    await page
      .locator("#dates-input")
      .fill(
        "January 2027\n01/2027\n2027-01\n09/01/2027\n31/02/2027\n\n9 January 2027",
      );
    await page
      .locator("summary")
      .filter({ hasText: "Interpret source context" })
      .click();
    await page
      .locator("#date-context")
      .fill(
        "UK volunteer rota. Numeric day/month/year; preserve incomplete month/year dates without inventing a day.",
      );
    const r = await paid("#ask-jev");
    const out = await download("#download", "dates");
    const rows = Papa.parse(out.text, {
      header: true,
      skipEmptyLines: true,
    }).data;
    assert.equal(rows.length, 7);
    for (let i = 0; i < 3; i++) {
      assert.equal(rows[i].status, "partial");
      assert.equal(rows[i].normalized, "2027-01");
    }
    assert.equal(rows[3].normalized, "2027-01-09");
    assert.equal(rows[4].status, "invalid");
    assert.equal(rows[5].status, "empty");
    assert.equal(rows[6].normalized, "2027-01-09");
    return {
      model: r.model,
      download: out.path,
      mobile: await mobile("dates-mobile", "#results"),
    };
  });
  await scenario("meeting-boston-first-use", async () => {
    await go("meeting-time-finder");
    for (const [id, value] of Object.entries({
      "meeting-date": "2027-02-11",
      duration: "45",
      "p0-zone": "Berlin",
      "p0-name": "Samira",
      "p1-zone": "Boston",
      "p1-name": "Luis",
    })) {
      if (id.endsWith("-name"))
        await page
          .locator("#" + id)
          .locator("xpath=ancestor::details[1]")
          .locator("summary")
          .click();
      await page.locator("#" + id).fill(value);
    }
    await page.locator("#availability-mode").selectOption("jev");
    await page
      .locator("#p0-text")
      .fill(
        "Available from 2 pm until 6 pm, but unavailable from 3 pm to 3:30 pm.",
      );
    await page
      .locator("#p1-text")
      .fill("Available from 8 am to noon, but not from 9 am to 9:30 am.");
    const r = await paid("#run");
    await expect(page.locator("#results")).toContainText("Boston");
    await page.locator("#slot-choice").selectOption("2");
    const out = await download("#result-view > button", "meeting");
    assert.match(out.text, /DTSTART:20270211T143000Z/);
    assert.match(out.text, /DTEND:20270211T151500Z/);
    return {
      model: r.model,
      download: out.path,
      mobile: await mobile("meeting-mobile", "#results"),
    };
  });
  await scenario("json-explicit-preserve-first", async () => {
    await go("json-to-csv");
    await page.locator("#source-text").fill(
      JSON.stringify({
        exportedAt: "2027-02-01",
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
      }),
    );
    await page
      .locator("summary")
      .filter({ hasText: "Choose records with Jev" })
      .click();
    await page
      .locator("#instructions")
      .fill(
        "Use the orders array as rows. Flatten buyer.name and buyer.city into columns. Keep tags as JSON text in one cell; preserve id strings, booleans and zero totals.",
      );
    const r = await paid("#extra-ask");
    assert.equal(r.plan.path, "orders");
    assert.equal(
      r.plan.arrays,
      "join",
      "Explicit keep-as-JSON must not become reject/omit",
    );
    const out = await download("#extra-download", "json");
    const rows = Papa.parse(out.text, {
      header: true,
      skipEmptyLines: true,
    }).data;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, "0008");
    assert.equal(rows[0]["buyer.name"], "Zoë Ramos");
    assert.equal(rows[0].paid, "false");
    assert.equal(rows[0].total, "0");
    assert.deepEqual(JSON.parse(rows[0].tags), ["priority", "gift"]);
    assert.deepEqual(JSON.parse(rows[1].tags), []);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#extra-results").scrollIntoViewIfNeeded();
    const layout = await page.locator("#extra-results").evaluate((root) => {
      const wanted = ["0008", "false", "12.5"];
      return wanted.map((value) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
          matches = [];
        let n;
        while ((n = walker.nextNode())) {
          if (
            n.textContent.trim() !== value ||
            !n.parentElement.checkVisibility()
          )
            continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          matches.push(
            [...r.getClientRects()].filter((x) => x.width && x.height).length,
          );
        }
        return { value, lineCounts: matches };
      });
    });
    for (const x of layout) {
      assert.ok(x.lineCounts.length, "No visible preview value " + x.value);
      assert.ok(
        x.lineCounts.every((n) => n === 1),
        "Fragmented mobile value " + JSON.stringify(x),
      );
    }
    const screenshot = await shot("json-mobile");
    await page.setViewportSize({ width: 1280, height: 900 });
    return { model: r.model, download: out.path, layout, mobile: screenshot };
  });
  await scenario("entities-fresh-unicode", async () => {
    await go("entity-extractor");
    const input =
      "Leïla Haddad joined Atlas Forge in Porto. Jonah O'Neill from Cobalt Works met Leïla Haddad.";
    await page.locator("#source-text").fill(input);
    const r = await paid("#extra-ask");
    assert.deepEqual(
      r.plan.entities.map((e) => e.text),
      [
        "Leïla Haddad",
        "Jonah O'Neill",
        "Leïla Haddad",
        "Atlas Forge",
        "Cobalt Works",
      ],
    );
    for (const e of r.plan.entities)
      assert.equal(input.slice(e.start, e.end), e.text);
    const out = await download("#extra-download", "entities");
    assert.deepEqual(JSON.parse(out.text), r.plan.entities);
    return {
      model: r.model,
      download: out.path,
      mobile: await mobile("entities-mobile", "#extra-results"),
    };
  });
  await scenario("diagram-return-roles-and-branches", async () => {
    await go("text-to-mermaid");
    await page
      .locator("#source-text")
      .fill(
        "Receive a returned parcel.\nIs the item damaged?\nIf damaged, route the parcel to inspection and stop.\nIf not damaged, restock the item.\nEmail the customer a confirmation.\nClose the return.",
      );
    await page.locator("#diagram-mode").selectOption("jev");
    await page
      .locator("#instructions")
      .fill(
        "Step 2 is the only decision. Yes goes to step 3, which is terminal. No goes to step 4, then step 5, then step 6. Step 1 goes to step 2. Never connect the damaged path to restocking.",
      );
    const r = await paid("#create-diagram"),
      g = r.plan.graph;
    assert.equal(g.nodes[1].type, "decision");
    assert.equal(g.nodes[2].type, "terminal");
    assert.equal(g.nodes[3].type, "process");
    assert.equal(g.nodes[5].type, "terminal");
    for (const [from, to, label] of [
      ["n0", "n1", ""],
      ["n1", "n2", "yes"],
      ["n1", "n3", "no"],
      ["n3", "n4", ""],
      ["n4", "n5", ""],
    ])
      assert.ok(
        g.edges.some(
          (e) => e.from === from && e.to === to && (e.label || "") === label,
        ),
      );
    assert.ok(!g.edges.some((e) => e.from === "n2"));
    await expect(page.locator("#extra-visual iframe")).toBeVisible({
      timeout: 25000,
    });
    const svg = await download("#extra-visual button", "diagram-svg");
    assert.match(svg.text, /<svg[\s>]/);
    const out = await download("#extra-download", "diagram-mermaid");
    return {
      model: r.model,
      svg: svg.path,
      mermaid: out.path,
      mobile: await mobile("diagram-mobile", "#extra-results"),
    };
  });
  await scenario("reader-source-provenance-export", async () => {
    await go("ask-a-webpage");
    await page.locator("#url-tab").click();
    const url = "https://www.mozilla.org/en-US/about/manifesto/",
      question =
        "What does the manifesto say about individual security and privacy on the internet?";
    await page
      .locator("#page-url")
      .fill("https://mozilla.org/en-US/about/manifesto/");
    await page.locator("#instructions").fill(question);
    const begin = responses.length,
      r = await paid("#extra-ask");
    const source = responses
      .slice(begin)
      .find((r) => r.url.endsWith("/read-page"));
    assert.ok(
      source && source.status === 200,
      "Actual public source read required",
    );
    assert.equal(r.plan.status, "answered");
    assert.ok(
      r.plan.excerpts.some((e) => e.text.includes("security and privacy")),
    );
    for (const e of r.plan.excerpts)
      assert.equal(source.body.text.slice(e.start, e.end), e.text);
    const out = await download("#extra-download", "reader"),
      exported = JSON.parse(out.text),
      strings = leaves(exported);
    assert.ok(
      strings.includes(url),
      "Downloaded provenance must retain final URL",
    );
    assert.ok(
      strings.includes(question),
      "Downloaded provenance must retain question",
    );
    assert.ok(
      strings.includes(source.body.text),
      "Downloaded offsets need exact source snapshot",
    );
    assert.deepEqual(
      exported.source?.retrieval?.redirects,
      source.body.redirects,
      "Preserve the actual redirect metadata array, not an invented count",
    );
    return {
      model: r.model,
      download: out.path,
      mobile: await mobile("reader-mobile", "#extra-results"),
    };
  });
  await scenario("json-explicit-omit-control", async () => {
    await go("json-to-csv");
    await page
      .locator("#source-text")
      .fill('{"rows":[{"code":"Q-12","labels":["new"],"active":false}]}');
    await page
      .locator("summary")
      .filter({ hasText: "Choose records with Jev" })
      .click();
    await page
      .locator("#instructions")
      .fill(
        "Use rows as spreadsheet records. Omit the labels array field entirely; keep code and active.",
      );
    const r = await paid("#extra-ask");
    assert.equal(r.plan.arrays, "omit");
    const out = await download("#extra-download", "omit-control");
    const rows = Papa.parse(out.text, {
      header: true,
      skipEmptyLines: true,
    }).data;
    assert.deepEqual(rows, [{ code: "Q-12", active: "false" }]);
    return { model: r.model, download: out.path };
  });
  await scenario("json-unspecified-policy-stop-control", async () => {
    await go("json-to-csv");
    await page
      .locator("#source-text")
      .fill('{"rows":[{"code":"Q-13","labels":["new"]}]}');
    await page
      .locator("summary")
      .filter({ hasText: "Choose records with Jev" })
      .click();
    await page
      .locator("#instructions")
      .fill("Use rows as spreadsheet records.");
    const r = await paid("#extra-ask");
    assert.equal(r.plan.arrays, "reject");
    await expect(page.locator("#extra-results")).toBeHidden();
    return { model: r.model, policy: r.plan.arrays, safeStop: true };
  });
  await scenario("diagram-start-end-control", async () => {
    await go("text-to-mermaid");
    await page
      .locator("#source-text")
      .fill("Start.\nSend the welcome email.\nEnd.");
    await page.locator("#diagram-mode").selectOption("jev");
    await page
      .locator("#instructions")
      .fill(
        "Start goes to sending the welcome email, then End. Start and End are boundary states, the email step is a process.",
      );
    const r = await paid("#create-diagram"),
      g = r.plan.graph;
    assert.equal(g.nodes[0].type, "terminal");
    assert.equal(g.nodes[1].type, "process");
    assert.equal(g.nodes[2].type, "terminal");
    assert.ok(g.edges.some((e) => e.from === "n0" && e.to === "n1"));
    assert.ok(g.edges.some((e) => e.from === "n1" && e.to === "n2"));
    assert.ok(!g.edges.some((e) => e.from === "n2"));
    return { model: r.model, graph: g };
  });
  await scenario("reader-pasted-provenance-control", async () => {
    await go("ask-a-webpage");
    const text =
        "Orientation runs online.\n\nRegistration closes on 12 March 2027.\n\nMembership fees are not listed.",
      question = "When does registration close?";
    await page.locator("#source-text").fill(text);
    await page.locator("#instructions").fill(question);
    const r = await paid("#extra-ask");
    assert.equal(r.plan.status, "answered");
    const out = await download("#extra-download", "pasted-provenance");
    const strings = leaves(JSON.parse(out.text));
    assert.ok(strings.includes(text));
    assert.ok(strings.includes(question));
    assert.ok(
      !strings.some((v) => v.includes("mozilla.org")),
      "Pasted evidence must not carry stale fetched provenance",
    );
    return { model: r.model, download: out.path };
  });
  await scenario("missing-fields-no-requests", async () => {
    const observations = [];
    for (const slug of ["entity-extractor", "ask-a-webpage"]) {
      await go(slug);
      await flush();
      const before = responses.length;
      await page.locator("#extra-ask").click();
      await page.waitForTimeout(400);
      await flush();
      assert.equal(
        responses.length,
        before,
        "Missing required fields must not send API request",
      );
      const text = await page.locator("body").innerText();
      assert.ok(
        !text.includes("Shorten the text"),
        "Do not tell an empty-source user to shorten it",
      );
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "source-text",
      );
      observations.push({ slug, focus: "source-text", noRequests: true });
    }
    return observations;
  });
  await scenario("discovery-copy", async () => {
    await page.goto(origin + "/");
    const text = await page.locator("body").innerText();
    assert.ok(!text.includes("supported documentation site"));
    assert.ok(
      await page
        .getByRole("link", { name: "Open Ask a webpage", exact: false })
        .count(),
    );
    return { homepage: origin };
  });
  // New ordinary tasks and exact failures retained from the readiness audit.
  await scenario("readiness-number-integrity", async () => {
    await go("json-to-csv");
    const before = responses.length;
    await page
      .locator("#source-text")
      .fill('[{"transactionId":9007199254740993}]');
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
    await flush();
    assert.equal(
      responses.length,
      before,
      "Unsafe input must stop before API dispatch",
    );
    await page
      .locator("#source-text")
      .fill(
        '[{"transactionId":"9007199254740993","approved":false,"amount":0},{"transactionId":"9007199254740995","approved":true,"amount":42.75}]',
      );
    await page.locator("#extra-run").click();
    const out = await download("#extra-download", "readiness-safe-identifiers"),
      rows = Papa.parse(out.text, { header: true, skipEmptyLines: true }).data;
    assert.deepEqual(
      rows.map((r) => r.transactionId),
      ["9007199254740993", "9007199254740995"],
    );
    assert.equal(rows[0].approved, "false");
    assert.equal(rows[0].amount, "0");
    return {
      download: out.path,
      unsafeInputRefused: true,
      noApiRequest: true,
      manualSourceCorrection:
        "Quote identifiers; safety/recovery control, not automatic conversion success",
      mobile: await mobile("readiness-number-mobile", "#extra-results"),
    };
  });
  await scenario("readiness-expense-records", async () => {
    await go("json-to-csv");
    const source = {
      expenseReport: {
        expenses: [
          {
            claim: "E-0041",
            employee: { name: "Anaïs Bell", team: "Field" },
            receipts: ["rail.pdf", "hotel.pdf"],
            approved: false,
            reimbursement: 0,
          },
          {
            claim: "E-0042",
            employee: { name: "Dario Soto", team: "Design" },
            receipts: [],
            approved: true,
            reimbursement: 87.25,
          },
        ],
      },
      auditLog: [
        { event: "submitted", claim: "E-0041" },
        { event: "reviewed", claim: "E-0042" },
      ],
    };
    await page.locator("#source-text").fill(JSON.stringify(source));
    await page.getByText("Choose records with Jev", { exact: true }).click();
    await page
      .locator("#instructions")
      .fill(
        "I need one spreadsheet row per expense reimbursement, not one per audit event. Flatten the employee name and team. Keep the receipt filename arrays as JSON text in a single cell. Preserve claim identifiers, true/false, and zero reimbursement.",
      );
    const r = await paid("#extra-ask");
    assert.equal(r.plan.path, "expenseReport.expenses");
    assert.equal(r.plan.arrays, "join");
    const out = await download("#extra-download", "readiness-expenses"),
      rows = Papa.parse(out.text, { header: true, skipEmptyLines: true }).data;
    assert.equal(rows.length, 2);
    assert.equal(rows[0]["employee.name"], "Anaïs Bell");
    assert.equal(rows[0].claim, "E-0041");
    assert.equal(rows[0].approved, "false");
    assert.equal(rows[0].reimbursement, "0");
    assert.deepEqual(JSON.parse(rows[0].receipts), ["rail.pdf", "hotel.pdf"]);
    assert.deepEqual(JSON.parse(rows[1].receipts), []);
    return {
      model: r.model,
      download: out.path,
      mobile: await mobile("readiness-expenses-mobile", "#extra-results"),
    };
  });
  await scenario("readiness-volunteer-custom-schema", async () => {
    await go("csv-to-nested-json");
    await page
      .locator("#csv-input")
      .fill(
        'Group,Contact,Activity,Hours\nW-09,Nia Osei,"Stage, lights",2\nW-09,Nia Osei,Registration,1\nW-10,Theo Park,First aid,3',
      );
    await page.locator("#group-by").selectOption("Group");
    await page
      .getByText("Advanced structure and custom mapping", { exact: true })
      .click();
    await page.locator("#custom-schema").check();
    await page
      .locator("#json-example")
      .fill(
        JSON.stringify({
          groupId: "W-09",
          coordinator: "Nia Osei",
          duties: [{ activity: "Stage, lights", hours: "2" }],
        }),
      );
    await page
      .locator("#csv-intent")
      .fill(
        "One object per Group. Contact is the coordinator; activities and Hours belong in duties. Rename Group to groupId and Contact to coordinator. Preserve Hours as strings and keep comma-bearing activity text.",
      );
    await page.locator("#prepare").click();
    const r = await paid("#ask-jev");
    const out = await download("#download", "readiness-volunteers");
    assert.deepEqual(JSON.parse(out.text), [
      {
        groupId: "W-09",
        coordinator: "Nia Osei",
        duties: [
          { activity: "Stage, lights", hours: "2" },
          { activity: "Registration", hours: "1" },
        ],
      },
      {
        groupId: "W-10",
        coordinator: "Theo Park",
        duties: [{ activity: "First aid", hours: "3" }],
      },
    ]);
    return {
      model: r.model,
      download: out.path,
      mobile: await mobile("readiness-volunteers-mobile", "#results"),
    };
  });
  await scenario("readiness-irish-dates", async () => {
    await go("fix-excel-dates");
    await page
      .locator("#dates-input")
      .fill(
        "07/08/2027\n08/07/2027\nSeptember 2027\n09/2027\n2027-09\n29/02/2027\n29/02/2028\n   \n3 September 2027",
      );
    await page
      .locator("#date-context")
      .locator("xpath=ancestor::details[1]")
      .locator("summary")
      .click();
    await page
      .locator("#date-context")
      .fill(
        "Irish community event reimbursements: numeric slash dates use day/month/year. Keep month-only entries at month precision and do not invent a day.",
      );
    const r = await paid("#ask-jev"),
      out = await download("#download", "readiness-irish-dates"),
      rows = Papa.parse(out.text, { header: true, skipEmptyLines: true }).data;
    assert.equal(rows.length, 9);
    assert.deepEqual(
      rows.map((r) => r.normalized),
      [
        "2027-08-07",
        "2027-07-08",
        "2027-09",
        "2027-09",
        "2027-09",
        "",
        "2028-02-29",
        "",
        "2027-09-03",
      ],
    );
    assert.equal(rows[5].status, "invalid");
    assert.equal(rows[7].original, "   ");
    assert.equal(rows[7].status, "empty");
    return {
      model: r.model,
      download: out.path,
      mobile: await mobile("readiness-irish-dates-mobile", "#results"),
    };
  });
  for (const item of [
    {
      id: "readiness-entities-repeated",
      text: "Nora Ivers of Willow & Finch briefed Mateo Silva at Helix Grid. Nora Ivers later emailed the revised proposal.",
      expected: [
        "Nora Ivers",
        "Mateo Silva",
        "Nora Ivers",
        "Willow & Finch",
        "Helix Grid",
      ],
    },
    {
      id: "readiness-entities-distinct",
      text: "Nora Ivers and Mateo Silva met Quinn Duarte at Willow & Finch.",
      expected: ["Nora Ivers", "Mateo Silva", "Quinn Duarte", "Willow & Finch"],
    },
    {
      id: "readiness-entities-absent",
      text: "Please close the window and save the revised timetable.",
      expected: [],
    },
  ])
    await scenario(item.id, async () => {
      await go("entity-extractor");
      await page.locator("#source-text").fill(item.text);
      const r = await paid("#extra-ask");
      assert.deepEqual(
        r.plan.entities.map((e) => e.text).sort(),
        [...item.expected].sort(),
      );
      for (const e of r.plan.entities)
        assert.equal(item.text.slice(e.start, e.end), e.text);
      const out = await download("#extra-download", item.id);
      assert.deepEqual(JSON.parse(out.text), r.plan.entities);
      return {
        model: r.model,
        download: out.path,
        entities: r.plan.entities,
        mobile: await mobile(item.id + "-mobile", "#extra-results"),
      };
    });
  await scenario("readiness-eight-step-onboarding", async () => {
    await go("text-to-mermaid");
    await page
      .locator("#source-text")
      .fill(
        "Submit access request.\nDoes the manager approve?\nIf rejected, notify employee and stop.\nIf approved, create account.\nRequire password reset.\nSend onboarding link.\nRecord the access grant.\nFinish onboarding.",
      );
    await page.locator("#diagram-mode").selectOption("jev");
    await page
      .locator("#instructions")
      .fill(
        "Step 2 is the only decision. Its yes branch goes to step 4. Its no branch goes to step 3 and ends there. After step 4, continue to 5, 6, 7, 8 and stop. Step 1 leads to step 2. Do not connect the rejected branch to account creation.",
      );
    const r = await paid("#create-diagram"),
      g = r.plan.graph;
    assert.equal(g.nodes.length, 8);
    assert.equal(g.nodes[1].type, "decision");
    assert.equal(g.nodes[2].type, "terminal");
    assert.equal(g.nodes[7].type, "terminal");
    for (const i of [3, 4, 5, 6]) assert.equal(g.nodes[i].type, "process");
    for (const [from, to, label] of [
      ["n0", "n1", ""],
      ["n1", "n3", "yes"],
      ["n1", "n2", "no"],
      ["n3", "n4", ""],
      ["n4", "n5", ""],
      ["n5", "n6", ""],
      ["n6", "n7", ""],
    ])
      assert.ok(
        g.edges.some(
          (e) => e.from === from && e.to === to && (e.label || "") === label,
        ),
        JSON.stringify({ from, to, label, edges: g.edges }),
      );
    assert.ok(!g.edges.some((e) => e.from === "n2"));
    assert.deepEqual(r.plan.reviewIssues, []);
    await expect(page.locator("#extra-visual iframe")).toBeVisible({
      timeout: 25000,
    });
    const svg = await download(
        "#extra-visual button",
        "readiness-onboarding-svg",
      ),
      out = await download("#extra-download", "readiness-onboarding-mermaid");
    assert.match(svg.text, /<svg[\s>]/);
    return {
      model: r.model,
      graph: g,
      svg: svg.path,
      mermaid: out.path,
      mobile: await mobile("readiness-onboarding-mobile", "#extra-results"),
    };
  });
  await scenario("readiness-rfc-public-reader", async () => {
    await go("ask-a-webpage");
    await page.locator("#url-tab").click();
    const url = "https://www.rfc-editor.org/rfc/rfc2606.html",
      question =
        "Which second-level domain names does this document reserve for use as examples?";
    await page.locator("#page-url").fill(url);
    await page.locator("#instructions").fill(question);
    const begin = responses.length,
      r = await paid("#extra-ask");
    const source = responses
      .slice(begin)
      .find((r) => r.url.endsWith("/read-page"));
    assert.equal(source.status, 200);
    assert.equal(r.plan.status, "answered");
    const text = r.plan.excerpts.map((e) => e.text).join("\n");
    for (const domain of ["example.com", "example.net", "example.org"])
      assert.ok(text.includes(domain));
    for (const e of r.plan.excerpts)
      assert.equal(source.body.text.slice(e.start, e.end), e.text);
    const out = await download("#extra-download", "readiness-rfc-evidence"),
      exported = JSON.parse(out.text),
      strings = leaves(exported);
    assert.ok(strings.includes(question));
    assert.ok(strings.includes(source.body.text));
    assert.ok(strings.includes(url));
    return {
      model: r.model,
      download: out.path,
      mobile: await mobile("readiness-rfc-mobile", "#extra-results"),
    };
  });
  await scenario("readiness-three-city-meeting", async () => {
    await go("meeting-time-finder");
    await page.locator("#add-person").click();
    await page.locator("#availability-mode").selectOption("jev");
    for (const [id, value] of Object.entries({
      "meeting-date": "2027-02-17",
      duration: "30",
      "p0-zone": "Lisbon",
      "p0-name": "Noor",
      "p0-text": "Available from 2 pm until 5 pm, except from 3 pm to 3:30 pm.",
      "p1-zone": "Toronto",
      "p1-name": "Cal",
      "p1-text":
        "Available from 9 am until noon, except from 10 am to 10:30 am.",
      "p2-zone": "Helsinki",
      "p2-name": "Iris",
      "p2-text": "Available from 4 pm until 7 pm, except from 5 pm to 5:30 pm.",
    })) {
      if (id.endsWith("-name"))
        await page
          .locator("#" + id)
          .locator("xpath=ancestor::details[1]")
          .locator("summary")
          .click();
      await page.locator("#" + id).fill(value);
    }
    const r = await paid("#run");
    assert.equal(r.plan.participants.length, 3);
    await expect(page.locator("#results")).toContainText("Helsinki");
    await page.locator("#slot-choice").selectOption("3");
    const out = await download(
      "#result-view > button",
      "readiness-three-city-calendar",
    );
    assert.match(out.text, /DTSTART:20270217T153000Z/);
    assert.match(out.text, /DTEND:20270217T160000Z/);
    return {
      model: r.model,
      download: out.path,
      mobile: await mobile("readiness-three-city-mobile", "#results"),
    };
  });
} finally {
  await persist();
  await browser.close();
}
const failed = records.filter((r) => r.status === "failed");
console.log(
  JSON.stringify({
    dir,
    origin,
    total: records.length,
    passed: records.length - failed.length,
    failed: failed.map((r) => r.id),
    consoleErrors,
  }),
);
if (
  failed.length ||
  !records.length ||
  (process.env.UX_ONLY &&
    records.length !== new Set(process.env.UX_ONLY.split(",")).size)
)
  process.exitCode = 1;
