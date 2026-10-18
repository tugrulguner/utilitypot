import test from "node:test";
import assert from "node:assert/strict";
import {
  createSourceAnswerInterpretation,
  createSourceAnswerWindow,
  sourceUnits,
} from "./source-answer.js";
test("a normal page with many small blocks fits one answer request without dropping source", () => {
  const text = Array.from(
    { length: 142 },
    (_, i) => `Project ${i}: focused tools and their purpose.`,
  ).join("\n\n");
  const input = { text, question: "What projects are available?" };
  const spec = createSourceAnswerInterpretation(input);
  assert.equal(spec.windows.length, 1);
  assert.ok(spec.windows[0].length <= 9);
  for (const unit of sourceUnits(text))
    assert.ok(
      spec.windows
        .flat()
        .some((p) => p.start <= unit.start && p.end >= unit.end),
    );
  for (const window of spec.windows) {
    const passages = window.map((p, i) => ({ ...p, id: `u${i}` }));
    assert.ok(
      Buffer.byteLength(
        JSON.stringify({
          tool: "qa",
          input: { mode: "source-answer", question: input.question, passages },
        }),
      ) <= 16000,
    );
    createSourceAnswerWindow({
      mode: "source-answer",
      question: input.question,
      passages,
    });
    for (const p of window) assert.equal(text.slice(p.start, p.end), p.text);
  }
});
test("long and multilingual sources retain exact coverage and existing request bounds", () => {
  const text = Array.from(
    { length: 200 },
    (_, i) => `${i} ${"İstanbul 科学 🙂 words ".repeat((i % 13) + 1)}`,
  ).join("\n\n");
  const spec = createSourceAnswerInterpretation({
    text,
    question: "What does it say?",
  });
  for (const unit of sourceUnits(text))
    assert.ok(
      spec.windows
        .flat()
        .some((p) => p.start <= unit.start && p.end >= unit.end),
    );
  for (const w of spec.windows) {
    const input = {
      mode: "source-answer",
      question: "What does it say?",
      passages: w.map((p, i) => ({ ...p, id: `u${i}` })),
    };
    assert.ok(
      Buffer.byteLength(JSON.stringify({ tool: "qa", input })) <= 16000,
    );
    createSourceAnswerWindow(input);
  }
});
