const escapeLabel = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\r\n]/g, " ")
    .replace(/\\/g, "&#92;");
export function mermaidSource(graph) {
  if (
    !graph ||
    !Array.isArray(graph.nodes) ||
    !graph.nodes.length ||
    graph.nodes.length > 8 ||
    !Array.isArray(graph.edges) ||
    graph.edges.length > 16
  )
    throw new Error("Use 1–8 nodes and at most 16 edges.");
  const ids = graph.nodes.map((n) => n.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate node IDs.");
  const lines = ["flowchart TD"];
  for (const n of graph.nodes) {
    if (
      !/^n[0-7]$/.test(n.id) ||
      typeof n.label !== "string" ||
      !n.label.trim() ||
      n.label.length > 160 ||
      !["process", "decision", "terminal"].includes(n.type)
    )
      throw new Error("Invalid node.");
    const text = `"${escapeLabel(n.label)}"`;
    lines.push(
      `${n.id}${n.type === "decision" ? "{" : n.type === "terminal" ? "([" : "["}${text}${n.type === "decision" ? "}" : n.type === "terminal" ? "])" : "]"}`,
    );
  }
  for (const e of graph.edges) {
    if (
      !ids.includes(e.from) ||
      !ids.includes(e.to) ||
      !["", "yes", "no"].includes(e.label || "")
    )
      throw new Error("Invalid edge.");
    lines.push(`${e.from} -->${e.label ? `|${e.label}|` : ""} ${e.to}`);
  }
  return lines.join("\n");
}
export function createDiagramInterpretation(input) {
  if (
    !input ||
    typeof input.text !== "string" ||
    input.text.length > 1800 ||
    typeof input.instructions !== "string" ||
    input.instructions.length > 800
  )
    throw new Error(
      "Use one short step per line and optional relationship instructions.",
    );
  const labels = input.text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!labels.length || labels.length > 8 || labels.some((s) => s.length > 160))
    throw new Error("Use 1–8 steps, each at most 160 characters.");
  const nodes = labels.map((label, i) => ({ id: `n${i}`, label })),
    criteria = Object.fromEntries(nodes.map((n) => [n.id, n.label]));
  criteria.none = "No explicit destination; terminal or unresolved.";
  const questions = {};
  nodes.forEach((n, i) => {
    questions[`type${i}`] = {
      type: "choice",
      instructions: `What is step ${n.id}'s role in the described process?`,
      criteria: {
        process: "An action or ordinary step.",
        decision: "A conditional branch or question.",
        terminal: "A start or end state.",
      },
    };
    questions[`next${i}`] = {
      type: "choice",
      instructions: `Which explicit step follows ${n.id}? For a decision, select its affirmative/true branch. Choose none if no relation is supported. Do not assume the next listed line is necessarily the next process step.`,
      criteria,
    };
    questions[`else${i}`] = {
      type: "choice",
      instructions: `Which step is the explicit negative/false alternative of ${n.id}? Choose none if not a decision or no alternative is supported.`,
      criteria,
    };
  });
  return {
    state: { nodes, instructions: input.instructions },
    questions,
    decode(a) {
      const typed = nodes.map((n, i) => ({ ...n, type: a[`type${i}`].choice }));
      const edges = [];
      typed.forEach((n, i) => {
        const next = a[`next${i}`].choice,
          alt = a[`else${i}`].choice;
        if (next !== "none")
          edges.push({
            from: n.id,
            to: next,
            label: n.type === "decision" ? "yes" : "",
          });
        // Questions run independently: a false-branch answer is relevant only
        // when this node was actually classified as a decision.
        if (n.type === "decision" && alt !== "none") {
          if (alt === next) throw new Error("Inconsistent decision branches.");
          edges.push({ from: n.id, to: alt, label: "no" });
        }
      });
      const graph = { nodes: typed, edges };
      mermaidSource(graph);
      return { graph, needsReview: true };
    },
  };
}
