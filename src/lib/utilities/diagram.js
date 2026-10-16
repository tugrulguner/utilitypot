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
    criteria = Object.fromEntries(
      nodes.map((n, i) => [`step${i + 1}`, { step: i + 1, label: n.label }]),
    );
  criteria.none = "No explicit destination; terminal or unresolved.";
  const questions = {};
  nodes.forEach((n, i) => {
    questions[`next${i}`] = {
      type: "choice",
      instructions: `Which explicit step follows human step ${i + 1}? Select stepN for the Nth listed source step, using its source label and the relationship instructions. For a decision, select its affirmative/true branch. Choose none if no relation is supported. Do not assume the next listed line is necessarily the next process step.`,
      criteria,
    };
    questions[`else${i}`] = {
      type: "choice",
      instructions: `Which step is the explicit negative/false alternative of human step ${i + 1}? Select stepN for the Nth listed source step, using its source label and the relationship instructions. Choose none if not a decision or no alternative is supported.`,
      criteria,
    };
  });
  const state = {
    nodes: nodes.map((n, i) => ({ ...n, step: i + 1 })),
    instructions: input.instructions,
  };
  const destinationIds = new Map(
    nodes.map((node, i) => [`step${i + 1}`, node.id]),
  );
  function destination(choice) {
    if (choice === "none") return "none";
    if (!destinationIds.has(choice))
      throw new Error("Invalid diagram destination.");
    return destinationIds.get(choice);
  }
  function decode(a) {
    const typed = nodes.map((n, i) => {
      if (a[`type${i}`].choice === "unknown")
        throw new Error(
          `Role of ${n.id} is unresolved; review its type and connections manually.`,
        );
      return { ...n, type: a[`type${i}`].choice };
    });
    const edges = [];
    typed.forEach((n, i) => {
      const next = a[`next${i}`].choice,
        alt = a[`else${i}`].choice;
      if (next !== "none")
        edges.push({
          from: n.id,
          to: destination(next),
          label: n.type === "decision" ? "yes" : "",
        });
      // Questions run independently: a false-branch answer is relevant only
      // when this node was actually classified as a decision.
      if (n.type === "decision" && alt !== "none") {
        if (alt === next) throw new Error("Inconsistent decision branches.");
        edges.push({ from: n.id, to: destination(alt), label: "no" });
      }
    });
    const graph = { nodes: typed, edges };
    mermaidSource(graph);
    return { graph, needsReview: true, reviewIssues: graphRoleIssues(graph) };
  }
  return {
    state,
    questions,
    // Retain direct decoding for replay of complete captured answers.
    decode,
    followup(relationships) {
      const roleQuestions = {};
      for (const [i, node] of nodes.entries()) {
        roleQuestions[`type${i}`] = {
          type: "choice",
          instructions: {
            question: `What is the role of ${node.id} in the complete process described by \`nodes\` and \`instructions\`?`,
            context:
              "Use `relationships` to check the proposed continuation, together with the source description. Relationships are proposals, not facts that override source instructions.",
            branches:
              "negativeIfDecision is speculative: it matters only if the source actually makes this node a decision. Ignore it for ordinary actions and start/end states.",
            boundaries:
              "A start can have outgoing connections. An end has no continuation. An intermediate action is not an endpoint just because it completes a subtask. A final action can express the end of the whole path. Do not infer an end solely from an unsupported/none destination.",
          },
          criteria: {
            process: {
              what: "An ordinary action or intermediate step, including an action on a conditional path.",
              not_for:
                "A branching question or an explicit start/end boundary of the path.",
            },
            decision: {
              what: "A question or condition that selects between paths.",
              not_for:
                "An action merely prefixed with the condition under which it runs.",
            },
            terminal: {
              what: "An explicit start or end of a process path; includes a final action that closes the path. Start may lead onward; end does not.",
              not_for:
                "An intermediate step with incoming and outgoing continuation. Completion of one task is not completion of the path.",
            },
            unknown: {
              what: "Role is unsupported, ambiguous, or contradicts the described connections; manual review is needed.",
            },
          },
        };
      }
      return {
        state: {
          ...state,
          relationships: nodes.map((n, i) => ({
            from: n.id,
            next: destination(relationships[`next${i}`].choice),
            negativeIfDecision: destination(relationships[`else${i}`].choice),
          })),
        },
        questions: roleQuestions,
        decode: (roles) => decode({ ...relationships, ...roles }),
      };
    },
  };
}

export function graphRoleIssues(graph) {
  const issues = graph.nodes
    .filter(
      (n) =>
        n.type === "terminal" &&
        graph.edges.some((e) => e.to === n.id && e.from !== n.id) &&
        graph.edges.some((e) => e.from === n.id && e.to !== n.id),
    )
    .map(
      (n) =>
        `${n.id} (${n.label}) is marked Start / end but has incoming and outgoing connections. Review its type or destinations; an intermediate action usually needs Process.`,
    );
  if (!graph.nodes.length) return issues;
  const reachable = new Set([graph.nodes[0].id]);
  const queue = [graph.nodes[0].id];
  for (let i = 0; i < queue.length; i++) {
    for (const edge of graph.edges) {
      if (edge.from === queue[i] && !reachable.has(edge.to)) {
        reachable.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  graph.nodes.forEach((node, i) => {
    if (!reachable.has(node.id)) {
      issues.push(
        `Step ${i + 1} (${node.id}: ${node.label}) is not reachable from the first listed step. Review its connections; confirm explicitly if it is an intentional separate entry point. No connection was added automatically.`,
      );
    }
  });
  return issues;
}
