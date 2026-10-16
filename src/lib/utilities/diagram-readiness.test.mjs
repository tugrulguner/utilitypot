import test from "node:test";
import assert from "node:assert/strict";
import { createDiagramInterpretation, graphRoleIssues } from "./diagram.js";

const text = [
  "Submit access request.",
  "Does the manager approve?",
  "If rejected, notify employee and stop.",
  "If approved, create account.",
  "Require password reset.",
  "Send onboarding link.",
  "Record the access grant.",
  "Finish onboarding.",
].join("\n");

test("diagram questions explicitly map human step 4 to internal n3", () => {
  const spec = createDiagramInterpretation({
    text,
    instructions: "Step 2 yes goes to step 4; no goes to step 3.",
  });
  assert.deepEqual(spec.state.nodes[3], {
    id: "n3",
    step: 4,
    label: "If approved, create account.",
  });
  assert.deepEqual(spec.questions.next1.criteria.n3, {
    step: 4,
    label: "If approved, create account.",
  });
  assert.match(spec.questions.next1.instructions, /step 2 \(n1\)/i);
  assert.match(spec.questions.else1.instructions, /step 2 \(n1\)/i);
  assert.equal(Object.keys(spec.questions).length, 16);
  assert.ok(Object.hasOwn(spec.questions.next1.criteria, "none"));
});

function capturedGraph() {
  const roles = [
    "terminal",
    "decision",
    "terminal",
    "process",
    "process",
    "process",
    "process",
    "terminal",
  ];
  return {
    nodes: text
      .split("\n")
      .map((label, i) => ({ id: `n${i}`, label, type: roles[i] })),
    edges: [
      { from: "n0", to: "n1", label: "" },
      { from: "n1", to: "n4", label: "yes" },
      { from: "n1", to: "n2", label: "no" },
      { from: "n3", to: "n4", label: "" },
      { from: "n4", to: "n5", label: "" },
      { from: "n5", to: "n6", label: "" },
      { from: "n6", to: "n7", label: "" },
    ],
  };
}

test("captured orphaned account-creation step requires explicit review without repair", () => {
  const graph = capturedGraph();
  const before = structuredClone(graph);
  const issues = graphRoleIssues(graph);
  assert.ok(
    issues.some((s) => s.includes("n3") && s.includes("not reachable")),
  );
  assert.deepEqual(graph, before);
});

test("correct approved branch reaches every step without connectivity warnings", () => {
  const graph = capturedGraph();
  graph.edges[1].to = "n3";
  assert.deepEqual(graphRoleIssues(graph), []);
});

test("reachable loops terminate traversal and do not invent disconnected warnings", () => {
  const graph = {
    nodes: [0, 1, 2].map((i) => ({
      id: `n${i}`,
      label: `Action ${i}`,
      type: "process",
    })),
    edges: [
      { from: "n0", to: "n1" },
      { from: "n1", to: "n2" },
      { from: "n2", to: "n1" },
    ],
  };
  assert.deepEqual(graphRoleIssues(graph), []);
});

test("human step metadata never changes public graph IDs or labels", () => {
  const spec = createDiagramInterpretation({ text, instructions: "" });
  const answers = {};
  for (let i = 0; i < 8; i++) {
    answers[`type${i}`] = {
      choice:
        i === 1
          ? "decision"
          : i === 0 || i === 2 || i === 7
            ? "terminal"
            : "process",
    };
    answers[`next${i}`] = {
      choice: ["n1", "n3", "none", "n4", "n5", "n6", "n7", "none"][i],
    };
    answers[`else${i}`] = { choice: i === 1 ? "n2" : "none" };
  }
  const followup = spec.followup(answers);
  assert.equal(Object.keys(followup.questions).length, 8);
  const result = spec.decode(answers);
  assert.deepEqual(result.reviewIssues, []);
  assert.equal(result.graph.nodes[3].id, "n3");
  assert.equal(result.graph.nodes[3].label, "If approved, create account.");
  assert.ok(!Object.hasOwn(result.graph.nodes[3], "step"));
});
