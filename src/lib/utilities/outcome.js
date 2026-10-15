// Client defaults only. Existing inference and transformation engines remain authoritative.
import { parseCsv } from "./csv.js";
import { arrayPaths } from "./json-csv.js";
import { mermaidSource } from "./diagram.js";
import { entityTokens } from "./entities.js";
export function groupCsv(text, group, parents = [], child = "rows") {
  const rows = parseCsv(text),
    headers = Object.keys(rows[0]);
  if (!headers.includes(group)) throw Error("Choose a grouping field.");
  if (
    typeof child !== "string" ||
    !child.trim() ||
    child.length > 80 ||
    ["__proto__", "constructor", "prototype"].includes(child) ||
    headers.includes(child)
  )
    throw Error("Choose a child array name that differs from source headers.");
  if (parents.some((p) => !headers.includes(p)))
    throw Error("Unknown parent field.");
  const parentKeys = [...new Set([group, ...parents])],
    groups = new Map();
  for (const row of rows) {
    if (!row[group].trim())
      throw Error("Blank grouping values require correction.");
    let parent = groups.get(row[group]);
    if (!parent) {
      parent = Object.fromEntries(parentKeys.map((k) => [k, row[k]]));
      Object.defineProperty(parent, child, { value: [], enumerable: true });
      groups.set(row[group], parent);
    }
    for (const k of parentKeys)
      if (parent[k] !== row[k])
        throw Error(
          `Conflicting parent values for ${k}. Keep this field in child rows or correct the source.`,
        );
    parent[child].push(
      Object.fromEntries(
        headers.filter((k) => !parentKeys.includes(k)).map((k) => [k, row[k]]),
      ),
    );
  }
  return [...groups.values()];
}
export function recordChoices(data) {
  return arrayPaths(data).map((path) => ({
    path,
    count: (path === "$" ? data : path.split(".").reduce((v, k) => v[k], data))
      .length,
  }));
}
export function sequentialGraph(text) {
  const labels = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const graph = {
    nodes: labels.map((label, i) => ({ id: `n${i}`, label, type: "process" })),
    edges: labels
      .slice(1)
      .map((_, i) => ({ from: `n${i}`, to: `n${i + 1}`, label: "" })),
  };
  mermaidSource(graph);
  return graph;
}
export function sourceMention(source, type, text, occurrence = 0) {
  if (!text || !Number.isInteger(occurrence) || occurrence < 0)
    throw Error("Choose an exact source occurrence.");
  let start = -1;
  for (let i = 0; i <= occurrence; i++) {
    start = source.indexOf(text, start + 1);
    if (start < 0) throw Error("Mention must occur in the source.");
  }
  const end = start + text.length,
    tokens = entityTokens(source);
  if (
    !tokens.some((t) => t.start === start) ||
    !tokens.some((t) => t.end === end)
  )
    throw Error("Choose complete source tokens.");
  return { type, text, start, end };
}
