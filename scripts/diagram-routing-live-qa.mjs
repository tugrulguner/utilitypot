import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
const origin = process.env.UX_ORIGIN,
  dir = process.env.UX_RESULTS_DIR;
assert.match(
  origin || "",
  /^https:\/\/(?:[a-f0-9]{8}-utilitypot-site\.tugrul-gunr\.workers\.dev|utilitypot\.modepot\.io)$/,
);
assert.ok(dir);
await mkdir(dir, { recursive: true });
const onboarding = {
  text: "Submit access request.\nDoes the manager approve?\nIf rejected, notify employee and stop.\nIf approved, create account.\nRequire password reset.\nSend onboarding link.\nRecord the access grant.\nFinish onboarding.",
  instructions:
    "Step 2 is the only decision. Its yes branch goes to step 4. Its no branch goes to step 3 and ends there. After step 4, continue to 5, 6, 7, 8 and stop. Step 1 leads to step 2. Do not connect the rejected branch to account creation.",
  edges: [
    [0, 1, ""],
    [1, 3, "yes"],
    [1, 2, "no"],
    [3, 4, ""],
    [4, 5, ""],
    [5, 6, ""],
    [6, 7, ""],
  ],
  roles: { 1: "decision", 2: "terminal", 7: "terminal" },
};
// The repeated original is predeclared before execution; every result counts.
// It is a fixed stability check, not retry-until-success.
const cases = [
  { id: "original-onboarding", ...onboarding },
  {
    id: "stock-branch-control",
    text: "Receive order\nStock available?\nShip item\nNotify backorder",
    instructions:
      "Receive the order, then decide whether stock is available. If yes ship the item. If no notify backorder. Both outcomes end the flow; do not connect them to each other.",
    edges: [
      [0, 1, ""],
      [1, 2, "yes"],
      [1, 3, "no"],
    ],
    roles: { 1: "decision", 2: "terminal", 3: "terminal" },
  },
  {
    id: "start-end-control",
    text: "Start.\nSend the welcome email.\nEnd.",
    instructions: "Start then send the welcome email then end. No branches.",
    edges: [
      [0, 1, ""],
      [1, 2, ""],
    ],
    roles: { 0: "terminal", 1: "process", 2: "terminal" },
  },
  {
    id: "fresh-triage",
    text: "Receive ticket.\nIs the request urgent?\nPut the ticket in the queue.\nPage the on-call engineer.\nFinish triage.",
    instructions:
      "Step 1 leads to step 2, the only decision. Its yes branch goes to step 4 and its no branch goes to step 3. Steps 3 and 4 both lead to step 5, which ends the process.",
    edges: [
      [0, 1, ""],
      [1, 3, "yes"],
      [1, 2, "no"],
      [2, 4, ""],
      [3, 4, ""],
    ],
    roles: { 1: "decision", 4: "terminal" },
  },
  {
    id: "fresh-reordered-grant",
    text: "Receive access request.\nIs access approved?\nIf rejected, record denial and stop.\nNotify the requester.\nRecord the access grant.\nProvision the account.\nFinish onboarding.",
    instructions:
      "Step 1 leads to step 2, the only decision. Its yes branch goes to step 6, not step 4. Its no branch goes to step 3 and ends there. After step 6 go to step 4, then step 5, then step 7 and stop.",
    edges: [
      [0, 1, ""],
      [1, 5, "yes"],
      [1, 2, "no"],
      [3, 4, ""],
      [4, 6, ""],
      [5, 3, ""],
    ],
    roles: { 1: "decision", 2: "terminal", 6: "terminal" },
  },
  { id: "predeclared-onboarding-repeat", ...onboarding },
];
const browser = await chromium.launch(),
  page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
const records = [],
  responses = [],
  consoleErrors = [],
  setup = { navigationAttempts: [], assetAttempts: [], localReadiness: [] };
let lastPaid = 0;
const apiRequests = [];
page.on("request", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/")) apiRequests.push(r.url());
});
page.on("pageerror", (e) =>
  consoleErrors.push({ type: "pageerror", message: e.message }),
);
page.on("console", (e) => {
  if (e.type() === "error")
    consoleErrors.push({ type: "console", message: e.text() });
});
async function persist() {
  await writeFile(
    join(dir, "results.json"),
    JSON.stringify(
      {
        origin,
        method:
          "Real hosted browser controls; fixed six-case protocol; no request mocks or inference retries",
        setup,
        records,
        responses,
        consoleErrors,
      },
      null,
      2,
    ),
  );
}
async function go(slug = "text-to-mermaid") {
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = await page.goto(
      origin +
        "/tools/" +
        slug +
        "/" +
        (attempt ? "?routing-readiness=" + Date.now() : ""),
      { waitUntil: "networkidle" },
    );
    if (r.status() === 200) {
      await expect(
        page.locator("#create-diagram,#extra-run,#run").first(),
      ).toBeEnabled();
      return;
    }
    const body = await page.locator("body").innerText();
    setup.navigationAttempts.push({
      attempt,
      status: r.status(),
      body: body.slice(0, 300),
    });
    await persist();
    if (r.status() !== 404 || !body.includes("There is nothing here yet"))
      throw Error("Unexpected navigation response " + r.status());
    await page.waitForTimeout(3000);
  }
  throw Error("Route never became ready");
}
async function download(selector, name) {
  const p = page.waitForEvent("download");
  await page.locator(selector).click();
  const d = await p,
    path = join(dir, name + "-" + d.suggestedFilename());
  await d.saveAs(path);
  return { path, text: await readFile(path, "utf8") };
}
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
  assert.equal(apiRequests.length, 0, "Readiness must not call the API");
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
  await go();
  await page.locator("#source-text").fill("Start.\nDo the work.\nEnd.");
  await page.locator("#create-diagram").click();
  await expect(page.locator("#extra-visual iframe")).toBeVisible({
    timeout: 25000,
  });
  setup.localRenderer =
    "Private sequential graph rendered before any paid action";
  await persist();
  for (const item of cases) {
    const row = {
      id: item.id,
      input: { text: item.text, instructions: item.instructions },
      expectedEdges: item.edges,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    try {
      await go();
      await page.locator("#source-text").fill(item.text);
      await page.locator("#diagram-mode").selectOption("jev");
      await page.locator("#instructions").fill(item.instructions);
      await page.waitForTimeout(Math.max(0, 13500 - (Date.now() - lastPaid)));
      const response = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/utilities/interpret",
        { timeout: 50000 },
      );
      lastPaid = Date.now();
      await page.locator("#create-diagram").click();
      const r = await response,
        body = await r.json();
      responses.push({ id: item.id, status: r.status(), body });
      assert.equal(r.status(), 200, JSON.stringify(body));
      assert.equal(body.source, "jev");
      row.model = body.model;
      const graph = body.plan.graph;
      assert.deepEqual(
        graph.nodes.map((n) => n.label),
        item.text.split("\n"),
      );
      assert.deepEqual(
        graph.nodes.map((n) => n.id),
        graph.nodes.map((_, i) => `n${i}`),
      );
      const actual = graph.edges.map((e) => [
        Number(e.from.slice(1)),
        Number(e.to.slice(1)),
        e.label || "",
      ]);
      assert.deepEqual(
        actual.map(JSON.stringify).sort(),
        item.edges.map(JSON.stringify).sort(),
      );
      for (const [i, role] of Object.entries(item.roles))
        assert.equal(graph.nodes[Number(i)].type, role);
      assert.deepEqual(body.plan.reviewIssues, []);
      await expect(page.locator("#extra-visual iframe")).toBeVisible({
        timeout: 25000,
      });
      const svg = await download("#extra-visual button", item.id),
        code = await download("#extra-download", item.id);
      assert.match(svg.text, /<svg[\s>]/);
      for (const [from, to, label] of item.edges)
        assert.ok(
          code.text.includes(
            `n${from} -->${label ? `|${label}| ` : " "}n${to}`,
          ),
        );
      row.downloads = { svg: svg.path, mermaid: code.path };
      await page.setViewportSize({ width: 390, height: 844 });
      const f = await page.locator("#extra-visual iframe").boundingBox(),
        s = await page
          .frameLocator("#extra-visual iframe")
          .locator("svg")
          .boundingBox();
      assert.ok(s.height <= f.height + 2);
      row.mobile = join(dir, item.id + "-mobile.png");
      await page.locator("#extra-results").scrollIntoViewIfNeeded();
      await page.screenshot({ path: row.mobile });
      row.status = "passed";
    } catch (e) {
      row.status = "failed";
      row.error = String(e.stack || e);
    } finally {
      await page.setViewportSize({ width: 1280, height: 900 });
      row.screenshot = join(dir, item.id + "-desktop.png");
      await page.screenshot({ path: row.screenshot });
      row.completedAt = new Date().toISOString();
      records.push(row);
      await persist();
      console.log(JSON.stringify(row));
    }
  }
} finally {
  await persist();
  await browser.close();
}
const failed = records.filter((r) => r.status !== "passed");
console.log(
  JSON.stringify({
    total: records.length,
    passed: records.length - failed.length,
    failed: failed.map((r) => r.id),
    consoleErrors,
  }),
);
if (records.length !== cases.length || failed.length) process.exitCode = 1;
