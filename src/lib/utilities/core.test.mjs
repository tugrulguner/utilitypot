import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv,
  transformCsv,
  templatePaths,
  createCsvInterpretation,
} from "./csv.js";

test("groups CSV children under a reviewed parent mapping without coercing identifiers", () => {
  const csv =
    "Customer,Name,SKU,Qty\n001,Ada,A01,2\n001,Ada,A02,3\n002,Lin,B01,1";
  const rows = parseCsv(csv);
  const result = transformCsv(rows, {
    groupBy: "Customer",
    fields: [
      { path: "id", column: "Customer" },
      { path: "name", column: "Name" },
      { path: "items[].sku", column: "SKU" },
      { path: "items[].quantity", column: "Qty" },
    ],
  });
  assert.deepEqual(result, [
    {
      id: "001",
      name: "Ada",
      items: [
        { sku: "A01", quantity: "2" },
        { sku: "A02", quantity: "3" },
      ],
    },
    { id: "002", name: "Lin", items: [{ sku: "B01", quantity: "1" }] },
  ]);
});
test("CSV parsing respects quoted commas and rejects duplicate headers", () => {
  assert.equal(parseCsv('id,note\n001,"a,b"')[0].note, "a,b");
  assert.throws(() => parseCsv("id,id\n1,2"), /duplicate/);
});
test("mapping rejects prototype pollution and parent/child conflicts", () => {
  assert.throws(
    () => templatePaths(JSON.parse('{"__proto__":{"polluted":"yes"}}')),
    /safe/,
  );
  assert.throws(
    () =>
      transformCsv(parseCsv("id,name\n1,A\n1,B"), {
        groupBy: "id",
        fields: [{ path: "name", column: "name" }],
      }),
    /Conflicting/,
  );
  assert.throws(
    () =>
      transformCsv(parseCsv("id,name\n1,A"), {
        groupBy: "id",
        fields: [
          { path: "items", column: "name" },
          { path: "items[].id", column: "id" },
        ],
      }),
    /conflict/i,
  );
  assert.equal({}.polluted, undefined);
});
test("AI mapping spec only accepts a small sample and decodes actual chosen columns", () => {
  const spec = createCsvInterpretation({
    csv: "ID,Name\n001,Ada",
    example: '{"customer":"001"}',
    instructions: "ID is customer",
  });
  assert.equal(spec.questions.field0.criteria.c0, "ID");
  assert.equal(
    spec.decode({ field0: { choice: "c0" }, group: { choice: "none" } })
      .fields[0].column,
    "ID",
  );
  assert.throws(
    () =>
      createCsvInterpretation({
        csv: "ID\n1\n2\n3\n4\n5\n6",
        example: '{"id":"1"}',
        instructions: "",
      }),
    /five/,
  );
});
