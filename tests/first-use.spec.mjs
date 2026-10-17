import {
  fixturePlan,
  approvalGraph,
  answeredSource,
} from "./workflow-fixtures.mjs";
import { test, expect } from "@playwright/test";
const tools = [
  ["csv-to-nested-json", "customers", "#csv-input", "#results"],
  ["json-to-csv", "orders", "#source-text", "#extra-results"],
  ["fix-excel-dates", "mixed dates", "#dates-input", "#results"],
  ["meeting-time-finder", "working hours", "#p0-zone", "#results"],
  ["entity-extractor", "repeated names", "#source-text", "#extra-results"],
  ["text-to-mermaid", "approval steps", "#source-text", "#extra-results"],
  ["ask-a-webpage", "privacy passage", "#source-text", "#extra-results"],
];
for (const [slug, label, input, result] of tools) {
  test(`${slug}: descriptive sample, no requests, explicit replacement`, async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/**", (route) => {
      calls++;
      return route.abort();
    });
    await page.goto(`/tools/${slug}/`);
    const button = page.locator("#load-example, #extra-example");
    await expect(button).toContainText(label);
    if (slug === "meeting-time-finder")
      await expect(page.locator("#example-outcome")).toBeHidden();
    else await expect(page.locator("#example-outcome")).toBeVisible();
    await button.click();
    await expect(page.locator("#example-outcome")).toBeVisible();
    await expect(page.locator(result)).toBeHidden();
    const sample = await page.locator(input).inputValue();
    expect(sample.length).toBeGreaterThan(0);
    await page.locator(input).fill("My own input");
    page.once("dialog", (dialog) => dialog.dismiss());
    await button.click();
    await expect(page.locator(input)).toHaveValue("My own input");
    page.once("dialog", (dialog) => dialog.accept());
    await button.click();
    await expect(page.locator(input)).toHaveValue(sample);
    expect(calls).toBe(0);
  });
}
test("CSV opens only first small group; code and large groups stay closed", async ({
  page,
}) => {
  await page.goto("/tools/csv-to-nested-json/");
  await expect(page.locator('label[for="group-by"]')).toHaveText(
    "Group rows by",
  );
  await page.locator("#load-example").click();
  await page.locator("#run").click();
  await expect(page.locator("#result-view > div > details[open]")).toHaveCount(
    1,
  );
  await expect(page.locator("#result-view > details")).not.toHaveAttribute(
    "open",
  );
  await page
    .locator("#csv-input")
    .fill(
      "Customer,Item\n" +
        Array.from({ length: 6 }, (_, i) => `A,${i}`).join("\n"),
    );
  await page.locator("#run").click();
  await expect(page.locator("#result-view details[open]")).toHaveCount(0);
});
test("JSON selected sample is bounded safe text and fresh data resets selection", async ({
  page,
}) => {
  await page.goto("/tools/json-to-csv/");
  await page.locator("#source-text").fill(
    JSON.stringify({
      people: [{ name: "<img src=x onerror=alert(1)>", tags: ["x"] }],
      orders: [{ id: "002" }],
    }),
  );
  await expect(page.locator("#row-path")).toHaveValue("");
  await page.locator("#row-path").selectOption("people");
  await expect(page.locator("#record-sample")).toContainText("<img");
  await expect(page.locator("#record-sample img")).toHaveCount(0);
  await expect(page.locator("#nested-array-help")).toContainText("tags");
  await expect(page.locator("#array-policy")).toHaveValue("reject");
  await page
    .locator("#source-text")
    .fill(JSON.stringify({ fresh: [{ text: "a".repeat(3000) }] }));
  await expect(page.locator("#row-path")).toHaveValue("fresh");
  expect(
    (await page.locator("#record-sample").textContent()).length,
  ).toBeLessThanOrEqual(1020);
});
test("mobile meetings hide optional names including cloned participants; sample date is local today", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/meeting-time-finder/");
  await expect(page.locator(".participant")).toHaveCount(2);
  await expect(page.locator("#p0-name")).toBeHidden();
  await page.locator(".participant-hours > summary").first().click();
  await expect(page.locator("#p0-name")).toBeVisible();
  await page.locator("#add-person").click();
  await expect(page.locator("#p2-name")).toBeHidden();
  page.once("dialog", (d) => d.accept());
  await page.locator("#load-example").click();
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await expect(page.locator("#meeting-date")).toHaveValue(today);
});
for (const [slug, auxiliary] of [
  ["csv-to-nested-json", "#child-name"],
  ["fix-excel-dates", "#date-convention"],
  ["meeting-time-finder", "#p0-start"],
  ["json-to-csv", "#array-policy"],
  ["entity-extractor", "#instructions"],
  ["text-to-mermaid", "#instructions"],
  ["ask-a-webpage", "#instructions"],
]) {
  test(`${slug}: auxiliary-only edits require confirmation`, async ({
    page,
  }) => {
    await page.goto(`/tools/${slug}/`);
    await page.locator(auxiliary).evaluate((el) => {
      el.value =
        el.type === "time"
          ? "10:00"
          : el.id === "date-convention"
            ? "day-first"
            : el.id === "array-policy"
              ? "join"
              : "My setting";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    let prompted = false;
    page.once("dialog", async (d) => {
      prompted = true;
      await d.dismiss();
    });
    await page.locator("#load-example, #extra-example").click();
    expect(prompted).toBe(true);
    await expect(page.locator(auxiliary)).toHaveValue(
      auxiliary === "#p0-start"
        ? "10:00"
        : auxiliary === "#date-convention"
          ? "day-first"
          : auxiliary === "#array-policy"
            ? "join"
            : "My setting",
    );
  });
}
test("cancel keeps result; accepted replacement clears it; fresh CSV transfers", async ({
  page,
}) => {
  await page.goto("/tools/csv-to-nested-json/");
  await page.locator("#load-example").click();
  await page.locator("#run").click();
  const result = await page.locator("#result-view").textContent();
  page.once("dialog", (d) => d.dismiss());
  await page.locator("#load-example").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#result-view")).toHaveText(result);
  page.once("dialog", (d) => d.accept());
  await page.locator("#load-example").click();
  await expect(page.locator("#results")).toBeHidden();
  await page.locator("#csv-input").fill("Team,Member\nBlue,Jo\nBlue,Sam");
  await page.locator("#run").click();
  await expect(page.locator("#result-view")).toContainText("Blue");
  await expect(page.locator("#result-view")).not.toContainText("Ada");
});
for (const accept of [false, true])
  test(`QA pending page read: ${accept ? "replace discards" : "cancel preserves"}`, async ({
    page,
  }) => {
    let release;
    const gate = new Promise((r) => (release = r));
    let reads = 0,
      interpretations = 0;
    await page.route("**/api/utilities/read-page", async (route) => {
      reads++;
      await gate;
      await route.fulfill({
        json: {
          text: "The source says hello.",
          url: "https://docs.python.org/3/",
          coverage: "Complete",
        },
      });
    });
    await page.route("**/api/utilities/interpret", async (route) => {
      interpretations++;
      await route.fulfill({
        json: {
          source: "jev",
          plan: {
            status: "answered",
            excerpts: [{ text: "The source says hello.", start: 0, end: 22 }],
          },
          confidence: {},
        },
      });
    });
    await page.goto("/tools/ask-a-webpage/");
    await page.locator("#url-tab").click();
    await page.locator("#page-url").fill("https://docs.python.org/3/");
    await page.locator("#instructions").fill("What does it say?");
    await page.locator("#extra-ask").click();
    await expect.poll(() => reads).toBe(1);
    page.once("dialog", (d) => (accept ? d.accept() : d.dismiss()));
    await page.locator("#extra-example").click();
    release();
    await expect(page.locator("#extra-ask")).toBeEnabled();
    expect(interpretations).toBe(accept ? 0 : 1);
    if (accept) {
      await expect(page.locator("#extra-results")).toBeHidden();
      await expect(page.locator("#source-text")).toHaveValue(/UtilityPot/);
    }
  });
for (const [slug, extension, contents] of [
  ["csv-to-nested-json", "csv", "Team,Member\nBlue,Jo"],
  ["json-to-csv", "json", '[{"name":"Jo"}]'],
])
  test(`${slug}: uploaded file survives cancel and is cleared on replacement`, async ({
    page,
  }) => {
    await page.goto(`/tools/${slug}/`);
    await page.locator("#source-file").setInputFiles({
      name: `source.${extension}`,
      mimeType: "text/plain",
      buffer: Buffer.from(contents),
    });
    const source = page.locator("#csv-input, #source-text");
    await expect(source).toHaveValue(contents);
    page.once("dialog", (d) => d.dismiss());
    await page.locator("#load-example, #extra-example").click();
    await expect(source).toHaveValue(contents);
    expect(
      await page.locator("#source-file").evaluate((el) => el.files.length),
    ).toBe(1);
    page.once("dialog", (d) => d.accept());
    await page.locator("#load-example, #extra-example").click();
    expect(
      await page.locator("#source-file").evaluate((el) => el.files.length),
    ).toBe(0);
    await expect(source).not.toHaveValue(contents);
  });
for (const slug of ["ask-a-webpage", "entity-extractor"])
  for (const accept of [false, true])
    test(`${slug}: pending interpretation ${accept ? "discarded on replace" : "preserved on cancel"}`, async ({
      page,
    }) => {
      let release;
      const gate = new Promise((r) => (release = r));
      let calls = 0;
      await page.route("**/api/utilities/interpret", async (route) => {
        calls++;
        await gate;
        await route.fulfill({
          json: {
            source: "jev",
            model: "regression-fixture",
            confidence: {},
            plan:
              slug === "ask-a-webpage"
                ? answeredSource(route.request().postDataJSON().input.text)
                : {
                    entities: [
                      { type: "Person", text: "Ada", start: 0, end: 3 },
                    ],
                  },
          },
        });
      });
      await page.goto(`/tools/${slug}/`);
      await page.locator("#load-example, #extra-example").click();
      await page.locator("#extra-ask").click();
      await expect.poll(() => calls).toBe(1);
      page.once("dialog", (d) => (accept ? d.accept() : d.dismiss()));
      await page.locator("#load-example, #extra-example").click();
      release();
      await expect(page.locator("#extra-ask")).toBeEnabled();
      if (accept)
        await expect(page.locator("#results, #extra-results")).toBeHidden();
      else await expect(page.locator("#results, #extra-results")).toBeVisible();
    });
test("approval sample creates its described branches and fresh steps replace them", async ({
  page,
}) => {
  await fixturePlan(page, { graph: approvalGraph });
  await page.goto("/tools/text-to-mermaid/");
  await page.locator("#extra-example").click();
  await page.locator("#create-diagram").click();
  await expect(page.locator("#extra-output")).toContainText("-->|yes|");
  await expect(page.locator("#extra-output")).toContainText("-->|no|");
  await page.locator("#source-text").fill("Start\nFinish");
  await page.unroute("**/api/utilities/interpret");
  await fixturePlan(page, {
    graph: {
      nodes: [
        { id: "n0", label: "Start", type: "terminal" },
        { id: "n1", label: "Finish", type: "terminal" },
      ],
      edges: [{ from: "n0", to: "n1", label: "" }],
    },
  });
  await page.locator("#create-diagram").click();
  await expect(page.locator("#extra-output")).toContainText("Finish");
  await expect(page.locator("#extra-output")).not.toContainText("Approve");
});
test("auxiliary input entered before module initialization is protected", async ({
  page,
}) => {
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route("**/_astro/ExtraUtilityApp*.js", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/tools/ask-a-webpage/", { waitUntil: "commit" });
  await page.locator("#instructions").fill("My early question");
  release();
  await page.waitForLoadState("networkidle");
  let prompted = false;
  page.once("dialog", async (d) => {
    prompted = true;
    await d.dismiss();
  });
  await page.locator("#extra-example").click();
  expect(prompted).toBe(true);
  await expect(page.locator("#instructions")).toHaveValue("My early question");
});
