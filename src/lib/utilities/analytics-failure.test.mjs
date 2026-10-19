import assert from "node:assert/strict";
import test from "node:test";
import {
  failureCategory,
  failureOutcome,
  failureProperties,
} from "./analytics-failure.js";

test("failure metadata is bounded and absent on success", () => {
  assert.deepEqual(failureProperties("success", "network"), {});
  assert.deepEqual(failureProperties("rejected"), {
    failure_category: "validation",
  });
  assert.deepEqual(failureProperties("cancelled"), {
    failure_category: "cancelled",
  });
  assert.deepEqual(failureProperties("unexpected_failure"), {
    failure_category: "presentation",
  });
  assert.deepEqual(
    failureProperties("unexpected_failure", "PRIVATE_ERROR_SENTINEL"),
    { failure_category: "unknown" },
  );
  assert.equal(
    failureCategory({
      failureCategory: "PRIVATE_ERROR_SENTINEL",
      name: "TimeoutError",
    }),
    "timeout",
  );
  assert.equal(
    failureCategory(new DOMException("private", "AbortError")),
    "cancelled",
  );
});

test("failure outcomes preserve handled denials and separate unexpected faults", () => {
  for (const category of [
    "validation",
    "request_rejected",
    "rate_limited",
    "timeout",
  ])
    assert.equal(failureOutcome(category), "rejected");
  for (const category of [
    "network",
    "service_unavailable",
    "provider_failure",
    "invalid_response",
    "presentation",
    "unknown",
  ])
    assert.equal(failureOutcome(category), "unexpected_failure");
  assert.equal(failureOutcome("cancelled"), "cancelled");
});
