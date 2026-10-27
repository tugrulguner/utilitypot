import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import {
  tableTSV,
  tableCSV,
  tableXLSX,
  reconstructTable,
} from "./screenshot-table.js";

test("clipboard refuses embedded cell delimiters in both formula modes instead of ambiguous quoting", () => {
  for (const protectFormulas of [true, false])
    for (const value of ["a\tb", "a\nb", "\r=2"])
      assert.throws(
        () => tableTSV([[value]], { protectFormulas }),
        /Download XLSX|clipboard.*line breaks/i,
      );
  assert.equal(
    tableCSV([["a\tb", "a\nb"]], { protectFormulas: false }),
    '"a\tb","a\nb"',
  );
});

test("XLSX fallback escapes carriage returns so XML parsing does not normalize them", () => {
  const xml = strFromU8(
    unzipSync(tableXLSX([["\r=2", "x\ny"]]))["xl/worksheets/sheet1.xml"],
  );
  assert.ok(xml.includes("&#13;=2"));
  assert.ok(!xml.includes("\r"));
  assert.ok(xml.includes("x\ny"));
});

test("ambiguous wrapped versus sparse lines remain intact with an explicit row-cleanup warning", () => {
  const w = (text, x, y) => ({
    text,
    confidence: 95,
    bbox: { x0: x, y0: y, x1: x + 40, y1: y + 10 },
  });
  const input = [
    w("A", 0, 0),
    w("B", 150, 0),
    w("wrapped", 0, 40),
    w("value", 0, 60),
    w("y", 150, 60),
    w("next", 0, 120),
    w("z", 150, 120),
  ];
  const got = reconstructTable(input, { width: 250, height: 150 });
  assert.deepEqual(got.rows, [
    ["A", "B"],
    ["wrapped", ""],
    ["value", "y"],
    ["next", "z"],
  ]);
  assert.ok(got.warnings.some((w) => /wrapped.*separate|sparse.*row/i.test(w)));
});
