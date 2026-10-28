import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { readFile } from "node:fs/promises";
import { readXlsx } from "./xlsx-reader.js";

test("an unused blank worksheet does not block a valid selected worksheet", async () => {
  const sheets =
    '<workbook xmlns:r="x"><sheets><sheet name="Empty" r:id="a"/><sheet name="Data" r:id="b"/></sheets></workbook>';
  const bytes = book({
    "xl/workbook.xml": sheets,
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="a" Target="worksheets/a.xml"/><Relationship Id="b" Target="worksheets/b.xml"/></Relationships>',
    "xl/worksheets/a.xml": "<worksheet><sheetData/></worksheet>",
    "xl/worksheets/b.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c></row></sheetData></worksheet>',
  });
  const out = await readXlsx(bytes);
  assert.equal(out.sheets.length, 2);
  assert.deepEqual(out.sheets[0].rows, []);
  assert.equal(out.sheets[1].rows[0][0], "id");
});

function book(files) {
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])),
  );
}
function fixture(
  sheetXml = '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Header</t></is></c></row></sheetData></worksheet>',
  workbook = '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventory" sheetId="1" r:id="rId1"/></sheets></workbook>',
  rel = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
) {
  return book({
    "xl/workbook.xml": workbook,
    "xl/_rels/workbook.xml.rels": rel,
    "xl/worksheets/sheet1.xml": sheetXml,
  });
}

test("reads independent before/after real XLSX fixtures and named sheets", async () => {
  for (const filename of ["before.xlsx", "after.xlsx"]) {
    const out = await readXlsx(
      new Uint8Array(
        await readFile(
          new URL(
            `../../../tests/fixtures/compare-${filename}`,
            import.meta.url,
          ),
        ),
      ),
    );
    assert.equal(out.sheets[0].name, "Other");
    assert.equal(out.sheets[1].name, "Inventory");
    const joined = JSON.stringify(out.sheets[1].rows);
    assert.match(joined, /000123/);
    assert.match(joined, /900719925474099312345/);
    assert.match(joined, /=SUM\(C2:C3\)/);
  }
});
test("preserves shared rich text, large numeric lexemes and formula text", async () => {
  const b = book({
    "xl/workbook.xml":
      '<workbook xmlns:r="x"><sheets><sheet name="Inventory" r:id="r1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml":
      "<sst><si><r><t>SKU</t></r><r><t> Name</t></r><rPh><t>discard</t></rPh></si><si><t>000123</t></si></sst>",
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>900719925474099312345</v></c><c r="C2"><f>SUM(C2:C3)</f><v>7</v></c></row></sheetData></worksheet>',
  });
  const out = await readXlsx(b);
  assert.deepEqual(out.sheets[0].rows, [
    ["SKU Name"],
    ["000123", "900719925474099312345", "=SUM(C2:C3)"],
  ]);
});
test("rejects malformed ZIP and invalid UTF-8", async () => {
  await assert.rejects(readXlsx(new Uint8Array([1, 2, 3])));
  const { unzipSync } = await import("fflate");
  const files = unzipSync(fixture());
  // Corrupt required XML bytes, not a timestamp or arbitrary compressed byte.
  files["xl/workbook.xml"] = new Uint8Array([0xff]);
  await assert.rejects(readXlsx(zipSync(files)), /encoded data|UTF-8/i);
});
test("rejects DOCTYPE, external worksheet relationships and inconsistent cell references", async () => {
  await assert.rejects(
    readXlsx(
      book({
        "xl/workbook.xml": '<!DOCTYPE x [<!ENTITY a "x">]><workbook/>',
        "xl/_rels/workbook.xml.rels": "<Relationships/>",
      }),
    ),
    /DOCTYPE/,
  );
  await assert.rejects(
    readXlsx(
      fixture(
        undefined,
        undefined,
        '<Relationships><Relationship Id="rId1" Target="https://evil.test/x"/></Relationships>',
      ),
    ),
    /relationship/,
  );
  await assert.rejects(
    readXlsx(
      fixture(
        '<worksheet><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>H</t></is></c><c r="A1"><v>1</v></c></row></sheetData></worksheet>',
      ),
    ),
    /inconsistent/,
  );
});
test("rejects shared and array formulas instead of using cached values", async () => {
  for (const type of ["shared", "array"])
    await assert.rejects(
      readXlsx(
        fixture(
          `<worksheet><sheetData><row r="1"><c r="A1"><f t="${type}">A1</f><v>cached</v></c></row></sheetData></worksheet>`,
        ),
      ),
      /unsupported formula/,
    );
});
test("rejects worksheet cells outside bounded references", async () => {
  await assert.rejects(
    readXlsx(
      fixture(
        '<worksheet><sheetData><row r="1"><c r="XFE1" t="inlineStr"><is><t>H</t></is></c></row></sheetData></worksheet>',
      ),
    ),
    /limit/,
  );
});

test("accepts package-absolute worksheet targets used by ordinary XLSX writers", async () => {
  const out = await readXlsx(
    fixture(
      undefined,
      undefined,
      '<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/></Relationships>',
    ),
  );
  assert.equal(out.sheets[0].rows[0][0], "Header");
});

test("CDATA inline cell changes retain their literal content", async () => {
  const make = (value) =>
    fixture(
      `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c><c r="B1" t="inlineStr"><is><t>value</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>1</t></is></c><c r="B2" t="inlineStr"><is><t><![CDATA[${value}]]></t></is></c></row></sheetData></worksheet>`,
    );
  const before = await readXlsx(make("old")),
    after = await readXlsx(make("new"));
  assert.equal(before.sheets[0].rows[1][1], "old");
  assert.equal(after.sheets[0].rows[1][1], "new");
});

test("omitted XLSX cells stay missing independently of later cells", async () => {
  const { tableFromRows, compareTables } =
    await import("./spreadsheet-diff.js");
  const make = (extra) =>
    fixture(
      `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c><c r="B1" t="inlineStr"><is><t>value</t></is></c><c r="C1" t="inlineStr"><is><t>extra</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>1</t></is></c>${extra}</row></sheetData></worksheet>`,
    );
  const a = tableFromRows(
      (await readXlsx(make('<c r="C2"><v>7</v></c>'))).sheets[0].rows,
    ),
    b = tableFromRows((await readXlsx(make(""))).sheets[0].rows);
  assert.equal(a.rows[0].value, null);
  assert.equal(b.rows[0].value, null);
  assert.deepEqual(compareTables(a, b, "id").rows[0].changes, [
    { column: "extra", before: "7", after: null },
  ]);
  const blank = tableFromRows(
    (await readXlsx(make('<c r="B2" t="inlineStr"><is><t/></is></c>')))
      .sheets[0].rows,
  );
  assert.equal(blank.rows[0].value, "");
  assert.deepEqual(compareTables(b, blank, "id").rows[0].changes, [
    { column: "value", before: null, after: "" },
  ]);
});

test("SpreadsheetML text escapes decode exactly once per text element", async () => {
  const { unzipSync } = await import("fflate");
  const cases = [
    ["left_x000D_right", "left\rright"],
    ["_x005F_x000D_", "_x000D_"],
    ["_x005F__x000D_", "_\r"],
    ["_xD83D__xDE00_", "😀"],
    ["_x0030_00123", "000123"],
  ];
  for (const [encoded, expected] of cases)
    for (const type of ["inlineStr", "s", "str"]) {
      const value =
        type === "inlineStr"
          ? `<is><t>${encoded}</t></is>`
          : `<v>${type === "s" ? "0" : encoded}</v>`;
      const files = unzipSync(
        fixture(
          `<worksheet><sheetData><row r="1"><c r="A1" t="${type}">${value}</c></row></sheetData></worksheet>`,
        ),
      );
      files["xl/sharedStrings.xml"] = strToU8(
        `<sst><si><t>${encoded}</t></si></sst>`,
      );
      const out = await readXlsx(zipSync(files));
      assert.equal(out.sheets[0].rows[0][0], expected, `${type}: ${encoded}`);
    }
  const out = await readXlsx(
    fixture(
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><r><t>_x00</t></r><r><t>0D_</t></r></is></c></row></sheetData></worksheet>',
    ),
  );
  assert.equal(
    out.sheets[0].rows[0][0],
    "_x000D_",
    "separate rich-text runs must not synthesize an escape",
  );
});
