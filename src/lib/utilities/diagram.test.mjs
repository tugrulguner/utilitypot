import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createDiagramInterpretation, mermaidSource } from "./diagram.js";
const branchingInput = {
  text: "Receive order\nStock available?\nShip item\nNotify backorder",
  instructions:
    "Receive the order, then decide whether stock is available. If yes ship the item. If no notify backorder. Both outcomes end the flow; do not connect them to each other.",
};
async function capturedAnswers() {
  return JSON.parse(
    await readFile(
      new URL("./fixtures/diagram-branching-jev-1.13.0.json", import.meta.url),
      "utf8",
    ),
  ).answers;
}
test("real Jev branching answers ignore inapplicable false branches on non-decisions", async () => {
  const answers = await capturedAnswers();
  assert.equal(answers.type2.choice, "terminal");
  assert.equal(answers.else2.choice, "n3");
  const graph =
    createDiagramInterpretation(branchingInput).decode(answers).graph;
  assert.deepEqual(graph.edges, [
    { from: "n0", to: "n1", label: "" },
    { from: "n1", to: "n2", label: "yes" },
    { from: "n1", to: "n3", label: "no" },
  ]);
  assert.deepEqual(
    graph.nodes.map((n) => n.label),
    branchingInput.text.split("\n"),
  );
});

test("actual decision branches still reject the same destination for yes and no", async () => {
  const answers = await capturedAnswers();
  answers.else1.choice = answers.next1.choice;
  assert.throws(
    () => createDiagramInterpretation(branchingInput).decode(answers),
    /Inconsistent decision branches/,
  );
});
test("actual decision branches still reject destinations outside the source nodes", async () => {
  const answers = await capturedAnswers();
  answers.else1.choice = "n7";
  assert.throws(
    () => createDiagramInterpretation(branchingInput).decode(answers),
    /Invalid edge/,
  );
});
test("inapplicable false branches never introduce edges or alter source labels", async () => {
  for (const choice of ["n0", "n1", "n2", "n3", "none"]) {
    const answers = await capturedAnswers();
    for (const i of [0, 2, 3]) answers[`else${i}`].choice = choice;
    const graph =
      createDiagramInterpretation(branchingInput).decode(answers).graph;
    assert.equal(graph.edges.length, 3);
    assert.equal(graph.edges.filter((e) => e.label === "no").length, 1);
    assert.ok(!graph.edges.some((e) => e.from === "n2" || e.from === "n3"));
  }
});

test("source-backed graph emits escaped Mermaid, not model-authored code", () => {
  const spec = createDiagramInterpretation({
    text: "Receive request\nApprove request?\nSend confirmation",
    instructions: "Receive then approve then send.",
  });
  const a = {};
  for (let i = 0; i < 3; i++) {
    a[`type${i}`] = { choice: i === 1 ? "decision" : "process" };
    a[`next${i}`] = { choice: i === 2 ? "none" : `n${i + 1}` };
    a[`else${i}`] = { choice: "none" };
  }
  const graph = spec.decode(a).graph;
  assert.equal(graph.nodes[0].label, "Receive request");
  assert.match(mermaidSource(graph), /n0 --> n1/);
  assert(
    !mermaidSource({
      nodes: [
        { id: "n0", label: "<script>alert(1)</script>", type: "process" },
      ],
      edges: [],
    }).includes("<script>"),
  );
});

test("fresh UX: roles see relationship proposals in a bounded second stage", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL("./fixtures/diagram-returns-fresh-audit.json", import.meta.url),
      "utf8",
    ),
  );
  const spec = createDiagramInterpretation(captured.input);
  assert.equal(typeof spec.followup, "function");
  assert.equal(Object.keys(spec.questions).length, 12);
  const relationships = {};
  for (const n of captured.response.plan.graph.nodes) {
    const i = n.id.slice(1),
      edges = captured.response.plan.graph.edges.filter((e) => e.from === n.id);
    relationships[`next${i}`] = {
      choice: edges.find((e) => e.label !== "no")?.to || "none",
    };
    relationships[`else${i}`] = {
      choice: edges.find((e) => e.label === "no")?.to || "none",
    };
  }
  const original = structuredClone(relationships);
  const roles = spec.followup(relationships);
  assert.equal(Object.keys(roles.questions).length, 6);
  assert.equal(
    roles.state.relationships.find((r) => r.from === "n3").next,
    "n4",
  );
  assert.equal(typeof roles.questions.type3.instructions, "object");
  assert.match(
    roles.questions.type3.criteria.terminal.not_for,
    /incoming.*outgoing/i,
  );
  const wrong = Object.fromEntries(
    captured.response.plan.graph.nodes.map((n) => [
      `type${n.id.slice(1)}`,
      { choice: n.type },
    ]),
  );
  const proposal = roles.decode(wrong);
  assert.deepEqual(proposal.graph, captured.response.plan.graph);
  assert.match(proposal.reviewIssues.join(" "), /n3.*incoming.*outgoing/i);
  const corrected = structuredClone(wrong);
  corrected.type3.choice = "process";
  corrected.type5.choice = "terminal";
  assert.deepEqual(roles.decode(corrected).reviewIssues, []);
  assert.deepEqual(relationships, original);
});

test("fresh UX: start terminals, self edges and speculative negatives retain their meanings", () => {
  const spec = createDiagramInterpretation({
    text: "Start\nWork\nEnd",
    instructions: "Start then work then end.",
  });
  const a = {
    type0: { choice: "terminal" },
    next0: { choice: "n1" },
    else0: { choice: "n2" },
    type1: { choice: "process" },
    next1: { choice: "n2" },
    else1: { choice: "n0" },
    type2: { choice: "terminal" },
    next2: { choice: "none" },
    else2: { choice: "n0" },
  };
  assert.deepEqual(spec.decode(a).reviewIssues, []);
  a.next1.choice = "n1";
  assert.ok(
    spec.decode(a).graph.edges.some((e) => e.from === "n1" && e.to === "n1"),
  );
  a.type1.choice = "unknown";
  assert.throws(() => spec.decode(a), /role.*n1.*review/i);
});
