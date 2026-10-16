import Papa from "papaparse";
const bad = new Set(["__proto__", "constructor", "prototype"]);
const unsafeNumberMessage =
  "JSON numbers would lose precision. Quote identifiers or high-precision values as strings, then try again.";
function canonicalDecimal(token) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) return null;
  const exponent = Number(match[4] || 0) - (match[3]?.length || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100000)
    return null;
  let digits = (match[2] + (match[3] || "")).replace(/^0+/, "");
  if (!digits) return "0";
  let scale = exponent;
  while (digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    scale++;
  }
  return `${match[1]}${digits}e${scale}`;
}
const jsonNumberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
export function validateJsonNumberPrecision(raw) {
  if (typeof raw !== "string" || raw.length > 2000000)
    throw new Error("Use a JSON document up to 2 MB.");
  for (let i = 0; i < raw.length;) {
    if (raw[i] === '"') {
      i++;
      while (i < raw.length) {
        if (raw[i] === "\\") i += 2;
        else if (raw[i++] === '"') break;
      }
      continue;
    }
    if (raw[i] === "-" || (raw[i] >= "0" && raw[i] <= "9")) {
      jsonNumberPattern.lastIndex = i;
      const match = jsonNumberPattern.exec(raw);
      if (match) {
        const token = match[0],
          number = Number(token);
        if (
          !Number.isFinite(number) ||
          (number === 0 && /[1-9]/.test(token)) ||
          canonicalDecimal(token) !== canonicalDecimal(number.toString())
        )
          throw new Error(unsafeNumberMessage);
        i += token.length;
        continue;
      }
    }
    i++;
  }
}
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
    validateJsonNumberPrecision(input.sample);
    data = JSON.parse(input.sample);
  } catch (error) {
    if (error.message === unsafeNumberMessage) throw error;
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
        instructions: {
          question:
            "Which nested-array policy is explicitly requested in `instructions` for records in `sample`?",
          scope:
            "Read the user's requested representation, independently of which array supplies rows. JSON text in one cell preserves an array without expanding rows.",
          uncertainty:
            "Choose reject when no supported policy is explicit, the request conflicts, or its meaning is unclear. Do not assume omission or serialization from the sample alone.",
        },
        criteria: {
          join: {
            what: "Preserve each nested array by JSON serialization into one cell, including brackets, quotes and all values. The internal key join means JSON.stringify.",
            not_for:
              "Concatenating array elements with a delimiter, expanding rows, or dropping fields.",
          },
          omit: {
            what: "The user explicitly requests removing nested-array fields from the CSV.",
            not_for:
              "Keeping arrays as JSON text or otherwise preserving their contents.",
          },
          reject: {
            what: "Stop conversion: no explicit supported array policy, conflicting or unclear instructions, or an explicit request to stop on arrays.",
            not_for:
              "An explicit request to preserve arrays as JSON text in a cell, or explicitly omit them.",
          },
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
