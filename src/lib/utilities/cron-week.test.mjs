import test from "node:test";
import assert from "node:assert/strict";
import { explainCron } from "./cron.js";

const base = {
  expression: "0 0 * * *",
  scheduleZone: "UTC",
  displayZone: "UTC",
};
test("week dates leave the exclusive end in the supported four-digit calendar", () => {
  assert.throws(
    () => explainCron({ ...base, weekStart: "9999-12-25" }),
    /Week starting.*9999-12-24/i,
  );
  assert.equal(
    explainCron({ ...base, weekStart: "9999-12-24" }).preview.endDate,
    "9999-12-31",
  );
});
