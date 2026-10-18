import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chooseSourceAnswerLead,
  createSourceAnswerInterpretation,
} from "./source-answer.js";
const captured = JSON.parse(
  readFileSync(
    new URL("./fixtures/source-answer-lead-jev-1.13.0.json", import.meta.url),
    "utf8",
  ),
);
test("historical genuine responses retain strongest whole-question lead ordering (not a replay of newly packed requests)", () => {
  let best;
  for (const [i, row] of captured.windows.entries()) {
    for (const e of row.response.plan.excerpts)
      assert.equal(captured.text.slice(e.start, e.end), e.text);
    best = chooseSourceAnswerLead(best, row.response.plan, i);
  }
  assert.deepEqual(
    best.items.map((e) => e.text),
    [captured.expectedLead],
  );
  assert.equal(best.window, 12);
  assert.equal(best.probability, 0.9);
});
test("the captured page now fits a single complete-source request; old responses are not reused for new questions", () => {
  const spec = createSourceAnswerInterpretation({
    text: captured.text,
    question: captured.question,
  });
  assert.equal(spec.windows.length, 1);
  assert.ok(spec.units.length <= 10);
});
