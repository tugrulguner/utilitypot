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
function nestedArrayPaths(value) {
  const out = [];
  function walk(v, path, depth) {
    if (depth > 6) return;
    if (Array.isArray(v)) {
      out.push(path);
      v.forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1));
    } else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v))
        walk(x, path ? `${path}.${k}` : k, depth + 1);
  }
  walk(value, "", 0);
  return out;
}
export function jsonToCsv(data, path, arrays = "reject") {
  if (
    !arrayPaths(data).includes(path) &&
    !(
      path === "$object" &&
      data &&
      typeof data === "object" &&
      !Array.isArray(data)
    )
  )
    throw new Error("Choose a record array or the single object row.");
  if (!["omit", "join", "reject"].includes(arrays))
    throw new Error("Choose how to handle nested arrays.");
  const records =
    path === "$object"
      ? [data]
      : path === "$"
        ? data
        : path.split(".").reduce((v, k) => v[k], data);
  if (records.length > 10000) throw new Error("Use at most 10,000 records.");
  const rows = records.map((record) => {
    const out = {};
    function flatten(v, prefix, depth) {
      if (depth > 6)
        throw new Error(`Nesting at ${prefix || "record"} exceeds six levels.`);
      if (Array.isArray(v)) {
        if (arrays === "reject")
          throw new Error(
            `Nested array at ${prefix} needs an explicit policy. Choose “Keep as JSON text in a cell” to preserve it, or “Omit nested-array fields” to remove it. “Stop if nested arrays exist” makes no CSV.`,
          );
        if (arrays === "join") out[prefix] = JSON.stringify(v);
        return;
      }
      if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) {
          if (bad.has(k) || k.includes("."))
            throw new Error(
              `Unsafe or ambiguous property at ${prefix ? `${prefix}.` : ""}${k}.`,
            );
          flatten(x, prefix ? `${prefix}.${k}` : k, depth + 1);
        }
      else out[prefix] = v === null ? "" : String(v);
    }
    flatten(record, "", 0);
    return out;
  });
  const headers = [...new Set(rows.flatMap(Object.keys))];
  if (!headers.length || headers.length > 100)
    throw new Error("Use 1–100 output fields with at least one value.");
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
  let data;
  try {
    data = JSON.parse(input.sample);
  } catch {
    throw new Error("Enter valid JSON (check commas, quotes, and brackets). ");
  }
  const paths = arrayPaths(data);
  const singleObject =
    !paths.length && data && typeof data === "object" && !Array.isArray(data);
  if (singleObject) paths.push("$object");
  if (!paths.length)
    throw new Error(
      "Choose an object array with record rows; a single JSON object can be converted as one row.",
    );
  const criteria = Object.fromEntries(
    paths.map((p) => [p, p === "$object" ? "Entire object as one row" : p]),
  );
  criteria.none = "No clear row array; user must select.";
  return {
    state: {
      sample: data,
      instructions: input.instructions,
      ...(singleObject
        ? {
            data,
            path: "$object",
            arrays: "reject",
            nestedArrayPaths: nestedArrayPaths(data),
          }
        : {}),
    },
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
