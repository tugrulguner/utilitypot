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
