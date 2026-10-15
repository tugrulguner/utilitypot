import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDates } from "./dates.js";
test("date cleanup preserves ambiguity, precision and invalidity instead of guessing", () => {
  assert.deepEqual(
    normalizeDates("03/04/2026\n2026-02\n2025-02-29\n25/03/2026", "auto").map(
      (r) => [r.normalized, r.status],
    ),
    [
      ["", "review"],
      ["2026-02", "partial"],
      ["", "invalid"],
      ["2026-03-25", "converted"],
    ],
  );
  assert.equal(
    normalizeDates("03/04/2026", "day-first")[0].normalized,
    "2026-04-03",
  );
});
test("unambiguous day-first and month-first values work in auto, partial year 0000 is invalid", () => {
  assert.equal(
    normalizeDates("03/25/2026", "auto")[0].normalized,
    "2026-03-25",
  );
  assert.equal(
    normalizeDates("12/12/2026", "auto")[0].normalized,
    "2026-12-12",
  );
  assert.equal(normalizeDates("0000", "auto")[0].status, "invalid");
  assert.equal(
    normalizeDates("February 29, 2024", "auto")[0].normalized,
    "2024-02-29",
  );
});
test("wholly empty dates are rejected while blank lines in data remain rows", () => {
  assert.throws(() => normalizeDates("  \n\r\n"), /Enter at least one date/);
  assert.deepEqual(
    normalizeDates("2026-01-02\n\n2026-01-03").map((x) => x.status),
    ["converted", "empty", "converted"],
  );
});
