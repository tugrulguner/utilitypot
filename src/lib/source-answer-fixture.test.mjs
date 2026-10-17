import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerSourceDocument,
  createSourceAnswerInterpretation,
} from "./utilities/source-answer.js";
import { sourceAnswerFixture } from "../../tests/helpers/source-answer-fixture.mjs";
const text = "Service is worldwide.\n\nCancel before renewal.";
const start = text.indexOf("Cancel");
const legacy = {
  source: "jev",
  model: "DECLARED PRESENTATION FIXTURE",
  confidence: { answerability: 0.81, passage: 0.52 },
  plan: {
    status: "answered",
    excerpts: [{ id: "p1", start, end: text.length, text: text.slice(start) }],
  },
};
test("declared positive fixture creates only supporting contexts and preserves exact source and raw scores", async () => {
  const result = await answerSourceDocument(
    { text, question: "When can I cancel?" },
    (input) => sourceAnswerFixture(input, legacy, text),
  );
  assert.equal(result.plan.status, "answered");
  assert.equal(result.plan.contexts.length, 1);
  assert.equal(result.plan.excerpts[0].text, text.slice(start));
  assert.equal(result.confidence["window0.passage"], 0.52);
});
test("malformed or misowned declared spans are never sanitized into valid fixtures", () => {
  const input = createSourceAnswerInterpretation({ text, question: "When?" })
    .windows[0];
  const payload = {
    mode: "source-answer",
    question: "When?",
    passages: input.map((p, i) => ({ ...p, id: `u${i}` })),
  };
  for (const excerpt of [
    { start: 0, end: 4, text: "FAKE" },
    { start: -1, end: 4, text: "test" },
  ]) {
    const bad = {
      ...legacy,
      plan: { status: "answered", excerpts: [excerpt] },
    };
    assert.equal(sourceAnswerFixture(payload, bad, text), bad);
  }
});
test("explicit absence stays absent and never creates irrelevant supporting contexts", async () => {
  const absent = { ...legacy, plan: { status: "not-answered", excerpts: [] } };
  const result = await answerSourceDocument(
    { text, question: "What is the tax rate?" },
    (input) => sourceAnswerFixture(input, absent, text),
  );
  assert.equal(result.plan.status, "not-answered");
  assert.deepEqual(result.plan.contexts, []);
  assert.deepEqual(result.plan.excerpts, []);
});
