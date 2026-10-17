import assert from "node:assert/strict";
import test from "node:test";
import { adaptEntityDocumentFixture } from "../../tests/helpers/entity-document-fixture.mjs";
import { entityWindows } from "./utilities/entity-document.js";

test("legacy global spans adapt to the matching owned document window", () => {
  const source = Array.from({ length: 130 }, (_, i) => `w${i}`).join(" ");
  const windows = entityWindows(source);
  const second = windows[1];
  const mentions = [5, 75, 125].map((i) => {
    const start = source.indexOf(`w${i}`);
    return {
      type: "Person",
      text: `w${i}`,
      start,
      end: start + `w${i}`.length,
    };
  });
  const input = {
    text: second.text,
    definitions: "Person: a person",
    range: {
      start: second.ownedStart - second.start,
      end: second.ownedEnd - second.start,
    },
    after: { Person: 0 },
  };
  const response = {
    source: "jev",
    model: "fixture-model",
    confidence: { score: 0.8 },
    plan: { entities: mentions },
  };
  const adapted = adaptEntityDocumentFixture(response, input, source);
  assert.deepEqual(
    adapted.plan.entities.map((e) => e.text),
    ["w75", "w125"],
  );
  assert.deepEqual(adapted.plan.continuation, [
    {
      type: "Person",
      starts: mentions.slice(1).map((e) => e.start - second.start),
      after: mentions[2].end - second.start,
      exhausted: true,
      batchSize: 3,
    },
  ]);
  assert.equal(adapted.confidence.score, 0.8);
  assert.equal(adapted.model, "fixture-model");
});

test("malformed spans, unknown categories, and source mismatches stay untouched", () => {
  const input = {
    text: "Ada",
    definitions: "Person: a person",
    range: { start: 0, end: 3 },
    after: { Person: 0 },
  };
  const malformed = { plan: { entities: [{ type: "Person", start: "0" }] } };
  assert.equal(adaptEntityDocumentFixture(malformed, input, "Ada"), malformed);
  const unknown = {
    plan: { entities: [{ type: "Place", text: "Ada", start: 0, end: 3 }] },
  };
  assert.equal(adaptEntityDocumentFixture(unknown, input, "Ada"), unknown);
  const mismatch = {
    plan: { entities: [{ type: "Person", text: "Bob", start: 0, end: 3 }] },
  };
  assert.equal(adaptEntityDocumentFixture(mismatch, input, "Ada"), mismatch);
});

test("fixture continuation sorts declared starts and permits only previously known inactive categories", () => {
  const source = "Ada Bob Cal Dan Acme",
    entities = [
      { type: "Organization", text: "Acme", start: 16, end: 20 },
      ...[12, 8, 4, 0].map((start) => ({
        type: "Person",
        text: source.slice(start, start + 3),
        start,
        end: start + 3,
      })),
    ];
  const json = {
    model: "fixture",
    source: "jev",
    confidence: { raw: 0.4 },
    plan: { entities },
  };
  const input = {
    text: source,
    definitions: "Person: a person",
    range: { start: 0, end: source.length },
    after: { Person: 0 },
  };
  assert.equal(adaptEntityDocumentFixture(json, input, source), json);
  const adapted = adaptEntityDocumentFixture(json, input, source, [
    "Person",
    "Organization",
  ]);
  assert.deepEqual(adapted.plan.continuation[0].starts, [0, 4, 8]);
  assert.deepEqual(
    adapted.plan.entities.map((e) => e.text),
    ["Ada", "Bob", "Cal"],
  );
  assert.equal(adapted.plan.continuation[0].exhausted, false);
});
test("existing malformed continuation and negative spans are never repaired into fixture success", () => {
  const input = {
    text: "Ada",
    definitions: "Person: a person",
    range: { start: 0, end: 3 },
    after: { Person: 0 },
  };
  for (const response of [
    { plan: { entities: [], continuation: null } },
    { plan: { entities: [{ type: "Person", text: "", start: -1, end: 1 }] } },
  ])
    assert.equal(adaptEntityDocumentFixture(response, input, "Ada"), response);
});
