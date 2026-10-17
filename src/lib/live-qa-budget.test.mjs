import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("live QA response deadline exceeds the staged entity and diagram client deadline", async () => {
  const client = await readFile(
    new URL("../scripts/extra-utilities.js", import.meta.url),
    "utf8",
  );
  const qa = await readFile(
    new URL("../../scripts/review-product-qa.mjs", import.meta.url),
    "utf8",
  );
  const clientMs = client.match(
    /AbortSignal\.any\(\[\s*signal,\s*AbortSignal\.timeout\((\d+)\)/,
  )?.[1];
  const diagramMs = client.match(/tool === "diagram"\s*\?\s*(\d+)/)?.[1];
  assert.ok(diagramMs, "diagram deadline must remain explicit");
  const qaMs = qa.match(/page\.waitForResponse\([\s\S]*?timeout:\s*(\d+)/)?.[1];
  assert.ok(clientMs, "entity deadline must be explicit");
  assert.ok(qaMs, "QA must not inherit the shorter default response timeout");
  assert.ok(
    Number(qaMs) >= Math.max(Number(clientMs), Number(diagramMs)) + 5000,
    "allow client deadline plus response-observation overhead",
  );
});
