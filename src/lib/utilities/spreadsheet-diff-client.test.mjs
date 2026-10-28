import test from "node:test";
import assert from "node:assert/strict";
import { runDiffTask } from "./spreadsheet-diff-client.js";
test("cancel owns worker initialization and late completion cannot revive it", async () => {
  const original = globalThis.Worker;
  let worker;
  globalThis.Worker = class {
    constructor() {
      worker = this;
      this.terminated = 0;
    }
    postMessage() {}
    terminate() {
      this.terminated++;
    }
  };
  try {
    const c = new AbortController();
    const work = runDiffTask(
      { kind: "csv", text: "id\n001" },
      { signal: c.signal },
    );
    c.abort();
    await assert.rejects(work, { name: "AbortError" });
    worker.onmessage({ data: { result: "old" } });
    assert.equal(worker.terminated, 1);
  } finally {
    if (original) globalThis.Worker = original;
    else delete globalThis.Worker;
  }
});
