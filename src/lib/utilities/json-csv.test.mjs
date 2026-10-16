import test from "node:test";
import assert from "node:assert/strict";
import { jsonToCsv, createJsonCsvInterpretation } from "./json-csv.js";
test("raw JSON refuses numeric values that native parsing would round", () => {
  for (const sample of [
    '[{"transactionId":9007199254740993}]',
    "[1e-4000]",
    "[1e309]",
    "[0.1234567890123456789]",
  ]) {
    assert.throws(
      () => createJsonCsvInterpretation({ sample, instructions: "" }),
      /quote identifiers or high-precision values/i,
    );
  }
  assert.equal(
    createJsonCsvInterpretation({
      sample: '[{"id":"9007199254740993","x":0.10,"y":1e2}]',
      instructions: "",
    }).state.sample[0].id,
    "9007199254740993",
  );
  assert.throws(
    () => createJsonCsvInterpretation({ sample: '[{"x":]', instructions: "" }),
    /valid JSON/,
  );
});

test("zero with an exponent is not mistaken for nonzero underflow", () => {
  for (const token of ["0e12", "-0.000e-999999", "0.10", "1.2300e2"]) {
    assert.doesNotThrow(() =>
      createJsonCsvInterpretation({
        sample: `[{"value":${token}}]`,
        instructions: "",
      }),
    );
  }
});

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

test("fresh UX: array question references instructions and contrasts JSON serialization with omission", () => {
  const instructions = "Keep tags as JSON text in one cell";
  const spec = createJsonCsvInterpretation({
    sample: '{"orders":[{"id":"0008","tags":["gift"],"paid":false}]}',
    instructions,
  });
  assert.equal(spec.state.instructions, instructions);
  assert.equal(typeof spec.questions.arrays.instructions, "object");
  assert.match(spec.questions.arrays.instructions.question, /`instructions`/);
  assert.equal(typeof spec.questions.arrays.criteria.join, "object");
  assert.match(spec.questions.arrays.criteria.join.not_for, /concatenat/i);
  assert.match(spec.questions.arrays.criteria.reject.not_for, /explicit/i);
  for (const policy of ["join", "omit", "reject"]) {
    assert.equal(
      spec.decode({ rows: { choice: "orders" }, arrays: { choice: policy } })
        .arrays,
      policy,
    );
  }
});
