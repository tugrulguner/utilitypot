import test from "node:test";
import assert from "node:assert/strict";
import { presentCronRun } from "./cron-presentation.js";
test("same zone has one UTC offset and no repeated comparison", () => {
  const v = presentCronRun("2026-03-06T00:30:00Z", "UTC", "UTC");
  assert.equal(v.offset, "UTC+00:00");
  assert.equal(v.schedule, null);
  assert.equal(v.clock, "00:30");
});
test("repeated wall times keep distinct offsets without duplicated abbreviations", () => {
  const a = presentCronRun("2026-11-01T05:30:00Z", "America/New_York", "UTC"),
    b = presentCronRun("2026-11-01T06:30:00Z", "America/New_York", "UTC");
  assert.equal(a.clock, "01:30");
  assert.equal(b.clock, "01:30");
  assert.equal(a.offset, "UTC-04:00");
  assert.equal(b.offset, "UTC-05:00");
});
test("schedule comparison retains a different local date across day boundaries", () => {
  const run = presentCronRun(
    "2026-03-06T00:30:00.000Z",
    "Asia/Tokyo",
    "America/Los_Angeles",
  );
  assert.equal(run.date, "Fri, Mar 6, 2026");
  assert.equal(run.clock, "09:30");
  assert.equal(run.offset, "UTC+09:00");
  assert.equal(run.schedule, "Thu, Mar 5, 2026 · 16:30 UTC-08:00");
});
