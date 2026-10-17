import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../../../worker/index.js";
const env = {
  TYPESAFE_API_KEY: "TEST ONLY",
  UTILITY_RATE_LIMIT: { limit: async () => ({ success: true }) },
  UTILITY_GLOBAL_RATE_LIMIT: { limit: async () => ({ success: true }) },
};
const input = {
  text: Array.from({ length: 12 }, () => "Ada").join(" "),
  definitions: ["A", "B", "C", "D"].map((t) => `${t}: a name`).join("\n"),
  range: { start: 0, end: 47 },
};
function request(signal) {
  return new Request("https://utilitypot.modepot.io/api/utilities/interpret", {
    method: "POST",
    headers: {
      origin: "https://utilitypot.modepot.io",
      "content-type": "application/json",
    },
    body: JSON.stringify({ tool: "entities", input }),
    signal,
  });
}
function response(body) {
  const answers = Object.fromEntries(
    Object.entries(body.questions).map(([k, q]) => {
      const choice =
        Object.keys(q.criteria).find((id) => id !== "none") ?? "none";
      return [
        k,
        {
          type: "choice",
          choice,
          confidence: 0.7,
          probabilities: Object.fromEntries(
            Object.keys(q.criteria).map((id) => [id, id === choice ? 1 : 0]),
          ),
        },
      ];
    }),
  );
  return Response.json({
    model: "STRUCTURAL ORACLE",
    answers,
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}
test("four-category sequential window retains exactly the 24-question budget and unique raw scores", async () => {
  let calls = 0,
    questions = 0;
  const r = await handleRequest(request(), env, async (_url, init) => {
    const body = JSON.parse(init.body);
    calls++;
    questions += Object.keys(body.questions).length;
    return response(body);
  });
  assert.equal(r.status, 200);
  const result = await r.json();
  assert.equal(calls, 6);
  assert.equal(questions, 24);
  assert.equal(Object.keys(result.confidence).length, 24);
  assert.ok(Object.values(result.confidence).every((p) => p === 0.7));
  assert.equal(result.plan.entities.length, 12);
  assert.ok(
    result.plan.continuation.every(
      (c) => c.starts.length === 3 && !c.exhausted,
    ),
  );
});
test("cancelling a window prevents the dependent provider endpoint stage and returns no partial plan", async () => {
  const c = new AbortController();
  let calls = 0;
  const r = await handleRequest(request(c.signal), env, async (_url, init) => {
    calls++;
    const result = response(JSON.parse(init.body));
    c.abort();
    return result;
  });
  assert.equal(calls, 1);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).plan, undefined);
});
