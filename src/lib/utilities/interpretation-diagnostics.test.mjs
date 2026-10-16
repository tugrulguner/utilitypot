import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../../../worker/index.js";
const env = {
  TYPESAFE_API_KEY: "PRIVATE_KEY_SENTINEL",
  UTILITY_RATE_LIMIT: { limit: async () => ({ success: true }) },
  UTILITY_GLOBAL_RATE_LIMIT: { limit: async () => ({ success: true }) },
};
const request = () =>
  new Request("https://example.test/api/utilities/interpret", {
    method: "POST",
    headers: {
      origin: "https://example.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tool: "entities",
      input: { text: "Mina Rao.", definitions: "Person: a named person" },
    }),
  });
function envelope(questions, choose) {
  return {
    model: "diagnostic-fixture",
    usage: { input_tokens: 1, output_tokens: 1 },
    answers: Object.fromEntries(
      Object.entries(questions).map(([key, q]) => {
        const choice = choose(key);
        return [
          key,
          {
            type: "choice",
            choice,
            confidence: 1,
            probabilities: Object.fromEntries(
              Object.keys(q.criteria).map((k) => [k, Number(k === choice)]),
            ),
          },
        ];
      }),
    ),
  };
}
async function verify(response, phase, stage, code) {
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.phase, phase);
  assert.equal(body.stage, stage);
  assert.equal(body.code, code);
  const text = JSON.stringify(body);
  assert.doesNotMatch(text, /PRIVATE_|Mina|Rao|definitions|probabilities/);
  assert.match(body.error, /could not be verified/);
}
test("diagnostics identify first-stage response validation without exposing data", async () => {
  const r = await handleRequest(request(), env, async () =>
    Response.json({
      model: "fixture",
      answers: {},
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  );
  await verify(r, "response_validation", 1, "provider_response_invalid");
});
test("diagnostics identify inconsistent starts before any second provider request", async () => {
  let calls = 0;
  const r = await handleRequest(request(), env, async (_url, init) => {
    calls++;
    const { questions } = JSON.parse(init.body);
    return Response.json(
      envelope(questions, (k) => (k === "t0_m1_start" ? "w0" : "none")),
    );
  });
  await verify(r, "followup", 1, "entity_starts_invalid");
  assert.equal(calls, 1);
});
test("a verified end-stage abstention returns no span without fabricating a result", async () => {
  let calls = 0;
  const r = await handleRequest(request(), env, async (_url, init) => {
    calls++;
    const { questions } = JSON.parse(init.body);
    return Response.json(
      envelope(questions, (k) => (k === "t0_m0_start" ? "w0" : "none")),
    );
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body.plan.entities, []);
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_KEY_SENTINEL/);
  assert.equal(calls, 2);
});
test("unknown provider exceptions stay sanitized", async () => {
  const r = await handleRequest(request(), env, async () => {
    throw Error("PRIVATE_KEY_SENTINEL PRIVATE_SOURCE_SENTINEL");
  });
  await verify(r, "provider_fetch", 1, "interpretation_unverified");
});
