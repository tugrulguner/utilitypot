import test from "node:test";
import assert from "node:assert/strict";
import { createDiagramInterpretation } from "./diagram.js";

const input = {
  text: "Submit access request.\nDoes the manager approve?\nIf rejected, notify employee and stop.\nIf approved, create account.\nRequire password reset.\nSend onboarding link.\nRecord the access grant.\nFinish onboarding.",
  instructions:
    "Step 2 is the only decision. Its yes branch goes to step 4. Its no branch goes to step 3 and ends there. After step 4, continue to 5, 6, 7, 8 and stop. Step 1 leads to step 2. Do not connect the rejected branch to account creation.",
};
function relationships(spec) {
  return Object.fromEntries(
    Object.keys(spec.questions).map((k) => [k, { choice: "none" }]),
  );
}
function roles() {
  return Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [
      `type${i}`,
      {
        choice:
          i === 1 ? "decision" : [0, 2, 7].includes(i) ? "terminal" : "process",
      },
    ]),
  );
}

test("provider options use human step numbers rather than contradictory zero-based graph IDs", () => {
  const spec = createDiagramInterpretation(input);
  for (const q of Object.values(spec.questions)) {
    assert.deepEqual(Object.keys(q.criteria), [
      ...Array.from({ length: 8 }, (_, i) => `step${i + 1}`),
      "none",
    ]);
    assert.deepEqual(q.criteria.step4, {
      step: 4,
      label: "If approved, create account.",
    });
  }
  assert.equal(Object.keys(spec.questions).length, 16);
});
test("selected human step4 maps exactly to public n3 without repairing probabilities or labels", () => {
  const spec = createDiagramInterpretation(input),
    a = relationships(spec);
  a.next1 = { choice: "step4" };
  a.else1 = { choice: "step3" };
  const before = structuredClone(a);
  const followup = spec.followup(a);
  assert.equal(Object.keys(followup.questions).length, 8);
  assert.equal(followup.state.relationships[1].next, "n3");
  assert.equal(followup.state.relationships[1].negativeIfDecision, "n2");
  const graph = followup.decode(roles()).graph;
  assert.deepEqual(graph.edges, [
    { from: "n1", to: "n3", label: "yes" },
    { from: "n1", to: "n2", label: "no" },
  ]);
  assert.deepEqual(a, before);
  assert.equal(graph.nodes[3].label, "If approved, create account.");
  assert.deepEqual(
    graph.nodes.map((n) => n.id),
    Array.from({ length: 8 }, (_, i) => `n${i}`),
  );
});
test("every human destination maps to its original graph ID and none stays absent", () => {
  const spec = createDiagramInterpretation(input);
  for (let i = 0; i < 8; i++) {
    const a = relationships(spec);
    a.next0 = { choice: `step${i + 1}` };
    assert.equal(spec.followup(a).decode(roles()).graph.edges[0].to, `n${i}`);
  }
  assert.deepEqual(
    spec.followup(relationships(spec)).decode(roles()).graph.edges,
    [],
  );
});
test("old raw graph IDs are not silently accepted as differently numbered steps", () => {
  const spec = createDiagramInterpretation(input),
    a = relationships(spec);
  a.next1 = { choice: "n4" };
  assert.throws(() => spec.decode({ ...a, ...roles() }), /destination/i);
});
