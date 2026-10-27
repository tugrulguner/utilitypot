import { zipSync } from "fflate";
const MAX = 10000;
function validRows(rows) {
  if (
    !Array.isArray(rows) ||
    !rows.length ||
    !rows.some(
      (r) =>
        Array.isArray(r) && r.length && r.some((c) => c !== "" && c != null),
    )
  )
    throw new TypeError("Table is empty or invalid");
  if (
    rows.some((r) => !Array.isArray(r)) ||
    rows.reduce((n, r) => n + r.length, 0) > MAX
  )
    throw new RangeError("Invalid or oversized table");
  let characters = 0;
  return rows.map((r) =>
    r.map((c) => {
      if (typeof c !== "string") throw new TypeError("Cells must be strings");
      characters += c.length;
      if (c.length > 32767 || characters > 2000000)
        throw new RangeError(
          "Spreadsheet text exceeds the export limit (32767 characters per cell).",
        );
      if (
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(c) ||
        [...c].some((ch) => {
          const n = ch.codePointAt(0);
          return n >= 0xd800 && n <= 0xdfff;
        })
      )
        throw new TypeError(
          "XML-invalid control character or Unicode is not allowed",
        );
      return c;
    }),
  );
}
function safe(c, protect) {
  return protect && /^[\s]*[=+\-@\t\r]/.test(c) ? `'${c}` : c;
}
export function tableTSV(rows, { protectFormulas = true } = {}) {
  const checked = validRows(rows);
  if (checked.some((row) => row.some((cell) => /[\t\r\n]/.test(cell))))
    throw new Error(
      "Clipboard cells contain tabs or line breaks. Download XLSX to preserve them.",
    );
  return checked
    .map((row) => row.map((cell) => safe(cell, protectFormulas)).join("\t"))
    .join("\r\n");
}
export function tableCSV(rows, { protectFormulas = true } = {}) {
  return validRows(rows)
    .map((r) =>
      r
        .map((c) => {
          c = safe(c, protectFormulas);
          return `"${c.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}
const xml = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("\r", "&#13;");
function col(n) {
  let s = "";
  for (n++; n; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export function tableXLSX(input) {
  const rows = validRows(input),
    sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, y) => `<row r="${y + 1}">${r.map((v, x) => `<c r="${col(x)}${y + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Table" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": sheet,
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([k, v]) => [k, new TextEncoder().encode(v)]),
    ),
  );
}
function cluster(vals, tol) {
  const groups = [];
  for (const v of vals.sort((a, b) => a - b)) {
    let g = groups.at(-1);
    if (!g || v - g.mean > tol) groups.push((g = { vals: [], mean: v }));
    g.vals.push(v);
    g.mean = g.vals.reduce((a, b) => a + b, 0) / g.vals.length;
  }
  return groups.map((g) => g.mean);
}
export function reconstructTable(words, { width, height } = {}) {
  if (
    !Array.isArray(words) ||
    words.length === 0 ||
    words.length > MAX ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new TypeError("Invalid input or resource bounds");
  for (const w of words) {
    const b = w?.bbox;
    if (
      typeof w?.text !== "string" ||
      !Number.isFinite(w.confidence) ||
      w.confidence < 0 ||
      w.confidence > 100 ||
      !b ||
      ![b.x0, b.y0, b.x1, b.y1].every(Number.isFinite) ||
      b.x0 < 0 ||
      b.y0 < 0 ||
      b.x1 <= b.x0 ||
      b.y1 <= b.y0 ||
      b.x1 > width ||
      b.y1 > height
    )
      throw new TypeError("Invalid word bounds");
  }
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const lineHeight = median(words.map((w) => w.bbox.y1 - w.bbox.y0));
  let hs = cluster(
    words.map((w) => (w.bbox.y0 + w.bbox.y1) / 2),
    Math.max(4, lineHeight * 0.45),
  );
  const sorted = [...words].sort((a, b) => a.bbox.x0 - b.bbox.x0),
    xs = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].bbox.x0 - sorted[i - 1].bbox.x1;
    if (gap > Math.max(16, width * 0.035))
      xs.push((sorted[i].bbox.x0 + sorted[i - 1].bbox.x1) / 2);
  }
  const cuts = cluster(xs, Math.max(8, width * 0.015)),
    cols = cuts.length + 1;
  const column = (w) => {
    const i = cuts.findIndex((c) => w.bbox.x0 < c);
    return i < 0 ? cuts.length : i;
  };
  const nearest = (centers, y) =>
    centers.reduce(
      (best, v, i) =>
        Math.abs(v - y) < Math.abs(centers[best] - y) ? i : best,
      0,
    );
  // A wrapped description may create a short line above/below a data row.
  // Attach only nearby one-column lines to rows supported by multiple columns;
  // retain distant sparse rows rather than inventing missing cell contents.
  const occupied = hs.map(() => new Set());
  for (const w of words)
    occupied[nearest(hs, (w.bbox.y0 + w.bbox.y1) / 2)].add(column(w));
  const anchors = hs.filter((_, i) => occupied[i].size >= 2);
  if (anchors.length >= 2)
    hs = hs.filter(
      (y, i) =>
        occupied[i].size >= 2 ||
        Math.abs(anchors[nearest(anchors, y)] - y) > lineHeight * 1.35,
    );
  if (hs.length < 2 || cols < 2)
    throw new Error("Insufficient tabular structure to reconstruct a table");
  if (hs.length * cols > MAX)
    throw new RangeError("Grid exceeds resource limit");
  const rows = hs.map(() => Array(cols).fill("")),
    boxes = hs.map(() => Array(cols).fill(null)),
    confidences = hs.map(() => Array(cols).fill(0));
  for (const w of [...words].sort(
    (a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0,
  )) {
    const y = nearest(hs, (w.bbox.y0 + w.bbox.y1) / 2),
      x = column(w),
      prior = boxes[y][x];
    rows[y][x] += (rows[y][x] ? " " : "") + w.text;
    confidences[y][x] = prior
      ? Math.min(confidences[y][x], w.confidence)
      : w.confidence;
    boxes[y][x] = prior
      ? {
          x0: Math.min(prior.x0, w.bbox.x0),
          y0: Math.min(prior.y0, w.bbox.y0),
          x1: Math.max(prior.x1, w.bbox.x1),
          y1: Math.max(prior.y1, w.bbox.y1),
        }
      : { ...w.bbox };
  }
  return {
    rows,
    boxes,
    confidences,
    warnings: [
      "Table structure is inferred from text positions. Review row and column alignment; merged cells are not reconstructed.",
      ...(rows.some((row) => row.filter(Boolean).length === 1)
        ? [
            "Sparse or wrapped rows were kept separate. Check row alignment; the exported sheet may need row cleanup.",
          ]
        : []),
    ],
  };
}
