import test from "node:test";
import assert from "node:assert/strict";
import worker, { handleRequest } from "../../../worker/index.js";
const request = (body, headers = {}) =>
  new Request("https://modepot.io/api/utilities/interpret", {
    method: "POST",
    headers: {
      Origin: "https://modepot.io",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
const input = {
  tool: "dates",
  input: {
    sample: "03/04/2026",
    context: "Dates exported by a UK office in day-first order.",
  },
};
const env = {
  TYPESAFE_API_KEY: "test-server-only",
  UTILITY_RATE_LIMIT: { limit: async () => ({ success: true }) },
  UTILITY_GLOBAL_RATE_LIMIT: { limit: async () => ({ success: true }) },
};
test("server supplies its own questions and never returns the provider credential", async () => {
  let calls = 0;
  const r = await handleRequest(request(input), env, async (url, init) => {
    calls++;
    const b = JSON.parse(init.body);
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init.headers.Authorization, "Bearer test-server-only");
    assert.equal(b.questions.convention.type, "choice");
    return Response.json({
      model: "jev-test",
      answers: {
        convention: {
          type: "choice",
          choice: "day-first",
          probabilities: {
            "day-first": 0.98,
            "month-first": 0.01,
            unspecified: 0.01,
          },
          confidence: 0.95,
        },
      },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
  });
  assert.equal(r.status, 200);
  const out = await r.text();
  assert.equal(JSON.parse(out).plan.convention, "day-first");
  assert(!out.includes("test-server-only"));
  assert.equal(calls, 1);
});
test("Worker execution context is not mistaken for an injected fetch function", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      model: "jev-test",
      answers: {
        convention: {
          type: "choice",
          choice: "day-first",
          probabilities: { "day-first": 1, "month-first": 0, unspecified: 0 },
          confidence: 1,
        },
      },
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  try {
    const r = await worker.fetch(request(input), env, { waitUntil() {} });
    assert.equal(r.status, 200);
  } finally {
    globalThis.fetch = original;
  }
});
test("missing protection fails closed without invoking provider", async () => {
  let calls = 0;
  const r = await handleRequest(
    request(input),
    { TYPESAFE_API_KEY: "test" },
    async () => {
      calls++;
    },
  );
  assert.equal(r.status, 503);
  assert.equal(calls, 0);
});
test("cross-origin requests are rejected before provider access", async () => {
  const r = await handleRequest(
    request(input, { Origin: "https://evil.example" }),
    env,
    () => {
      throw Error("must not run");
    },
  );
  assert.equal(r.status, 403);
});
test("denied rate limits consume no downstream calls", async () => {
  let calls = 0;
  const r = await handleRequest(
    request(input),
    { ...env, UTILITY_RATE_LIMIT: { limit: async () => ({ success: false }) } },
    () => {
      calls++;
    },
  );
  assert.equal(r.status, 429);
  assert.equal(calls, 0);
});
test("malformed distributions and contradictory choices are rejected without leaking payloads", async () => {
  for (const answer of [
    {
      type: "choice",
      choice: "day-first",
      probabilities: { "day-first": 0.1, "month-first": 0.9, unspecified: 0 },
      confidence: 0.8,
    },
    {
      type: "choice",
      choice: "day-first",
      probabilities: { "day-first": 1, evil: 0 },
      confidence: 1,
    },
  ]) {
    const r = await handleRequest(request(input), env, async () =>
      Response.json({
        model: "jev-test",
        answers: { convention: answer },
        usage: { input_tokens: 1, output_tokens: 1 },
        private: "raw-provider-secret",
      }),
    );
    assert.equal(r.status, 503);
    assert(!(await r.text()).includes("raw-provider-secret"));
  }
});
test("arbitrary proxy requests and oversized bodies do not reach the provider", async () => {
  let calls = 0;
  const fn = () => {
    calls++;
    throw Error("should not call");
  };
  assert.equal(
    (await handleRequest(request({ ...input, questions: {} }), env, fn)).status,
    400,
  );
  assert.equal(
    (
      await handleRequest(
        request({
          tool: "dates",
          input: { sample: "x".repeat(17000), context: "a" },
        }),
        env,
        fn,
      )
    ).status,
    413,
  );
  assert.equal(calls, 0);
});
test("upstream exceptions never expose credential or exception text", async () => {
  const r = await handleRequest(request(input), env, async () => {
    throw Error("Bearer test-server-only raw input");
  });
  assert.equal(r.status, 503);
  const body = await r.text();
  assert(!body.includes("test-server-only"));
  assert(!body.includes("raw input"));
});
