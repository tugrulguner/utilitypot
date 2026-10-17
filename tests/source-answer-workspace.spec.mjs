import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createSourceAnswerWindow } from "../src/lib/utilities/source-answer.js";
const facts = [
  { text: "The plan includes up to five team members.", role: "direct" },
  { text: "Add team members from Settings, then select Invite.", role: "step" },
  { text: "Invitations expire after seven days.", role: "caveat" },
  {
    text: "The old note said invitations never expire; that statement no longer applies.",
    role: "conflict",
  },
];
const source = facts.map((f) => f.text).join("\n\n");
// This presentation oracle uses only explicitly declared fixture facts, not live semantics.
function response(input, declared = facts) {
  const spec = createSourceAnswerWindow(input),
    a = {};
  for (const [key, q] of Object.entries(spec.questions)) {
    const p = spec.state.passages.find((p) => key.startsWith(p.id + "_")),
      f = p && declared.find((f) => p.text.trim() === f.text);
    a[key] =
      q.type === "noul"
        ? { noul: key === "answer_complete" ? 0.95 : f ? 0.93 : 0.01 }
        : { choice: key === "intent" ? "steps" : (f?.role ?? "unrelated") };
  }
  const next = spec.followup(a),
    b = {};
  for (const [key, q] of Object.entries(next.questions))
    b[key] = {
      choice:
        Object.keys(q.criteria).find(
          (k) =>
            k !== "none" &&
            q.criteria[k].text?.trim() ===
              input.passages
                .find((p) => p.id === q.instructions.passage_id)
                ?.text.trim(),
        ) ?? "none",
    };
  return {
    source: "jev",
    model: "PRESENTATION FIXTURE — NOT LIVE",
    plan: next.decode(b),
    confidence: Object.fromEntries(
      Object.entries({ ...a, ...b }).map(([k, v]) => [k, v.noul ?? 0.8]),
    ),
  };
}
test("article answer presents all details, inspectable context and useful Markdown export instead of a quote carousel", async ({
  page,
}, info) => {
  let calls = 0;
  await page.route("**/api/utilities/interpret", (route) => {
    calls++;
    return route.fulfill({
      json: response(route.request().postDataJSON().input),
    });
  });
  await page.goto("/tools/ask-a-webpage/");
  await page.locator("#source-text").fill(source);
  await page
    .locator("#instructions")
    .fill("How do I invite the team, and what conditions apply?");
  await page.locator("#extra-ask").click();
  await expect(page.locator(".source-answer")).toBeVisible();
  await expect(page.locator(".answer-lead")).toContainText(facts[1].text);
  await expect(page.locator(".answer-section-caveat")).toContainText(
    facts[2].text,
  );
  await expect(page.locator(".answer-section-conflict")).toContainText(
    facts[3].text,
  );
  await expect(page.locator("#extra-visual blockquote")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy quote", exact: true }),
  ).toHaveCount(0);
  await page.locator(".answer-citation").first().click();
  await expect(page.locator(".answer-sources")).toHaveAttribute("open", "");
  await expect(page.locator(".answer-source-item.is-selected")).toBeFocused();
  expect(calls).toBe(1);
  const file = page.waitForEvent("download");
  await page.locator("#extra-download").click();
  const d = await file;
  expect(d.suggestedFilename()).toBe("utilitypot-answer.md");
  const md = await readFile(await d.path(), "utf8");
  for (const f of facts) expect(md).toContain(f.text);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".source-answer").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("source-answer-mobile.png") });
});
test("answer support after the old10k prefix remains available without partial rendering", async ({
  page,
}) => {
  const text = "Background information. ".repeat(470) + "\n\n" + facts[0].text;
  expect(text.length).toBeGreaterThan(10000);
  let calls = 0;
  await page.route("**/api/utilities/interpret", (route) => {
    calls++;
    return route.fulfill({
      json: response(route.request().postDataJSON().input),
    });
  });
  await page.goto("/tools/ask-a-webpage/");
  await page.locator("#source-text").fill(text);
  await page
    .locator("#instructions")
    .fill("How many members does the plan include?");
  await page.locator("#extra-ask").click();
  await expect(page.locator(".answer-lead")).toContainText(facts[0].text);
  expect(calls).toBe(1);
});
test("editing a question cancels the old answer and cannot restore stale output", async ({
  page,
}) => {
  let release;
  const gate = new Promise((r) => (release = r));
  let calls = 0;
  await page.route("**/api/utilities/interpret", async (route) => {
    calls++;
    const data = response(route.request().postDataJSON().input);
    await gate;
    await route.fulfill({ json: data });
  });
  await page.goto("/tools/ask-a-webpage/");
  await page.locator("#source-text").fill(source);
  await page.locator("#instructions").fill("How do invitations work?");
  await page.locator("#extra-ask").click();
  await expect.poll(() => calls).toBe(1);
  await page.locator("#instructions").fill("Different question");
  release();
  await expect(page.locator("#extra-ask")).toBeEnabled();
  await expect(page.locator("#extra-results")).toBeHidden();
  await expect(page.locator(".source-answer")).toHaveCount(0);
});
test("selected source procedures preserve their original step numbers", async ({
  page,
}) => {
  const text = "2. Download the archive.\n4. Run the checks.",
    declared = [{ text, role: "step" }];
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      json: response(route.request().postDataJSON().input, declared),
    }),
  );
  await page.goto("/tools/ask-a-webpage/");
  await page.locator("#source-text").fill(text);
  await page
    .locator("#instructions")
    .fill("Which installation steps are listed?");
  await page.locator("#extra-ask").click();
  await expect(page.locator(".answer-lead li")).toHaveCount(2);
  expect(
    await page
      .locator(".answer-lead li")
      .evaluateAll((rows) => rows.map((row) => row.value)),
  ).toEqual([2, 4]);
});
