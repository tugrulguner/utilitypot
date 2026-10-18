import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { answerSourceDocument } from "./source-answer.js";
const captured = JSON.parse(
  readFileSync(
    new URL("./fixtures/source-answer-lead-jev-1.13.0.json", import.meta.url),
    "utf8",
  ),
);
test("genuine-response replay puts the strongest whole-question answer ahead of source-prefix fragments", async () => {
  let index = 0;
  const result = await answerSourceDocument(
    { text: captured.text, question: captured.question },
    async (input) => {
      const row = captured.windows[index++];
      assert.deepEqual(input, row.input);
      return structuredClone(row.response);
    },
  );
  assert.equal(index, captured.windows.length);
  assert.deepEqual(
    result.plan.answer.lead.map((e) => e.text),
    [captured.expectedLead],
  );
  assert.equal(
    result.plan.excerpts.length,
    captured.windows.reduce((n, w) => n + w.response.plan.excerpts.length, 0),
  );
  assert.equal(result.confidence["window12.answer_complete"], 0.9);
});
