import test from "node:test";
import assert from "node:assert/strict";
import { createEntitiesInterpretation, entityTokens } from "./entities.js";
import { extractEntityDocument } from "./entity-document.js";
const definitions = "Person: a named person\nAlias: a named person";
// Deterministic test oracle only, not production extraction or provider-quality evidence.
async function oracle(input) {
  const spec = createEntitiesInterpretation(input),
    starts = {};
  for (const [id, q] of Object.entries(spec.questions)) {
    const n = Number(id.match(/_m(\d)_/)[1]);
    const candidates = Object.entries(q.criteria).filter(
      ([k, v]) => k !== "none" && v.token === "Ada",
    );
    starts[id] = { choice: candidates[n]?.[0] ?? "none" };
  }
  const next = spec.followup(starts),
    ends = {};
  for (const [id, q] of Object.entries(next.questions)) {
    const candidates = Object.entries(q.criteria);
    ends[id] = {
      choice:
        (candidates.find(
          ([k, v]) => k !== "none" && v.text === "Ada Lovelace",
        ) ??
          candidates.find(([k, v]) => k !== "none" && v.text === "Ada"))?.[0] ??
        "none",
    };
  }
  return {
    source: "jev",
    model: "TEST ORACLE, NOT LIVE",
    plan: next.decode(ends),
    confidence: { raw: 0.137 },
  };
}
test("owned ranges and per-category cursors restrict selectable starts before inference", () => {
  const spec = createEntitiesInterpretation({
    text: "Ada x Ada y Ada",
    definitions,
    range: { start: 6, end: 9 },
    after: { Person: 0, Alias: 0 },
  });
  for (const q of Object.values(spec.questions))
    assert.deepEqual(Object.keys(q.criteria), ["w2", "none"]);
  assert.throws(() =>
    createEntitiesInterpretation({
      text: "Ada",
      definitions,
      range: { start: 0, end: 99 },
    }),
  );
  assert.throws(() =>
    createEntitiesInterpretation({
      text: "Ada",
      definitions,
      range: { start: 0, end: 3 },
      after: { Person: -1 },
    }),
  );
});
test("complete long source, dense >3 mentions, Unicode offsets and cross-category overlaps", async () => {
  const text =
    "🧪  " +
    Array.from({ length: 240 }, (_, i) =>
      i % 7 === 0 ? "Ada" : "词" + i,
    ).join("  \n") +
    "  Ada Lovelace  ";
  const calls = [],
    progress = [];
  const result = await extractEntityDocument(
    { text, definitions },
    async (input) => {
      calls.push(input);
      return oracle(input);
    },
    { onProgress: (p) => progress.push(p) },
  );
  const expected = [...text.matchAll(/Ada/g)].map((m) => m.index);
  for (const type of ["Person", "Alias"])
    assert.deepEqual(
      result.plan.entities.filter((e) => e.type === type).map((e) => e.start),
      expected,
    );
  for (const e of result.plan.entities)
    assert.equal(text.slice(e.start, e.end), e.text);
  assert.ok(calls.length > 4);
  assert.equal(result.plan.coverage.complete, true);
  assert.equal(result.plan.coverage.sourceLength, text.length);
  assert.equal(Object.keys(result.confidence).length, calls.length);
  assert.ok(Object.values(result.confidence).every((v) => v === 0.137));
  assert.ok(progress.length);
  assert.equal(progress.at(-1).completed, progress.at(-1).total);
});
test("boundary-spanning names retain their full endpoint and appear once per type", async () => {
  const text =
    Array.from({ length: 71 }, () => "word").join(" ") + " Ada Lovelace tail";
  const result = await extractEntityDocument({ text, definitions }, oracle);
  assert.equal(result.plan.entities.length, 2);
  assert.ok(result.plan.entities.every((e) => e.text === "Ada Lovelace"));
});
test("failure, malformed progress and cancellation never return a partial document", async () => {
  const text = Array.from({ length: 150 }, () => "Ada").join(" ");
  let calls = 0;
  await assert.rejects(
    extractEntityDocument({ text, definitions }, async (input) => {
      if (++calls === 2) throw Error("transport failed");
      return oracle(input);
    }),
    /transport failed/,
  );
  await assert.rejects(
    extractEntityDocument({ text: "Ada", definitions }, async () => ({
      source: "jev",
      model: "fixture",
      plan: { entities: [], continuation: [] },
      confidence: {},
    })),
    /continuation/i,
  );
  const c = new AbortController();
  c.abort();
  let invoked = false;
  await assert.rejects(
    extractEntityDocument(
      { text, definitions },
      async () => {
        invoked = true;
      },
      { signal: c.signal },
    ),
  );
  assert.equal(invoked, false);
});
test("no matches need one inference per owned window, not redundant follow-up batches", async () => {
  let calls = 0;
  const text = Array.from({ length: 150 }, () => "word").join(" ");
  const r = await extractEntityDocument(
    { text, definitions },
    async (input) => {
      calls++;
      return oracle(input);
    },
  );
  assert.equal(r.plan.entities.length, 0);
  assert.equal(calls, r.plan.coverage.windows);
  assert.equal(r.plan.coverage.tokens, entityTokens(text).length);
});

test("model changes and mid-request cancellation reject the whole document", async () => {
  const input = {
    text: Array.from({ length: 150 }, () => "Ada").join(" "),
    definitions,
  };
  let calls = 0;
  await assert.rejects(
    extractEntityDocument(input, async (payload) => {
      const result = await oracle(payload);
      result.model = ++calls === 1 ? "version A" : "version B";
      return result;
    }),
    /model version/i,
  );
  const controller = new AbortController();
  await assert.rejects(
    extractEntityDocument(
      input,
      async (payload) => {
        const result = await oracle(payload);
        controller.abort();
        return result;
      },
      { signal: controller.signal },
    ),
  );
});
