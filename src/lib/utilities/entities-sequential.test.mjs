import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEntitiesInterpretation } from "./entities.js";
import { handleRequest } from "../../../worker/index.js";
const captured = JSON.parse(
  await readFile(
    new URL(
      "./fixtures/entities-continuation-jev-1.13.0.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("document continuation asks one next-start decision instead of impossible independent ordinals", () => {
  const spec = createEntitiesInterpretation(captured.input);
  assert.deepEqual(Object.keys(spec.questions), ["t0_m0_start"]);
  assert.equal(captured.originalError.code, "entity_starts_invalid");
  assert.ok(
    Object.values(captured.provider.answers).every((a) => a.choice === "w83"),
  );
  const next = spec.followup({
    t0_m0_start: captured.provider.answers.t0_m0_start,
  });
  const endpoint = Object.entries(next.questions.t0_m0_end.criteria).find(
    ([, value]) => value.text === "Amir Kade",
  )[0];
  const result = next.decode({ t0_m0_end: { choice: endpoint } });
  assert.equal(result.entities[0].text, "Amir Kade");
});
test("actual Worker continues bounded sequential starts and preserves strict span validation", async () => {
  const input = { ...captured.input };
  let calls = 0,
    questions = 0;
  const request = new Request(
    "https://utilitypot.modepot.io/api/utilities/interpret",
    {
      method: "POST",
      headers: {
        origin: "https://utilitypot.modepot.io",
        "content-type": "application/json",
      },
      body: JSON.stringify({ tool: "entities", input }),
    },
  );
  const env = {
    TYPESAFE_API_KEY: "TEST ONLY",
    UTILITY_RATE_LIMIT: { limit: async () => ({ success: true }) },
    UTILITY_GLOBAL_RATE_LIMIT: { limit: async () => ({ success: true }) },
  };
  const response = await handleRequest(request, env, async (_url, init) => {
    const body = JSON.parse(init.body);
    calls++;
    questions += Object.keys(body.questions).length;
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([key, q]) => {
        const choice = key.endsWith("_start")
          ? Object.hasOwn(q.criteria, "w83")
            ? "w83"
            : "none"
          : (Object.entries(q.criteria).find(
              ([, v]) => v.text === "Amir Kade",
            )?.[0] ?? "none");
        return [
          key,
          {
            type: "choice",
            choice,
            confidence: 0.33,
            probabilities: Object.fromEntries(
              Object.keys(q.criteria).map((k) => [k, k === choice ? 1 : 0]),
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
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(
    data.plan.entities.map((e) => e.text),
    ["Amir Kade"],
  );
  assert.equal(data.plan.continuation[0].exhausted, true);
  assert.ok(calls <= 6);
  assert.ok(questions <= 24);
});
