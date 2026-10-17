// Explicitly opt-in, billable candidate UI QA. Never retries inference.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const origin = process.env.NER_QA_ORIGIN;
assert.match(
  origin ?? "",
  /^http:\/\/127\.0\.0\.1:\d+$/,
  "Use an explicitly started loopback candidate server",
);
const upstream = "https://utilitypot.modepot.io";
const dir =
  process.env.NER_QA_EVIDENCE ??
  `test-results-live/ner-${new Date().toISOString().replace(/[:.]/g, "-")}`;
await mkdir(dir, { recursive: true });
const cases = [
  {
    id: "repeated",
    width: 1280,
    text: "Leila Moreno met Tomas Reed at Harbor Labs. Leila Moreno called Harbor Labs.",
    people: ["Leila Moreno", "Tomas Reed", "Leila Moreno"],
    orgs: ["Harbor Labs", "Harbor Labs"],
  },
  {
    id: "distinct",
    width: 1050,
    text: "Maya Chen at Quartz Labs met Elias Stone from Birch Systems.",
    people: ["Maya Chen", "Elias Stone"],
    orgs: ["Quartz Labs", "Birch Systems"],
  },
  {
    id: "absent-category",
    width: 390,
    text: "Rina Shah met Omar Vega. Rina Shah waved goodbye.",
    people: ["Rina Shah", "Omar Vega", "Rina Shah"],
    orgs: [],
  },
];
const browser = await chromium.launch();
const page = await browser.newPage({
  acceptDownloads: true,
  serviceWorkers: "block",
});
const ledger = {
  candidate: origin,
  backend: upstream,
  startedAt: new Date().toISOString(),
  cases: [],
  pageErrors: [],
};
let current,
  lastCall = 0;
page.on("pageerror", (e) => ledger.pageErrors.push(e.message));
await page.route(origin + "/api/utilities/interpret", async (route) => {
  const req = route.request();
  assert.equal(req.method(), "POST");
  current.paidActions++;
  const response = await page.request.post(
    upstream + "/api/utilities/interpret",
    {
      data: req.postDataBuffer(),
      headers: {
        "content-type": "application/json",
        origin: upstream,
        "user-agent": req.headers()["user-agent"],
      },
      timeout: 60000,
      failOnStatusCode: false,
    },
  );
  const body = await response.text();
  current.network.push({
    url: response.url(),
    status: response.status(),
    cfRay: response.headers()["cf-ray"],
    body: JSON.parse(body),
  });
  await route.fulfill({
    status: response.status(),
    headers: { "content-type": "application/json" },
    body,
  });
});
const save = () =>
  writeFile(dir + "/ledger.json", JSON.stringify(ledger, null, 2));
async function exportResult(name) {
  const event = page.waitForEvent("download");
  await page.locator("#extra-download").click();
  const download = await event;
  const path = dir + "/" + current.id + "-" + name + ".json";
  await download.saveAs(path);
  const bytes = await readFile(path);
  current.downloads.push({
    path,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    manualCorrection: name === "corrected",
  });
  return bytes.toString("utf8");
}
try {
  for (const item of cases) {
    current = {
      id: item.id,
      source: item.text,
      viewport: item.width,
      status: "running",
      paidActions: 0,
      network: [],
      downloads: [],
    };
    ledger.cases.push(current);
    await save();
    try {
      await page.setViewportSize({ width: item.width, height: 900 });
      await page.goto(origin + "/tools/entity-extractor/");
      await page
        .locator("#color-theme")
        .selectOption(item.id === "distinct" ? "light" : "dark");
      await page.locator("#source-text").fill(item.text);
      await new Promise((r) =>
        setTimeout(r, Math.max(0, 13500 - (Date.now() - lastCall))),
      );
      lastCall = Date.now();
      current.actionAt = new Date(lastCall).toISOString();
      const response = page.waitForResponse(
        (r) =>
          r.url() === origin + "/api/utilities/interpret" &&
          r.request().method() === "POST",
        { timeout: 65000 },
      );
      await page.locator("#extra-ask").click();
      await response;
      await expect(page.locator("#extra-ask")).toBeEnabled({ timeout: 65000 });
      assert.equal(current.paidActions, 1);
      assert.equal(current.network[0].status, 200);
      const body = current.network[0].body;
      assert.equal(body.source, "jev");
      assert.match(body.model, /^jev-/);
      current.needsReview = body.needsReview;
      const entities = body.plan.entities;
      assert(Array.isArray(entities));
      for (const e of entities)
        assert.equal(item.text.slice(e.start, e.end), e.text);
      for (const [type, expected] of [
        ["Person", item.people],
        ["Organization", item.orgs],
      ])
        assert.deepEqual(
          entities
            .filter((e) => e.type === type)
            .map((e) => e.text)
            .sort(),
          [...expected].sort(),
        );
      await expect(page.locator(".entity-workspace")).toBeVisible();
      assert.equal(
        await page.locator(".entity-document").textContent(),
        item.text,
      );
      const button = page.locator(".entity-occurrence").first();
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("mark.is-current").first()).toBeFocused();
      current.keyboardNavigation = true;
      assert.equal(
        await exportResult("original"),
        JSON.stringify(entities, null, 2),
      );
      await page
        .locator(".entity-workspace")
        .screenshot({ path: dir + "/" + item.id + "-workspace.png" });
      await page.screenshot({
        path: dir + "/" + item.id + "-page.png",
        fullPage: true,
      });
      if (item.id === "repeated") {
        await page.locator("#entity-review summary").click();
        await page
          .locator("#entity-editor")
          .getByRole("button", { name: /Remove mention/ })
          .last()
          .click();
        await page.locator("#extra-run").click();
        assert.equal(
          await exportResult("corrected"),
          JSON.stringify(entities.slice(0, -1), null, 2),
        );
        assert.equal(current.paidActions, 1);
        current.manualCorrection = true;
      }
      current.status = "passed";
    } catch (error) {
      current.status = "failed";
      current.error = error.message;
      await page
        .screenshot({
          path: dir + "/" + item.id + "-failed.png",
          fullPage: true,
        })
        .catch(() => {});
    }
    await save();
    console.log(current.id, current.status);
  }
  ledger.completedAt = new Date().toISOString();
  await save();
  assert.equal(ledger.cases.length, cases.length);
  assert(ledger.cases.every((c) => c.status === "passed"));
  assert.equal(ledger.pageErrors.length, 0);
  console.log("Real-provider evidence:", dir);
} finally {
  await save();
  await browser.close();
}
