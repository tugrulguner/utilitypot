import test from "node:test";
import assert from "node:assert/strict";
import { jsonToCsv, createJsonCsvInterpretation } from "./json-csv.js";
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
