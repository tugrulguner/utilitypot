import Papa from "papaparse";
export const LIMITS = Object.freeze({
  csvBytes: 2 * 1024 * 1024,
  rows: 10000,
  cells: 200000,
  text: 2000000,
});
export function tableFromRows(matrix) {
  if (!Array.isArray(matrix) || !matrix.length)
    throw new Error("The table has no header row.");
  const [headers, ...data] = matrix;
  if (
    !Array.isArray(headers) ||
    !headers.length ||
    headers.length > 500 ||
    headers.some((h) => typeof h !== "string" || !h.trim())
  )
    throw new Error("Headers must be nonblank text; at most 500 columns.");
  if (new Set(headers).size !== headers.length)
    throw new Error("Headers must be unique.");
  if (
    data.length > LIMITS.rows ||
    (data.length + 1) * headers.length > LIMITS.cells
  )
    throw new Error("Table exceeds 10,000 rows or 200,000 cells.");
  let characters = headers.join("").length;
  const rows = data.map((row, i) => {
    if (!Array.isArray(row) || row.length > headers.length)
      throw new Error(`Row ${i + 2} has too many columns.`);
    const entries = headers.map((h, j) => {
      const value = j < row.length ? row[j] : null;
      if (value !== null && typeof value !== "string")
        throw new Error("Cell values must be literal text.");
      characters += value?.length || 0;
      if (characters > LIMITS.text)
        throw new Error("Table text exceeds two million characters.");
      return [h, value];
    });
    return Object.fromEntries(entries);
  });
  return { headers: [...headers], rows };
}
export function parseCsv(text) {
  if (typeof text !== "string") throw new TypeError("CSV input must be text.");
  if (new TextEncoder().encode(text).length > LIMITS.csvBytes)
    throw new Error("CSV exceeds the 2 MiB limit.");
  const parsed = Papa.parse(text, {
    skipEmptyLines: false,
    dynamicTyping: false,
  });
  if (parsed.errors.some((e) => e.type !== "Delimiter"))
    throw new Error("Invalid CSV quoting or row structure.");
  const data = parsed.data;
  if (
    /[\r\n]$/.test(text) &&
    data.at(-1)?.length === 1 &&
    data.at(-1)[0] === ""
  )
    data.pop();
  return tableFromRows(data);
}
export function compareTables(before, after, keyColumn) {
  for (const side of [before, after]) {
    if (!side?.headers?.includes(keyColumn))
      throw new Error("Choose a key column present in both tables.");
    const seen = new Set();
    for (const row of side.rows) {
      const key = row[keyColumn];
      if (typeof key !== "string" || !key.trim())
        throw new Error("Keys cannot be blank.");
      if (seen.has(key))
        throw new Error(
          "Duplicate key values: choose a unique key or correct the source.",
        );
      seen.add(key);
    }
  }
  const left = new Map(before.rows.map((row) => [row[keyColumn], row])),
    right = new Map(after.rows.map((row) => [row[keyColumn], row]));
  const columns = {
    added: after.headers.filter((h) => !before.headers.includes(h)),
    removed: before.headers.filter((h) => !after.headers.includes(h)),
  };
  const all = [...new Set([...before.headers, ...after.headers])].filter(
      (h) => h !== keyColumn,
    ),
    rows = [];
  function entry(key, prior, current) {
    const changes = all.flatMap((column) => {
      const a = prior && Object.hasOwn(prior, column) ? prior[column] : null,
        b = current && Object.hasOwn(current, column) ? current[column] : null;
      return !prior ||
        !current ||
        a !== b ||
        !before.headers.includes(column) ||
        !after.headers.includes(column)
        ? [{ column, before: a, after: b }]
        : [];
    });
    return {
      key,
      status: !prior
        ? "added"
        : !current
          ? "removed"
          : changes.length
            ? "changed"
            : "unchanged",
      before: prior || null,
      after: current || null,
      changes,
    };
  }
  for (const [key, current] of right) {
    rows.push(entry(key, left.get(key), current));
    left.delete(key);
  }
  for (const [key, prior] of left) rows.push(entry(key, prior, null));
  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const row of rows) counts[row.status]++;
  return { keyColumn, columns, rows, counts };
}
export function csvSafe(value) {
  if (value == null) return "";
  const text = String(value);
  return /^\s*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
export function reportRows(diff) {
  return diff.rows.flatMap((row) =>
    row.changes.length
      ? row.changes.map((c) => [
          row.status,
          row.key,
          c.column,
          c.before,
          c.after,
          c.before !== null,
          c.after !== null,
        ])
      : [[row.status, row.key, "", null, null, false, false]],
  );
}
export function exportCsv(diff) {
  return Papa.unparse(
    [
      [
        "status",
        "key",
        "column",
        "before",
        "after",
        "before_present",
        "after_present",
      ],
      ...reportRows(diff).map((row) => row.map(csvSafe)),
    ],
    { quotes: true, newline: "\r\n" },
  );
}
