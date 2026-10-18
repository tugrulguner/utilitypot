import test from "node:test";
import assert from "node:assert/strict";
import { createSourceAnswerWindow } from "./source-answer.js";
const texts = [
  "The page mentions a software family.",
  "The family consists of Alpha, Beta and Gamma.",
];
function setup() {
  let offset = 0;
  const passages = texts.map((text, i) => {
    const p = { id: `u${i}`, start: offset, end: offset + text.length, text };
    offset = p.end + 2;
    return p;
  });
  const spec = createSourceAnswerWindow({
    mode: "source-answer",
    question: "Which projects form the family?",
    passages,
  });
  const first = {
    u0_relevant: { noul: 0.8 },
    u1_relevant: { noul: 0.95 },
    u0_role: { choice: "direct" },
    u1_role: { choice: "direct" },
    answer_complete: { noul: 0.95 },
    intent: { choice: "fact" },
  };
  const follow = spec.followup(first);
  const spans = Object.fromEntries(
    Object.entries(follow.questions)
      .filter(([k]) => k.endsWith("_span"))
      .map(([k, q]) => [
        k,
        {
          choice: Object.keys(q.criteria).find(
            (c) =>
              q.criteria[c]?.text ===
              texts[Number(q.instructions.passage_id.slice(1))],
          ),
        },
      ]),
  );
  return { spec, follow, spans };
}
test("explicit primary judgment puts a late complete answer first while preserving all supporting source", () => {
  const { spec, follow, spans } = setup();
  assert.equal(follow.questions.answer_lead.type, "choice");
  const plan = follow.decode({ ...spans, answer_lead: { choice: "u1" } });
  assert.equal(plan.answer.lead.length, 1);
  assert.equal(plan.answer.lead[0].text, texts[1]);
  assert.equal(plan.excerpts.length, 2);
  assert.equal(plan.contexts.length, 2);
  assert.ok(
    Object.keys(spec.questions).length + Object.keys(follow.questions).length <=
      32,
  );
});
test("primary selection outside the accepted source fails closed", () => {
  const { follow, spans } = setup();
  assert.throws(
    () => follow.decode({ ...spans, answer_lead: { choice: "u99" } }),
    /primary answer selection/i,
  );
});
