import Papa from "papaparse";
const bad = new Set(["__proto__", "constructor", "prototype"]);
export function arrayPaths(data) {
  const out = [];
  function visit(v, path, depth) {
    if (depth > 5) return;
    if (Array.isArray(v)) {
      if (
        v.length &&
        v.every((x) => x && typeof x === "object" && !Array.isArray(x))
      )
        out.push(path || "$");
      return;
    }
    if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (bad.has(k) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
        visit(x, path ? `${path}.${k}` : k, depth + 1);
      }
  }
  visit(data, "", 0);
  if (out.length > 20)
    throw new Error("Use a document with at most 20 record arrays.");
  return out;
}
export function jsonToCsv(data, path, arrays = "omit") {
  if (
    !arrayPaths(data).includes(path) ||
    !["omit", "join", "reject"].includes(arrays)
  )
    throw new Error("Choose a record array and nested-array policy.");
  const records =
    path === "$" ? data : path.split(".").reduce((v, k) => v[k], data);
  if (records.length > 10000) throw new Error("Use at most 10,000 records.");
  const rows = records.map((record) => {
    const out = {};
    function flatten(v, prefix, depth) {
      if (depth > 6) throw new Error("Nesting exceeds six levels.");
      if (Array.isArray(v)) {
        if (arrays === "reject")
          throw new Error("Nested arrays require an explicit policy.");
        if (arrays === "join") out[prefix] = JSON.stringify(v);
        return;
      }
      if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          if (bad.has(k) || k.includes("."))
            throw new Error("Unsafe or ambiguous property path.");
          flatten(x, prefix ? `${prefix}.${k}` : k, depth + 1);
        }
      } else out[prefix] = v === null ? "" : String(v);
    }
    flatten(record, "", 0);
    return out;
  });
  const headers = [...new Set(rows.flatMap(Object.keys))];
  if (!headers.length || headers.length > 100)
    throw new Error("Use 1–100 output columns.");
  return Papa.unparse(
    { fields: headers, data: rows.map((r) => headers.map((h) => r[h] ?? "")) },
    { escapeFormulae: true },
  );
}
export function createJsonCsvInterpretation(input) {
  if (
    !input ||
    typeof input.sample !== "string" ||
    input.sample.length > 6000 ||
    typeof input.instructions !== "string" ||
    input.instructions.length > 800
  )
    throw new Error("Use a small JSON sample and instructions.");
  const data = JSON.parse(input.sample),
    paths = arrayPaths(data);
  if (!paths.length) throw new Error("The sample needs an array of objects.");
  const criteria = Object.fromEntries(paths.map((p) => [p, p]));
  criteria.none = "No clear row array; user must select.";
  return {
    state: { sample: data, instructions: input.instructions },
    questions: {
      rows: {
        type: "choice",
        instructions:
          "Which available array supplies one row per intended CSV record? Choose none if unclear. Never invent a path.",
        criteria,
      },
      arrays: {
        type: "choice",
        instructions:
          "What does the user request for other nested arrays within a record? Default to reject when the instruction is not explicit.",
        criteria: {
          omit: "Explicitly exclude nested-array fields.",
          join: "Explicitly serialize each nested array into one JSON-text cell.",
          reject: "No explicit policy; stop rather than silently lose data.",
        },
      },
    },
    decode(a) {
      return {
        path: a.rows.choice === "none" ? "" : a.rows.choice,
        arrays: a.arrays.choice,
        needsReview: true,
      };
    },
  };
}
