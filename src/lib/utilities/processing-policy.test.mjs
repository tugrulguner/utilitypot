import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../../../worker/index.js";
const env = {
  TYPESAFE_API_KEY: "test-only",
  UTILITY_RATE_LIMIT: { limit: async () => ({ success: true }) },
  UTILITY_GLOBAL_RATE_LIMIT: { limit: async () => ({ success: true }) },
};
const examples = {
  csv: {
    csv: "id,name\n1,Ada",
    example: '{"id":"1"}',
    instructions: "Use the id column.",
  },
  dates: { sample: "03/04/2026", context: "UK day-first dates." },
  meeting: {
    date: "2026-06-15",
    duration: 30,
    participants: [
      {
        name: "Ada",
        zone: "Europe/London",
        text: "Available from 9am until noon.",
      },
    ],
  },
  jsonCsv: {
    sample: '{"orders":[{"id":"001"}]}',
    instructions: "Use orders as rows.",
  },
};
for (const [tool, input] of Object.entries(examples))
  test(`${tool}: deterministic endpoint is rejected without provider access`, async () => {
    let calls = 0;
    const response = await handleRequest(
      new Request("https://utilitypot.modepot.io/api/utilities/interpret", {
        method: "POST",
        headers: {
          Origin: "https://utilitypot.modepot.io",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tool, input }),
      }),
      env,
      async () => {
        calls++;
        throw Error("Provider must not be called");
      },
    );
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  });
