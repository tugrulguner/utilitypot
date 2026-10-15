import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { liveTarget } from "./live-target.mjs";
const target = liveTarget(process.env.BASE_URL);
const base = target.origin;
const evidence = new URL(
  `../test-results-live/product-review-${new Date().toISOString().replaceAll(":", "-")}/`,
  import.meta.url,
);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
const cases = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const wait = () => new Promise((resolve) => setTimeout(resolve, 13000));
async function run(id, fn) {
  try {
    const detail = await fn();
    cases.push({ id, status: "passed", ...detail });
    console.log(JSON.stringify(cases.at(-1)));
  } catch (e) {
    cases.push({ id, status: "failed", error: e.stack });
    console.error(JSON.stringify(cases.at(-1)));
  }
}
async function download(button) {
  const pending = page.waitForEvent("download");
  await button.click();
  const file = await pending;
  return readFile(await file.path(), "utf8");
}
async function ask() {
  const pending = page.waitForResponse((r) =>
    r.url().endsWith("/api/utilities/interpret"),
  );
  await page.locator("#extra-ask").click();
  const response = await pending;
  const data = await response.json();
  assert.equal(response.fromServiceWorker(), false);
  if (target.mode.startsWith("local"))
    assert.equal(
      response.headers()["x-qa-real-upstream"],
      "https://utilitypot.modepot.io",
    );
  assert.equal(response.status(), 200, JSON.stringify(data));
  assert.equal(data.source, "jev");
  assert.match(data.model, /^jev-/);
  return data;
}
try {
  await run("meeting-cities-selected-calendar", async () => {
    await page.goto(base + "/tools/meeting-time-finder/");
    await page.locator("#meeting-date").fill("2026-11-03");
    for (const [i, city] of [
      [0, "London"],
      [1, "New York"],
    ]) {
      await page.locator(`#p${i}-zone`).fill(city);
      await page.locator(`#p${i}-start`).fill("09:00");
      await page.locator(`#p${i}-end`).fill("17:00");
    }
    await page.locator("#run").click();
    await page.locator("#slot-choice").selectOption("1");
    assert.equal(await page.locator("#results").isVisible(), true);
    const readable = await page.locator(".meeting-comparison").innerText();
    assert.match(readable, /London/);
    assert.match(readable, /New York/);
    assert.doesNotMatch(readable, /\d{4}-\d{2}-\d{2}T/);
    const calendar = await download(
      page.getByRole("button", { name: "Add to calendar", exact: true }),
    );
    assert.match(calendar, /DTSTART:20261103T141500Z/);
    assert.match(calendar, /DTEND:20261103T144500Z/);
    await writeFile(new URL("selected-meeting.ics", evidence), calendar);
    await page.screenshot({
      path: new URL("meeting-desktop.png", evidence).pathname,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: new URL("meeting-mobile.png", evidence).pathname,
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false);
    await page.setViewportSize({ width: 1280, height: 900 });
    return { readable, calendarSelectedSlot: 1 };
  });
  await run("single-object-nested-array-recovery", async () => {
    await page.goto(base + "/tools/json-to-csv/");
    await page
      .locator("#source-text")
      .fill('{"id":"001","name":"Ada","tags":["alpha"]}');
    await page.locator("#extra-run").click();
    await page.locator("#row-path").selectOption("$object");
    await page.locator("#extra-run").click();
    assert.match(await page.locator("#extra-status").innerText(), /tags/);
    await page.locator("#array-policy").selectOption("join");
    await page.locator("#extra-run").click();
    const csv = await download(
      page.getByRole("button", { name: "Download result", exact: true }),
    );
    assert.match(csv, /001,Ada/);
    assert.match(csv, /alpha/);
    await writeFile(new URL("one-row.csv", evidence), csv);
    return { csv };
  });
  await run("empty-date-recovery", async () => {
    await page.goto(base + "/tools/fix-excel-dates/");
    await page.locator("#dates-input").fill("\n  \n");
    await page.locator("#run").click();
    const status = await page.locator("#utility-status").innerText();
    assert.match(status, /date/i);
    assert.equal(await page.locator("#results").isHidden(), true);
    return { message: status };
  });
  for (const [id, text, count] of [
    [
      "entities-original-repeated",
      "Mina Patel joined Orion Labs. Noah Chen works at Cedar Systems. Mina Patel will meet Noah Chen.",
      5,
    ],
    ["entities-fresh-names", "Ada Lovelace met Alan Turing at Mosaic Labs.", 3],
    ["entities-none", "Rain fell overnight.", 0],
  ])
    await run(id, async () => {
      await wait();
      await page.goto(base + "/tools/entity-extractor/");
      await page.locator("#people-category").uncheck();
      await page.locator("#companies-category").uncheck();
      await page.locator("#custom-category").check();
      await page
        .locator("#instructions")
        .fill(
          "Person: a named human\nOrganization: a named company or employer",
        );
      await page.locator("#source-text").fill(text);
      const result = await ask();
      assert.equal(result.plan.entities.length, count, JSON.stringify(result));
      for (const entity of result.plan.entities)
        assert.equal(text.slice(entity.start, entity.end), entity.text);
      const sorted = [...result.plan.entities].sort(
        (a, b) => a.start - b.start,
      );
      for (let i = 1; i < sorted.length; i++)
        assert.ok(sorted[i].start >= sorted[i - 1].end);
      await page.screenshot({
        path: new URL(`${id}.png`, evidence).pathname,
        fullPage: true,
      });
      return { model: result.model, entities: result.plan.entities };
    });
  await run("real-mobile-answer-visible", async () => {
    await wait();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/tools/ask-a-webpage/");
    await page
      .locator("#source-text")
      .fill("The red kite is stored in locker seven.");
    await page.locator("#instructions").fill("Where is the red kite stored?");
    await page.evaluate(() => scrollTo(0, 0));
    const result = await ask();
    await page.waitForTimeout(500);
    const view = await page.locator("#extra-results").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        viewport: innerHeight,
        focused: document.activeElement === el,
      };
    });
    assert.ok(view.top >= 0 && view.top < view.viewport, JSON.stringify(view));
    assert.equal(view.focused, true);
    assert.match(
      await page.locator("#extra-visual").innerText(),
      /locker seven/,
    );
    await page.screenshot({
      path: new URL("mobile-answer-visible.png", evidence).pathname,
    });
    return { model: result.model, view };
  });
} finally {
  await browser.close();
  await writeFile(
    new URL("summary.json", evidence),
    JSON.stringify({ origin: base, cases, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      evidence: evidence.pathname,
      total: cases.length,
      passed: cases.filter((c) => c.status === "passed").length,
      failed: cases.filter((c) => c.status === "failed").map((c) => c.id),
      errors,
    }),
  );
}
assert.equal(cases.filter((c) => c.status === "failed").length, 0);
assert.deepEqual(errors, []);
