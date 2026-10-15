import test from "node:test";
import assert from "node:assert/strict";
import { liveTarget } from "./live-target.mjs";
test("live UI override allows only isolated loopback or production", () => {
  assert.equal(liveTarget().origin, "https://utilitypot.modepot.io");
  assert.equal(
    liveTarget("http://127.0.0.1:4545").mode,
    "local UI + real production backend",
  );
  for (const value of [
    "https://example.com",
    "http://localhost:8000",
    "http://127.0.0.1:4545/path",
    "http://user:pass@127.0.0.1:4545",
  ])
    assert.throws(() => liveTarget(value));
});
