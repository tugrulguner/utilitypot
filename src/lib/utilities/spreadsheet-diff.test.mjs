import test from "node:test";
import assert from "node:assert/strict";
import { compareTables, parseCsv } from "./spreadsheet-diff.js";

test("CSV preserves exact string keys and compares by header name", () => {
  const a = parseCsv("id,name\n001,A\n9007199254740993,B");
  const b = parseCsv("name,id\nB,9007199254740993\nC,002");
  const result = compareTables(a, b, "id");
  assert.deepEqual(result.counts, {
    added: 1,
    removed: 1,
    changed: 0,
    unchanged: 1,
  });
  assert.equal(result.rows.find((row) => row.key === "002").status, "added");
});

test("blank and duplicate keys and headers are rejected", () => {
  assert.throws(() => parseCsv("x,x\n1,2"), /header/i);
  assert.throws(
    () =>
      compareTables(
        { headers: ["id"], rows: [{ id: "" }] },
        parseCsv("id\n1"),
        "id",
      ),
    /key/i,
  );
});

test("diff represents added columns and null distinct from empty string", () => {
  const result = compareTables(
    parseCsv("id,v\n1,"),
    parseCsv("id,w\n1,x"),
    "id",
  );
  assert.deepEqual(result.columns.added, ["w"]);
  assert.deepEqual(result.columns.removed, ["v"]);
  assert.equal(result.rows[0].status, "changed");
});
