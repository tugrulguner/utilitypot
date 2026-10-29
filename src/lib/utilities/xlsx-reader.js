import { Unzip, UnzipInflate } from "fflate";
import { parseDocument } from "htmlparser2";

const MAX_INPUT = 5 * 1024 * 1024,
  MAX_ENTRIES = 200,
  MAX_TOTAL = 20 * 1024 * 1024,
  MAX_ENTRY = 8 * 1024 * 1024,
  MAX_TEXT = 2 * 1024 * 1024;
const dec = new TextDecoder("utf-8", { fatal: true });
const fail = (m) => {
  throw new Error(`Invalid XLSX: ${m}`);
};
function children(node, name) {
  return (node?.children || []).filter(
    (x) => x.type === "tag" && x.name === name,
  );
}
function first(node, name) {
  return children(node, name)[0];
}
function text(node) {
  let s = "";
  const walk = (n) => {
    if (n.type === "text") s += n.data;
    else if (
      (n.type === "tag" || n.type === "cdata") &&
      n.name !== "rPh" &&
      n.name !== "phoneticPr"
    )
      for (const c of n.children || []) walk(c);
  };
  if (node) walk(node);
  return s;
}
function decodeString(value) {
  // A single pass preserves escaped literal underscores (_x005F_x000D_).
  return value.replace(/_x([0-9a-fA-F]{4})_/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}
function richString(node) {
  const plain = children(node, "t");
  const parts = plain.length
    ? plain
    : children(node, "r").flatMap((run) => children(run, "t"));
  // Decode each logical text element before joining distinct rich-text runs.
  return parts.map((part) => decodeString(text(part))).join("");
}
function xml(src) {
  if (/<!DOCTYPE|<!ENTITY/i.test(src)) fail("DOCTYPE/ENTITY forbidden");
  const doc = parseDocument(src, { xmlMode: true, decodeEntities: true });
  return (doc.children || []).find((x) => x.type === "tag") || doc;
}
function normTarget(base, target) {
  if (
    !target ||
    target.startsWith("//") ||
    target.includes("\\") ||
    /^[a-z][a-z\d+.-]*:/i.test(target)
  )
    fail("external/invalid relationship");
  const p = [];
  for (const x of (target.startsWith("/") ? target : `${base}/${target}`).split(
    "/",
  )) {
    if (x === "..") {
      if (!p.length) fail("relationship escapes package");
      p.pop();
    } else if (x && x !== ".") p.push(x);
  }
  return p.join("/");
}
function colIndex(ref) {
  const m = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,5})$/i.exec(ref || "");
  if (!m) fail("invalid cell reference");
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64;
  const r = Number(m[2]);
  if (c > 500 || r > 10000) fail("cell reference limit");
  return [r - 1, c - 1];
}
function val(cell, shared) {
  const f = first(cell, "f");
  if (f) {
    if (f.attribs.t === "shared" || f.attribs.t === "array")
      fail("unsupported formula type");
    return `=${text(f)}`;
  }
  const typ = cell.attribs.t;
  if (typ === "inlineStr") return richString(first(cell, "is"));
  const v = first(cell, "v");
  if (!v) return "";
  const raw = text(v);
  if (typ === "s") {
    const i = Number(raw);
    if (!Number.isInteger(i) || i < 0 || i >= shared.length)
      fail("bad shared string index");
    return shared[i];
  }
  if (typ === "str") return decodeString(raw);
  if (typ === "b") return raw;
  if (typ === "e") return raw;
  return raw;
}
export async function readXlsx(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 22 ||
    bytes.length > MAX_INPUT
  )
    fail("input size/type");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) fail("not ZIP");
  const entries = new Map();
  let total = 0,
    count = 0,
    error;
  await new Promise((resolve, reject) => {
    const uz = new Unzip((file) => {
      if (++count > MAX_ENTRIES) {
        error = new Error("entry limit");
        return;
      }
      if (
        file.name.length > 512 ||
        entries.has(file.name) ||
        !Number.isSafeInteger(file.size) ||
        !Number.isSafeInteger(file.originalSize) ||
        file.size < 0 ||
        file.originalSize < 0 ||
        file.size > MAX_INPUT ||
        file.originalSize > MAX_ENTRY
      ) {
        error = new Error("entry metadata limit or duplicate");
        return;
      }
      if (
        file.name.startsWith("/") ||
        file.name.split("/").includes("..") ||
        file.name.includes("\\")
      ) {
        error = new Error("unsafe path");
        return;
      }
      let chunks = [],
        size = 0;
      file.ondata = (err, data, final) => {
        if (err) {
          error = err;
          return;
        }
        size += data.length;
        total += data.length;
        if (size > MAX_ENTRY || total > MAX_TOTAL) {
          error = new Error("inflated size limit");
          return;
        }
        chunks.push(data);
        if (final) entries.set(file.name, concat(chunks, size));
      };
      if (file.compression === 0) file.start();
      else if (file.compression === 8) file.start();
      else error = new Error("unsupported compression");
    });
    uz.register(UnzipInflate);
    try {
      for (let i = 0; i < bytes.length; i += 16384) {
        if (error) break;
        uz.push(
          bytes.subarray(i, Math.min(i + 16384, bytes.length)),
          i + 16384 >= bytes.length,
        );
      }
      if (error) reject(error);
      else resolve();
    } catch (e) {
      reject(e);
    }
  });
  if (error) throw error;
  const get = (p, required = true) => {
    const b = entries.get(p);
    if (!b && required) fail(`missing ${p}`);
    return b ? dec.decode(b) : "";
  };
  const relDoc = xml(get("xl/_rels/workbook.xml.rels"));
  const rels = new Map();
  for (const r of children(relDoc, "Relationship")) {
    if (r.attribs.TargetMode === "External") fail("external relationship");
    rels.set(r.attribs.Id, normTarget("xl", r.attribs.Target));
  }
  const wb = xml(get("xl/workbook.xml")),
    sheetNodes = children(first(wb, "sheets"), "sheet");
  if (!sheetNodes.length) fail("no worksheets");
  const shared = [];
  const ss = get("xl/sharedStrings.xml", false);
  if (ss) for (const si of children(xml(ss), "si")) shared.push(richString(si));
  const sheets = [];
  let allocated = 0,
    textTotal = 0;
  for (const sn of sheetNodes) {
    const name = sn.attribs.name || "";
    if (!name || name.length > 128) fail("invalid sheet name");
    const path = rels.get(sn.attribs["r:id"]);
    if (!path) fail("unresolved worksheet");
    if (!/\/worksheets\//.test(path)) fail("worksheet relationship target");
    const doc = xml(get(path));
    const rowNodes = children(first(doc, "sheetData"), "row");
    let rows = [];
    for (const rn of rowNodes) {
      const rnAttr = rn.attribs.r;
      if (rnAttr && (!/^[1-9]\d{0,4}$/.test(rnAttr) || Number(rnAttr) > 10000))
        fail("invalid row reference");
      let maxRow = rnAttr ? Number(rnAttr) - 1 : rows.length;
      if (maxRow >= 10000) fail("row limit");
      while (rows.length <= maxRow) {
        allocated++;
        if (allocated > 200000) fail("cell limit");
        rows.push([]);
      }
      let previous = -1;
      for (const c of children(rn, "c")) {
        const [ri, ci] = colIndex(c.attribs.r);
        if (ri !== maxRow || ci <= previous)
          fail("inconsistent cell reference");
        previous = ci;
        const v = val(c, shared);
        textTotal += v.length;
        if (textTotal > MAX_TEXT) fail("text limit");
        while (rows[maxRow].length <= ci) {
          allocated++;
          if (allocated > 200000) fail("cell limit");
          rows[maxRow].push(null);
        }
        rows[maxRow][ci] = v;
      }
    }
    sheets.push({ name, rows });
  }
  return { sheets };
}
function concat(chunks, n) {
  const out = new Uint8Array(n);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
