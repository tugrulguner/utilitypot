import test from "node:test";
import assert from "node:assert/strict";
import { createSourceAnswerWindow } from "./source-answer.js";

function follow(text, intent = "overview") {
  return createSourceAnswerWindow({
    mode: "source-answer",
    question: "What does this webpage about?",
    passages: [{ id: "u0", start: 0, end: text.length, text }],
  }).followup({
    u0_relevant: { noul: 0.94 },
    u0_role: { choice: "direct" },
    answer_complete: { noul: 0.95 },
    intent: { choice: intent },
  });
}

test("dense sentence choices fall back without losing late paragraph selection", () => {
  const paragraphs = Array.from(
    { length: 80 },
    (_, i) => `Block ${i} starts here. Another fact. Final detail.`,
  );
  const text = paragraphs.join("\n\n");
  const stage = follow(text);
  const options = Object.entries(stage.questions.u0_span.criteria).filter(
    ([, candidate]) => typeof candidate === "object",
  );
  assert.ok(options.length <= 254);
  assert.equal(
    options.length,
    paragraphs.length + 1,
    "dense choices use blocks plus full context",
  );
  for (const paragraph of paragraphs) {
    const option = options.find(
      ([, candidate]) => candidate.text === paragraph,
    );
    assert.ok(
      option,
      "every paragraph, including the last, remains selectable",
    );
    const plan = stage.decode({ u0_span: { choice: option[0] } });
    assert.equal(plan.answer.lead[0].text, paragraph);
    assert.equal(
      text.slice(plan.answer.lead[0].start, plan.answer.lead[0].end),
      paragraph,
    );
    assert.equal(plan.contexts[0].text, text);
  }
});

test("more than 84 source blocks retain complete non-whole candidate coverage", () => {
  const paragraphs = Array.from(
    { length: 170 },
    (_, i) => `Unpunctuated source block ${i}`,
  );
  const text = paragraphs.join("\n\n");
  const stage = follow(text);
  const options = Object.entries(stage.questions.u0_span.criteria)
    .filter(([, candidate]) => typeof candidate === "object")
    .map(([choice]) => stage.decode({ u0_span: { choice } }).answer.lead[0]);
  assert.ok(options.length <= 254);
  let start = 0;
  for (const paragraph of paragraphs) {
    const end = start + paragraph.length;
    assert.ok(
      options.some(
        (candidate) =>
          candidate.text !== text &&
          candidate.start <= start &&
          candidate.end >= end,
      ),
      "grouped candidates cover every source block, not merely a prefix",
    );
    start = end + 2;
  }
  for (const candidate of options)
    assert.equal(text.slice(candidate.start, candidate.end), candidate.text);
});

test("packed navigation cannot erase a punctuation-free paragraph candidate", () => {
  const answer = "An open-source workshop for simpler software foundations";
  const text = `GitHub\n\nContribution guide\n\n${answer}\n\nSponsor links`;
  const stage = follow(text);
  const option = Object.entries(stage.questions.u0_span.criteria).find(
    ([, candidate]) => candidate.text === answer,
  );
  assert.ok(
    option,
    "the answer paragraph must be selectable without neighboring links",
  );
  const plan = stage.decode({ u0_span: { choice: option[0] } });
  assert.equal(plan.answer.lead[0].text, answer);
  assert.equal(
    text.slice(plan.answer.lead[0].start, plan.answer.lead[0].end),
    answer,
  );
  assert.equal(plan.contexts[0].text, text, "full context is not discarded");
});

test("overview span judgments ask for the subject rather than every related fact", () => {
  const stage = follow(
    "Contribution guide\n\nAster is an open-source project family.\n\nPartner announcement.",
  );
  const instructions = stage.questions.u0_span.instructions;
  assert.equal(instructions.answer_intent, "overview");
  assert.match(instructions.selection_goal, /central subject/i);
  assert.match(instructions.exclude_unrequested, /navigation/i);
  assert.match(instructions.preserve, /conditions/i);
});

test("a code fence elsewhere in a packed passage does not force the whole passage", () => {
  const answer = "Aster provides typed tools for command-line and HTTP use.";
  const text = `Install\n\n\`\`\`sh\npip install aster\n\`\`\`\n\n${answer}\n\nReport an issue`;
  const stage = follow(text);
  assert.ok(
    stage.questions.u0_span,
    "mixed code/prose requires a genuine span choice",
  );
  assert.ok(
    Object.values(stage.questions.u0_span.criteria).some(
      (c) => c.text === answer,
    ),
  );
  assert.ok(
    Object.values(stage.questions.u0_span.criteria).some(
      (c) => c.text === "```sh\npip install aster\n```",
    ),
  );
});
