import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  reconstructTable,
  tableTSV,
  tableCSV,
  tableXLSX,
} from "./screenshot-table.js";

test("reconstructs spaced rows and columns, preserving strings and gaps", () => {
  const w = (text, x0, y0, x1 = x0 + 20, y1 = y0 + 10) => ({
    text,
    confidence: 0.9,
    bbox: { x0, y0, x1, y1 },
  });
  const got = reconstructTable(
    [
      w("Name", 0, 0, 40),
      w("Code", 100, 0),
      w("Ada", 0, 30),
      w("007", 100, 30),
    ],
    { width: 150, height: 60 },
  );
  assert.deepEqual(got.rows, [
    ["Name", "Code"],
    ["Ada", "007"],
  ]);
  assert.equal(got.boxes[1][1].x0, 100);
});

test("rejects paragraph-like structure and invalid bounds", () => {
  const w = (text, y) => ({
    text,
    confidence: 1,
    bbox: { x0: 0, y0: y, x1: 30, y1: y + 8 },
  });
  assert.throws(
    () =>
      reconstructTable([w("one", 0), w("two", 30)], { width: 100, height: 50 }),
    /tabular/i,
  );
  assert.throws(
    () =>
      reconstructTable(
        [{ ...w("x", 0), bbox: { x0: -1, y0: 0, x1: 2, y1: 2 } }],
        { width: 100, height: 50 },
      ),
    /bounds/i,
  );
});

test("exports text safely and protects formulas by default", () => {
  const rows = [
    ["001", " =1+1", "a,b", "x\ny"],
    ["中文", "-4", "@cmd", ""],
  ];
  assert.match(tableTSV(rows), /^001\t' =1\+1\t"a,b"\t"x\ny"/);
  assert.match(tableCSV(rows), /"001","' =1\+1","a,b","x\ny"/);
  assert.equal(tableCSV([[" =1+1"]], { protectFormulas: false }), '" =1+1"');
});

test("writes valid string-only xlsx archive", async () => {
  const { unzipSync } = await import("fflate");
  const bytes = tableXLSX([
    ["001", "中文"],
    ["=1+1", "line\nbreak"],
  ]);
  assert.ok(bytes instanceof Uint8Array);
  const files = unzipSync(bytes);
  const xml = new TextDecoder().decode(files["xl/worksheets/sheet1.xml"]);
  assert.match(xml, /inlineStr/);
  assert.match(xml, /001/);
  assert.match(xml, /=1\+1/);
  assert.doesNotMatch(xml, /<f>/);
});

test("rejects empty, oversized and XML-invalid tables", () => {
  assert.throws(() => tableCSV([]), /empty/i);
  assert.throws(() => tableCSV([["\u0001"]]), /XML|control/i);
});

test("captured real OCR wrapped descriptions stay in their table rows", async () => {
  const input = JSON.parse(
    await readFile(
      new URL(
        "../../../tests/fixtures/wrapped-table-ocr.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const got = reconstructTable(input.words, {
    width: input.width,
    height: input.height,
  });
  assert.equal(got.rows.length, 4);
  assert.equal(got.rows[1][1], "Annual software renewal");
  assert.equal(got.rows[3][1], "Support services");
  assert.equal(got.rows[2][1], "");
});

test("cell confidence is the weakest contributing word, not just the first", () => {
  const words = [
    { text: "Unit", confidence: 98, bbox: { x0: 100, y0: 0, x1: 130, y1: 10 } },
    {
      text: "price",
      confidence: 32,
      bbox: { x0: 132, y0: 0, x1: 160, y1: 10 },
    },
    { text: "Code", confidence: 95, bbox: { x0: 0, y0: 0, x1: 30, y1: 10 } },
    { text: "001", confidence: 95, bbox: { x0: 0, y0: 30, x1: 30, y1: 40 } },
    { text: "12", confidence: 95, bbox: { x0: 100, y0: 30, x1: 120, y1: 40 } },
  ];
  const got = reconstructTable(words, { width: 200, height: 60 });
  assert.equal(got.confidences[0][1], 32);
});

test("exports refuse oversized cells and XML-invalid Unicode rather than losing data", () => {
  assert.throws(() => tableXLSX([["x".repeat(32768)]]), /limit|large|32767/i);
  assert.throws(() => tableXLSX([["\ud800"]]), /Unicode|XML/i);
  assert.throws(() => tableXLSX([["\uffff"]]), /Unicode|XML/i);
});
