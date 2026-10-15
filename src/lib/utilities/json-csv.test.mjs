import test from "node:test";
import assert from "node:assert/strict";
import { jsonToCsv, createJsonCsvInterpretation } from "./json-csv.js";
test("single-object AI selection remains a complete server-owned interpretation", () => {
  const spec = createJsonCsvInterpretation({
    sample: '{"id":"001","name":"Ada"}',
    instructions: "Use this object as one row",
  });
  assert.ok(spec.questions);
  assert.equal(
    spec.questions.rows.criteria.$object,
    "Entire object as one row",
  );
  assert.deepEqual(
    spec.decode({ rows: { choice: "$object" }, arrays: { choice: "reject" } }),
    { path: "$object", arrays: "reject", needsReview: true },
  );
});
test("nested arrays cannot disappear when no explicit policy is supplied", () => {
  assert.throws(
    () => jsonToCsv({ id: "001", tags: ["alpha"] }, "$object"),
    /Nested array at tags/,
  );
});

test("JSON to CSV flattens reviewed records and protects spreadsheet formula cells", () => {
  const data = {
    orders: [
      { id: "001", customer: { name: "Ada" }, note: "=1+1" },
      { id: "002", customer: { name: "Lin" }, note: "ok" },
    ],
  };
  const csv = jsonToCsv(data, "orders", "omit");
  assert.match(csv, /customer.name/);
  assert.match(csv, /001/);
  assert.match(csv, /'=1\+1/);
  const spec = createJsonCsvInterpretation({
    sample: JSON.stringify(data),
    instructions: "One row per order",
  });
  assert.equal(spec.questions.rows.criteria.orders, "orders");
});
test("single JSON object becomes one explicit CSV row without model interpretation", () => {
  const result = createJsonCsvInterpretation({
    sample: '{"id":"001","name":"Ada"}',
    instructions: "",
  });
  assert.equal(result.state.path, "$object");
  assert.equal(result.state.arrays, "reject");
  assert.equal(
    jsonToCsv(result.state.data, "$object", "reject"),
    `id,name\r\n001,Ada`,
  );
});
test("nested arrays report precise paths and stay reject-by-default", () => {
  const spec = createJsonCsvInterpretation({
    sample: '{"id":"001","items":[1,2]}',
    instructions: "",
  });
  assert.deepEqual(spec.state.nestedArrayPaths, ["items"]);
  assert.equal(spec.state.arrays, "reject");
});
