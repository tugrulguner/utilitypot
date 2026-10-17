import {
  exampleInterpretation,
  answeredSource,
  fixturePlan,
  approvalGraph,
} from "./workflow-fixtures.mjs";
import { fulfillEntityDocumentFixture } from "./helpers/entity-document-fixture.mjs";
import { test, expect } from "@playwright/test";
import { gunzipSync } from "node:zlib";
test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
});

const token = "phc_qXkp5FBQfrqHQwkqf3ys8iSoGoMYw2tpTHXGugXJhP8V";
const tools = [
  ["csv-to-nested-json", "manual"],
  ["fix-excel-dates", "manual"],
  ["meeting-time-finder", "manual"],
  ["json-to-csv", "manual"],
  ["entity-extractor", "manual"],
  ["text-to-mermaid", "manual"],
  ["ask-a-webpage", "read_page"],
];

async function installSink(context, page) {
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "webdriver", {
      configurable: true,
      get: () => false,
    });
    const brands = [
      { brand: "Chromium", version: "130" },
      { brand: "Google Chrome", version: "130" },
    ];
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: {
        brands,
        mobile: false,
        platform: "macOS",
        getHighEntropyValues: async () => ({
          brands,
          mobile: false,
          platform: "macOS",
        }),
      },
    });
  });
  const posts = [];
  await context.route("**/*posthog.com/**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      let body = request.postDataBuffer() ?? Buffer.alloc(0);
      if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body);
      posts.push({ url: request.url(), body: body.toString("utf8") });
      await fulfillEntityDocumentFixture(route, { status: 200, body: "{}" });
    } else await route.continue();
  });
  await page.addInitScript(
    ({ token }) => {
      const key = `ph_${token}_posthog`;
      localStorage.setItem(
        key,
        JSON.stringify({
          distinct_id: "utilitypot-private-browser-fixture",
          $device_id: "utilitypot-private-browser-fixture",
          $initial_utm_source: "SENTINEL_PERSISTED_CAMPAIGN",
          $session_entry_gclid: "SENTINEL_PERSISTED_CLICK",
          $initial_referrer:
            "https://ref.example/private?secret=SENTINEL_REFERRER",
        }),
      );
      window.__persistedFixtureSeeded = localStorage
        .getItem(key)
        ?.includes("SENTINEL_PERSISTED_CAMPAIGN");
    },
    { token },
  );
  return posts;
}

function decodedEvents(posts) {
  const all = [];
  for (const post of posts) {
    if (!new URL(post.url).pathname.includes("/e/")) continue;
    try {
      const parsed = JSON.parse(post.body);
      all.push(
        ...(parsed.batch ?? (Array.isArray(parsed) ? parsed : [parsed])),
      );
    } catch {}
  }
  return all;
}

test("real CDN SDK emits sanitized pageview and bounded manual action events", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  const posts = await installSink(context, page);
  await page.goto(
    `${baseURL}/tools/fix-excel-dates/?utm_source=URL_SENTINEL#HASH_SENTINEL`,
  );
  await page.waitForFunction(() => window.posthog?.__loaded);
  await expect
    .poll(() => decodedEvents(posts).some((e) => e.event === "$pageview"), {
      timeout: 15000,
    })
    .toBeTruthy();
  expect(await page.evaluate(() => window.__persistedFixtureSeeded)).toBe(true);
  expect(await page.evaluate(() => window.posthog.config.persistence)).toBe(
    "localStorage",
  );
  await expect
    .poll(() => decodedEvents(posts).some((e) => e.event === "$pageview"), {
      timeout: 15000,
    })
    .toBeTruthy();
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page.getByRole("button", { name: "Fix dates" }).click();
  await page.getByRole("button", { name: "Download result" }).click();
  await expect
    .poll(
      () =>
        decodedEvents(posts).filter(
          (e) => e.event === "utility_action_completed",
        ).length,
      { timeout: 15000 },
    )
    .toBe(1);
  const events = decodedEvents(posts);
  expect(
    events.some(
      (e) =>
        e.event === "$pageview" &&
        e.properties?.$current_url === `${baseURL}/tools/fix-excel-dates/`,
    ),
  ).toBeTruthy();
  expect(
    events.some(
      (e) =>
        e.event === "utility_action_started" &&
        e.properties?.tool === "fix_excel_dates" &&
        e.properties?.action === "manual_run",
    ),
  ).toBeTruthy();
  expect(
    events.some(
      (e) =>
        e.event === "utility_action_completed" &&
        e.properties?.tool === "fix_excel_dates" &&
        e.properties?.outcome === "success",
    ),
  ).toBeTruthy();
  expect(
    events.some(
      (e) =>
        e.event === "utility_output_download_requested" &&
        e.properties?.tool === "fix_excel_dates",
    ),
  ).toBeTruthy();
  const envelope = JSON.stringify(events);
  const allRequestBodies = JSON.stringify(posts);
  for (const sentinel of [
    "URL_SENTINEL",
    "HASH_SENTINEL",
    "SENTINEL_PERSISTED_CAMPAIGN",
    "SENTINEL_PERSISTED_CLICK",
    "SENTINEL_REFERRER",
  ]) {
    expect(envelope).not.toContain(sentinel);
    expect(allRequestBodies).not.toContain(sentinel);
  }
  const cfg = await page.evaluate(() => ({
    config: window.posthog.config,
    capturing: window.posthog.is_capturing(),
    optOut: window.posthog.has_opted_out_capturing(),
  }));
  expect(cfg.config.capture_pageview).toBe(true);
  expect(cfg.config.capture_pageleave).toBe(true);
  expect(cfg.config.disable_session_recording).toBe(true);
  expect(cfg.config.autocapture).toBe(false);
  expect(cfg.capturing).toBe(true);
  await context.close();
});

test("all seven tool handlers emit no initial example action and bounded completion on use", async ({
  browser,
  baseURL,
}) => {
  for (const [slug, action] of tools) {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    const posts = await installSink(context, page);
    await page.goto(`${baseURL}/tools/${slug}/`);
    await page
      .locator("details")
      .evaluateAll((es) => es.forEach((e) => (e.open = true)));
    await page.waitForFunction(() => window.posthog?.__loaded);
    await page.getByRole("button", { name: /^Load example:/ }).click();
    const beforeRun = decodedEvents(posts);
    expect(beforeRun.some((e) => e.event === "utility_action_started")).toBe(
      false,
    );
    if (action === "manual" && slug === "csv-to-nested-json") {
      await page.getByRole("button", { name: "Create nested JSON" }).click();
    } else if (action === "manual" && slug === "fix-excel-dates") {
      await page.getByRole("button", { name: "Fix dates" }).click();
    } else if (action === "manual" && slug === "meeting-time-finder") {
      await page.getByRole("button", { name: "Find times" }).click();
    } else if (action === "manual" && slug === "json-to-csv") {
      await expect(page.locator("#row-path")).toHaveValue("orders");
      await page.getByRole("button", { name: "Convert", exact: true }).click();
    } else if (action === "manual" && slug === "entity-extractor") {
      await exampleInterpretation(page, slug);
    } else if (action === "manual" && slug === "text-to-mermaid") {
      await exampleInterpretation(page, slug);
    } else {
      await page.route("**/api/utilities/read-page", (route) =>
        fulfillEntityDocumentFixture(route, {
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            text: "Fixture documentation text.",
            url: "https://docs.python.org/3/",
            truncated: false,
          }),
        }),
      );
      await page.route("**/api/utilities/interpret", (route) =>
        fulfillEntityDocumentFixture(route, {
          json: {
            source: "jev",
            model: "fixture",
            plan: { status: "not-answered", excerpts: [] },
            confidence: {},
          },
        }),
      );
      await page.getByRole("tab", { name: "Public URL", exact: true }).click();
      await page.locator("#page-url").fill("https://docs.python.org/3/");
      await page.locator("#extra-ask").click();
      await expect(page.locator("#source-text")).toHaveValue(
        "Fixture documentation text.",
      );
    }
    await expect
      .poll(
        () =>
          decodedEvents(posts).filter(
            (e) => e.event === "utility_action_completed",
          ).length,
        { timeout: 15000 },
      )
      .toBe(action === "read_page" ? 2 : 1);
    const events = decodedEvents(posts);
    expect(
      events.filter((e) => e.event === "utility_action_started"),
    ).toHaveLength(action === "read_page" ? 2 : 1);
    expect(
      events.filter(
        (e) =>
          e.event === "utility_action_completed" &&
          e.properties?.outcome === "success",
      ),
      slug,
    ).toHaveLength(action === "read_page" ? 2 : 1);
    for (const event of events.filter((e) =>
      e.event.startsWith("utility_action_"),
    )) {
      expect(event.properties).toMatchObject({
        tool: slug.replaceAll("-", "_"),
      });
      expect(JSON.stringify(events)).not.toMatch(
        /URL_SENTINEL|HASH_SENTINEL|SENTINEL|Fixture documentation/,
      );
      const appProps = Object.fromEntries(
        Object.entries(event.properties).filter(([key]) =>
          ["tool", "action", "attempt_id", "outcome"].includes(key),
        ),
      );
      const expectedKeys =
        event.event === "utility_action_started"
          ? ["action", "attempt_id", "tool"]
          : ["action", "attempt_id", "outcome", "tool"];
      expect(Object.keys(appProps).sort()).toEqual(expectedKeys.sort());
      expect(JSON.stringify(appProps)).not.toMatch(
        /Ada|Acme|Fixture documentation|SENTINEL/,
      );
    }
    await context.close();
  }
});

test("manual validation and presentation failures classify distinctly across utility families", async ({
  browser,
  baseURL,
}) => {
  for (const fixture of [
    {
      slug: "fix-excel-dates",
      run: async (p) => {
        await p.getByRole("button", { name: /^Load example:/ }).click();
        await p.getByRole("button", { name: "Fix dates" }).click();
      },
      failPresentation: async (p) =>
        p.evaluate(() => {
          const view = document.querySelector("#result-view");
          view.replaceChildren = () => {
            throw new Error("render failed");
          };
        }),
    },
    {
      slug: "json-to-csv",
      run: async (p) => {
        await p.getByRole("button", { name: /^Load example:/ }).click();
        await p.locator("#extra-run").click();
      },
      failPresentation: async (p) =>
        p.evaluate(() => {
          document.querySelector("#extra-visual").append = () => {
            throw new Error("render failed");
          };
        }),
    },
  ]) {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    const posts = await installSink(context, page);
    await page.goto(`${baseURL}/tools/${fixture.slug}/`);
    await page.waitForFunction(() => window.posthog?.__loaded);
    await fixture.failPresentation(page);
    await fixture.run(page);
    await expect
      .poll(() =>
        decodedEvents(posts)
          .filter((e) => e.event === "utility_action_completed")
          .map((e) => e.properties.outcome),
      )
      .toEqual(["unexpected_failure"]);
    await page.evaluate(() => {
      const view = document.querySelector("#result-view");
      if (view) delete view.replaceChildren;
      const extra = document.querySelector("#extra-visual");
      if (extra) delete extra.append;
    });
    await fixture.run(page);
    await expect
      .poll(() =>
        decodedEvents(posts)
          .filter((e) => e.event === "utility_action_completed")
          .map((e) => e.properties.outcome),
      )
      .toEqual(["unexpected_failure", "success"]);
    const completions = decodedEvents(posts).filter(
      (e) => e.event === "utility_action_completed",
    );
    expect(completions[0].properties.attempt_id).not.toBe(
      completions[1].properties.attempt_id,
    );
    for (const e of completions)
      expect(
        decodedEvents(posts).filter(
          (s) =>
            s.event === "utility_action_started" &&
            s.properties.attempt_id === e.properties.attempt_id,
        ),
      ).toHaveLength(1);
    await context.close();
  }
});

test("invalid manual input is rejected and a valid retry succeeds with a distinct attempt", async ({
  page,
  context,
}) => {
  const posts = await installSink(context, page);
  for (const slug of ["meeting-time-finder", "json-to-csv"]) {
    await page.goto(`/tools/${slug}/`);
    await page
      .locator("details")
      .evaluateAll((es) => es.forEach((e) => (e.open = true)));
    await page.waitForFunction(() => window.posthog?.__loaded);
    await page.getByRole("button", { name: /^Load example:/ }).click();
    const meeting = slug === "meeting-time-finder";
    if (meeting) await page.locator("#duration").fill("0");
    else {
      await page
        .locator("details")
        .evaluateAll((es) => es.forEach((e) => (e.open = true)));
      await page.locator("#source-text").fill("{INVALID_PRIVATE_SENTINEL");
    }
    const before = decodedEvents(posts).filter(
      (e) => e.event === "utility_action_completed",
    ).length;
    await page.locator(meeting ? "#run" : "#extra-run").click();
    await expect
      .poll(() =>
        decodedEvents(posts)
          .filter((e) => e.event === "utility_action_completed")
          .slice(before)
          .map((e) => e.properties.outcome),
      )
      .toEqual(["rejected"]);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /^Load example:/ }).click();
    await page.locator(meeting ? "#run" : "#extra-run").click();
    await expect
      .poll(() =>
        decodedEvents(posts)
          .filter((e) => e.event === "utility_action_completed")
          .slice(before)
          .map((e) => e.properties.outcome),
      )
      .toEqual(["rejected", "success"]);
    const outcomes = decodedEvents(posts)
      .filter((e) => e.event === "utility_action_completed")
      .slice(before);
    expect(outcomes[0].properties.attempt_id).not.toBe(
      outcomes[1].properties.attempt_id,
    );
    for (const e of outcomes)
      expect(
        decodedEvents(posts).filter(
          (s) =>
            s.event === "utility_action_started" &&
            s.properties.attempt_id === e.properties.attempt_id,
        ),
      ).toHaveLength(1);
  }
  expect(JSON.stringify(decodedEvents(posts))).not.toContain(
    "INVALID_PRIVATE_SENTINEL",
  );
});

test("edited inputs cancel stale AI completions without presenting success", async ({
  page,
  context,
}) => {
  const posts = await installSink(context, page);
  for (const slug of ["ask-a-webpage", "entity-extractor"]) {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await context.route("**/api/utilities/interpret", async (route) => {
      await gate;
      await fulfillEntityDocumentFixture(route, {
        contentType: "application/json",
        body: JSON.stringify({
          source: "jev",
          plan:
            route.request().postDataJSON().tool === "qa"
              ? { status: "not-answered", excerpts: [] }
              : { entities: [] },
          confidence: {},
          model: "fixture",
        }),
      });
    });
    await page.goto(`/tools/${slug}/`);
    await page
      .locator("details")
      .evaluateAll((es) => es.forEach((e) => (e.open = true)));
    await page.waitForFunction(() => window.posthog?.__loaded);
    await page.getByRole("button", { name: /^Load example:/ }).click();
    const before = decodedEvents(posts).filter(
      (e) => e.event === "utility_action_completed",
    ).length;
    const request = page.waitForRequest("**/api/utilities/interpret");
    await page
      .locator("details")
      .evaluateAll((es) => es.forEach((e) => (e.open = true)));
    await page.locator("#extra-ask").click();
    await request;
    await page.locator("#source-text").fill("EDITED_PRIVATE_SENTINEL");
    release();
    await expect
      .poll(() =>
        decodedEvents(posts)
          .filter((e) => e.event === "utility_action_completed")
          .slice(before)
          .map((e) => e.properties.outcome),
      )
      .toEqual(["cancelled"]);
    await expect(page.locator("#extra-results")).toBeHidden();
    await context.unroute("**/api/utilities/interpret");
  }
  expect(JSON.stringify(decodedEvents(posts))).not.toContain(
    "EDITED_PRIVATE_SENTINEL",
  );
});

test("a pending diagram render cannot report success after its source changes", async ({
  page,
  context,
}) => {
  const posts = await installSink(context, page);
  let release, requested;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const pending = new Promise((resolve) => {
    requested = resolve;
  });
  await context.route("**/mermaid.core.*.js", async (route) => {
    requested();
    await gate;
    await route.continue();
  });
  await fixturePlan(page, { graph: approvalGraph });
  await page.goto("/tools/text-to-mermaid/");
  await page.waitForFunction(() => window.posthog?.__loaded);
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page.locator("#create-diagram").click();
  await pending;
  await page.locator("#source-text").fill("STALE_DIAGRAM_PRIVATE_SENTINEL");
  release();
  await expect
    .poll(() =>
      decodedEvents(posts)
        .filter((e) => e.event === "utility_action_completed")
        .map((e) => e.properties.outcome),
    )
    .toEqual(["cancelled"]);
  await expect(page.locator("#extra-results")).toBeHidden();
  expect(JSON.stringify(decodedEvents(posts))).not.toContain(
    "STALE_DIAGRAM_PRIVATE_SENTINEL",
  );
});

test("calendar, SVG, and result download intents are attributed exactly once", async ({
  page,
  context,
}) => {
  const posts = await installSink(context, page);
  for (const [slug, specialized, action] of [
    ["meeting-time-finder", "Add to calendar", "calendar_download"],
    ["text-to-mermaid", "Download SVG", "svg_download"],
  ]) {
    const before = decodedEvents(posts).filter(
      (e) => e.event === "utility_output_download_requested",
    ).length;
    await page.goto(`/tools/${slug}/`);
    await page
      .locator("details")
      .evaluateAll((es) => es.forEach((e) => (e.open = true)));
    await page.waitForFunction(() => window.posthog?.__loaded);
    await page.getByRole("button", { name: /^Load example:/ }).click();
    const meeting = slug === "meeting-time-finder";
    if (meeting) await page.locator("#run").click();
    else await exampleInterpretation(page, slug);
    for (const name of [specialized, "Download result"]) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name, exact: true }).click();
      await download;
    }
    await expect
      .poll(() =>
        decodedEvents(posts)
          .filter((e) => e.event === "utility_output_download_requested")
          .slice(before)
          .map((e) => ({
            tool: e.properties.tool,
            action: e.properties.action,
          })),
      )
      .toEqual([
        { tool: slug.replaceAll("-", "_"), action },
        { tool: slug.replaceAll("-", "_"), action: "download_result" },
      ]);
  }
});

test("copy success includes its bounded tool dimension", async ({
  page,
  context,
}) => {
  await installSink(context, page);
  await page.goto("/tools/fix-excel-dates/");
  await page
    .locator("details")
    .evaluateAll((es) => es.forEach((e) => (e.open = true)));
  await page.waitForFunction(() => window.posthog?.__loaded);
  await page.evaluate(() => {
    window.__captured = [];
    window.posthog.capture = (event, properties) =>
      window.__captured.push({ event, properties });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {} },
    });
  });
  await page.getByRole("button", { name: /^Load example:/ }).click();
  await page.getByRole("button", { name: "Fix dates" }).click();
  await page.getByRole("button", { name: "Copy result", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__captured.find(
            (e) => e.event === "utility_output_copy_succeeded",
          )?.properties,
      ),
    )
    .toEqual({ tool: "fix_excel_dates", action: "copy_result" });
});

test("a throwing analytics capture cannot block a local operation or its presented result", async ({
  page,
  context,
}) => {
  await installSink(context, page);
  for (const slug of ["fix-excel-dates", "json-to-csv"]) {
    await page.goto(`/tools/${slug}/`);
    await page
      .locator("details")
      .evaluateAll((es) => es.forEach((e) => (e.open = true)));
    await page.waitForFunction(() => window.posthog?.__loaded);
    await page.evaluate(() => {
      window.posthog.capture = () => {
        throw new Error("CAPTURE_THROW_SENTINEL");
      };
    });
    await page.getByRole("button", { name: /^Load example:/ }).click();
    await page
      .locator(slug === "fix-excel-dates" ? "#run" : "#extra-run")
      .click();
    await expect(
      page.locator(slug === "fix-excel-dates" ? "#results" : "#extra-results"),
    ).toBeVisible();
    if (slug === "fix-excel-dates")
      await expect(page.locator("#result-view table tbody tr")).toHaveCount(5);
    else await expect(page.locator("#extra-visual tr")).toHaveCount(3);
  }
});

test("AI request completion distinguishes presented success, client rejection, and service failure", async ({
  browser,
  baseURL,
}) => {
  for (const fixture of [
    {
      status: 200,
      body: {
        source: "jev",
        plan: { convention: "day-first" },
        confidence: { convention: 0.9 },
        model: "fixture",
      },
      outcome: "success",
    },
    {
      status: 422,
      body: { error: "PRIVATE_ERROR_SENTINEL" },
      outcome: "rejected",
    },
    {
      status: 503,
      body: { error: "PRIVATE_ERROR_SENTINEL" },
      outcome: "unexpected_failure",
    },
  ]) {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    const posts = await installSink(context, page);
    await context.route("**/api/utilities/interpret", (route) =>
      fulfillEntityDocumentFixture(route, {
        status: fixture.status,
        contentType: "application/json",
        body: JSON.stringify(
          fixture.outcome === "success"
            ? {
                ...fixture.body,
                plan: answeredSource(route.request().postDataJSON().input.text),
                confidence: { answerability: 0.9, passage: 0.9 },
              }
            : fixture.body,
        ),
      }),
    );
    await page.goto(`${baseURL}/tools/ask-a-webpage/`);
    await page
      .locator("details")
      .evaluateAll((es) => es.forEach((e) => (e.open = true)));
    await page.waitForFunction(() => window.posthog?.__loaded);
    await page.getByRole("button", { name: /^Load example:/ }).click();
    await page.getByRole("button", { name: "Find answer" }).click();
    await expect
      .poll(
        () =>
          decodedEvents(posts).filter(
            (e) => e.event === "utility_action_completed",
          ).length,
        { timeout: 15000 },
      )
      .toBe(1);
    if (fixture.outcome === "success")
      await expect(
        page.locator("#extra-visual [data-evidence-outcome]"),
      ).toContainText("Answer found in the source.");
    const events = decodedEvents(posts);
    const started = events.find((e) => e.event === "utility_action_started");
    const completed = events.find(
      (e) => e.event === "utility_action_completed",
    );
    expect(started.properties).toMatchObject({
      tool: "ask_a_webpage",
      action: "ai_interpretation",
    });
    expect(completed.properties).toMatchObject({
      tool: "ask_a_webpage",
      action: "ai_interpretation",
      outcome: fixture.outcome,
      attempt_id: started.properties.attempt_id,
    });
    expect(JSON.stringify(events)).not.toContain("PRIVATE_ERROR_SENTINEL");
    await context.close();
  }
});
