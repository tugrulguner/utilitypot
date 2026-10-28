import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv,
  compareTables,
  exportCsv,
  csvSafe,
} from "./spreadsheet-diff.js";

test("added and removed rows export their actual values, including missing versus empty", () => {
  const diff = compareTables(
    parseCsv("id,name\n001,Notebook"),
    parseCsv("id,name\n002,Desk lamp"),
    "id",
  );
  assert.ok(exportCsv(diff).includes("Notebook"));
  assert.ok(exportCsv(diff).includes("Desk lamp"));
  assert.equal(diff.rows.find((r) => r.key === "001").before.name, "Notebook");
  assert.equal(diff.rows.find((r) => r.key === "002").after.name, "Desk lamp");
});
test("explicit empty CSV records are not silently discarded as trailing whitespace", () => {
  const before = parseCsv("id,v\n001,A\n,");
  assert.throws(
    () => compareTables(before, parseCsv("id,v\n001,A"), "id"),
    /blank/i,
  );
});

test("CSV formula protection includes leading whitespace and retains null presence flags", () => {
  assert.equal(csvSafe("  =1+1"), "'  =1+1");
  const diff = compareTables(parseCsv("id,v\n1,"), parseCsv("id,w\n1,x"), "id");
  assert.ok(exportCsv(diff).includes("before_present"));
});
