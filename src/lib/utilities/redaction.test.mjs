import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRectangle, MAX_REDACTIONS } from "./redaction.js";
test("rounds rectangle bounds outward and clamps to image pixels", () => {
  assert.deepEqual(
    normalizeRectangle({ x: 8.8, y: 7.4, width: -4.2, height: -3.1 }, 10, 10),
    { x: 4, y: 4, width: 5, height: 4 },
  );
});
test("rejects non-finite, empty, and excessive redaction regions", () => {
  assert.equal(
    normalizeRectangle({ x: NaN, y: 0, width: 1, height: 1 }, 10, 10),
    null,
  );
  assert.equal(
    normalizeRectangle({ x: 0, y: 0, width: 0, height: 1 }, 10, 10),
    null,
  );
  assert.equal(MAX_REDACTIONS, 500);
});
