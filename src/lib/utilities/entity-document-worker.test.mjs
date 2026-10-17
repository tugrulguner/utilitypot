import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../../../worker/index.js";
import { extractEntityDocument } from "./entity-document.js";
const env = {
  TYPESAFE_API_KEY: "TEST ONLY",
  UTILITY_RATE_LIMIT: { limit: async () => ({ success: true }) },
  UTILITY_GLOBAL_RATE_LIMIT: { limit: async () => ({ success: true }) },
};
const request = (input) =>
  new Request("https://utilitypot.modepot.io/api/utilities/interpret", {
    method: "POST",
    headers: {
      origin: "https://utilitypot.modepot.io",
      "content-type": "application/json",
    },
    body: JSON.stringify({ tool: "entities", input }),
  });
// Structural transport oracle: no real-provider accuracy is claimed.
async function provider(_url, init) {
  const { questions } = JSON.parse(init.body),
    answers = {};
  assert.ok(Object.keys(questions).length <= 12);
  for (const [key, q] of Object.entries(questions)) {
    let choice;
    if (key.endsWith("_start")) {
      const n = Number(key.match(/_m(\d)_/)[1]);
      choice =
        Object.entries(q.criteria).filter(
          ([id, v]) => id !== "none" && v.token === "Ada",
        )[n]?.[0] ?? "none";
    } else
      choice =
        Object.entries(q.criteria).find(
          ([id, v]) => id !== "none" && v.text === "Ada",
        )?.[0] ?? "none";
    answers[key] = {
      type: "choice",
      choice,
      confidence: 0.137,
      probabilities: Object.fromEntries(
        Object.keys(q.criteria).map((id) => [id, id === choice ? 1 : 0]),
      ),
    };
  }
  return Response.json({
    model: "STRUCTURAL TEST ORACLE",
    answers,
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}
test("document client and actual Worker route process dense, long text without a global mention cap", async () => {
  const text = Array.from({ length: 160 }, (_, i) =>
    i % 3 === 0 ? "Ada" : "word",
  ).join(" ");
  let calls = 0;
  const result = await extractEntityDocument(
    { text, definitions: "Person: a named person" },
    async (input) => {
      calls++;
      const response = await handleRequest(request(input), env, provider);
      assert.equal(response.status, 200);
      return response.json();
    },
  );
  assert.equal(result.plan.entities.length, 54);
  assert.ok(calls > 3);
  assert.equal(result.plan.coverage.complete, true);
  assert.ok(Object.values(result.confidence).every((p) => p === 0.137));
  for (const entity of result.plan.entities)
    assert.equal(text.slice(entity.start, entity.end), entity.text);
});
test("malformed owned ranges/cursors are rejected before any provider request", async () => {
  for (const extra of [
    { range: { start: 0, end: 200 } },
    { range: { start: 0, end: 3 }, after: { Person: -1 } },
    { range: { start: 0, end: 3 }, after: { Unknown: 0 } },
  ]) {
    let called = false;
    const response = await handleRequest(
      request({ text: "Ada", definitions: "Person: a named person", ...extra }),
      env,
      async () => {
        called = true;
        throw Error("must not run");
      },
    );
    assert.equal(response.status, 400);
    assert.equal(called, false);
  }
});
