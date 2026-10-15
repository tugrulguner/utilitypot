import test from "node:test";
import assert from "node:assert/strict";
import { createDiagramInterpretation, mermaidSource } from "./diagram.js";
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
