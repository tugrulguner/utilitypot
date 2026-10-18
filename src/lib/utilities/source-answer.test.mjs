import test from "node:test";
import assert from "node:assert/strict";
import {
  answerSourceDocument,
  createSourceAnswerInterpretation,
  sourceUnits,
  createSourceAnswerWindow,
} from "./source-answer.js";
import { handleRequest } from "../../../worker/index.js";
const env = {
  TYPESAFE_API_KEY: "STRUCTURAL TEST ONLY",
  UTILITY_RATE_LIMIT: { limit: async () => ({ success: true }) },
  UTILITY_GLOBAL_RATE_LIMIT: { limit: async () => ({ success: true }) },
};
function oracle(classify, stats = { calls: 0, questions: [] }) {
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    stats.calls++;
    stats.questions.push(Object.keys(body.questions).length);
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([key, q]) => {
        if (q.type === "noul") {
          const p = body.state.passages.find((p) => key === `${p.id}_relevant`);
          const value =
            key === "answer_complete"
              ? body.state.passages.some((p) => classify(p).relevance >= 0.65)
                ? 0.95
                : 0.03
              : classify(p).relevance;
          return [key, { type: "noul", noul: value }];
        }
        const choice =
          key === "intent"
            ? "fact"
            : key.endsWith("_span")
              ? Object.keys(q.criteria).find((k) => k !== "none")
              : classify(
                  body.state.passages.find((p) => key === `${p.id}_role`),
                ).role;
        return [
          key,
          {
            type: "choice",
            choice,
            confidence: 0.73,
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
  };
}
function transport(classify, stats) {
  return async (input, { signal } = {}) => {
    const request = new Request(
      "https://utilitypot.modepot.io/api/utilities/interpret",
      {
        method: "POST",
        headers: {
          origin: "https://utilitypot.modepot.io",
          "content-type": "application/json",
        },
        body: JSON.stringify({ tool: "qa", input }),
        signal,
      },
    );
    const r = await handleRequest(request, env, oracle(classify, stats));
    const data = await r.json();
    assert.equal(r.status, 200, JSON.stringify(data));
    return data;
  };
}
const supported = () => ({ relevance: 0.93, role: "direct" });
test("actual document callback payload executes the Worker route, conditioned lead and whole-question coverage", async () => {
  const stats = { calls: 0, questions: [] };
  const text = "Background information. The warranty lasts five years.";
  const result = await answerSourceDocument(
    { text, question: "How long is the warranty?" },
    transport(supported, stats),
  );
  assert.equal(result.source, "jev");
  assert.equal(result.plan.coverage.complete, true);
  assert.equal(result.plan.status, "answered");
  assert.equal(stats.calls, 2);
  assert.ok(stats.questions.reduce((a, b) => a + b, 0) <= 24);
  assert.equal(
    text.slice(
      result.plan.answer.lead[0].start,
      result.plan.answer.lead[0].end,
    ),
    result.plan.answer.lead[0].text,
  );
  assert.ok(Object.values(result.confidence).includes(0.73));
  assert.ok(Object.values(result.confidence).includes(0.93));
});
test("ten-block QA uses a bounded 32-question budget for relevance, role and precise spans", async () => {
  const text = Array.from(
      { length: 10 },
      (_, i) => `Background context. Fact ${i}.`,
    ).join("\n\n"),
    stats = { calls: 0, questions: [] };
  const result = await answerSourceDocument(
    { text, question: "Which facts are listed?" },
    transport(supported, stats),
  );
  assert.equal(stats.calls, 2);
  assert.equal(
    stats.questions.reduce((a, b) => a + b, 0),
    32,
  );
  assert.equal(result.plan.excerpts.length, 10);
  assert.equal(result.plan.answer.sections.flatMap((s) => s.items).length, 10);
});

test("complete source beyond10k and100paragraphs retains late supported answers", async () => {
  const text = Array.from(
    { length: 120 },
    (_, i) =>
      `Paragraph ${i}: ${i === 115 ? "The warranty lasts five years." : "ordinary context " + i + " detail ".repeat(12)}`,
  ).join("\n\n");
  assert.ok(text.length > 10000);
  const classify = (p) =>
    p.text.includes("warranty")
      ? supported()
      : { relevance: 0.02, role: "unrelated" };
  const result = await answerSourceDocument(
    { text, question: "How long is the warranty?" },
    transport(classify),
  );
  assert.equal(result.plan.excerpts.length, 1);
  assert.ok(result.plan.excerpts[0].text.includes("five years"));
  assert.equal(result.plan.coverage.unitsJudged, 120);
  assert.equal(result.plan.coverage.complete, true);
  assert.equal(result.plan.coverage.semanticExhaustiveness, false);
});
test("preserves every supported item, code/list structure, Unicode and distinct roles", async () => {
  const text =
    "# Conditions\n\nZoë has five years of support.\n\n1. Install the tool.\n2. Run checks.\n\n```js\nrun();\n\ncheck();\n```\n\nA conflicting note says only two years.";
  const classify = (p) => ({
    relevance: 0.9,
    role: p.text.includes("conflicting")
      ? "conflict"
      : p.text.includes("Install")
        ? "step"
        : "direct",
  });
  const result = await answerSourceDocument(
    { text, question: "What does the source say?" },
    transport(classify),
  );
  for (const e of result.plan.excerpts)
    assert.equal(text.slice(e.start, e.end), e.text);
  assert.ok(result.plan.answer.sections.some((s) => s.kind === "conflict"));
  assert.ok(
    sourceUnits(text).some((p) => p.text.includes("run();\n\ncheck();")),
  );
});
test("treats research and development as a semantic question, not guessed keyword-separated subquestions", () => {
  const p = {
    mode: "source-answer",
    question:
      "How does research and development work, and what are its limits?",
    passages: [
      {
        id: "u0",
        text: "R&D is funded for two years.",
        start: 0,
        end: "R&D is funded for two years.".length,
      },
    ],
  };
  const spec = createSourceAnswerWindow(p);
  assert.ok(Object.hasOwn(spec.questions, "answer_complete"));
  assert.ok(!Object.keys(spec.questions).some((k) => k.includes("_part")));
  assert.equal(spec.state.question, p.question);
});
test("no supporting source information returns explicit absence without a fabricated answer", async () => {
  const result = await answerSourceDocument(
    { text: "The sky is blue.", question: "What is the tax rate?" },
    transport(() => ({ relevance: 0.01, role: "unrelated" })),
  );
  assert.equal(result.plan.status, "not-answered");
  assert.deepEqual(result.plan.answer.lead, []);
  assert.deepEqual(result.plan.excerpts, []);
});
test("cancellation and any later-window failure return no partial document", async () => {
  const text = Array.from({ length: 21 }, (_, i) => `Block ${i}.`).join("\n\n"),
    controller = new AbortController();
  await assert.rejects(
    answerSourceDocument(
      { text, question: "Which block?" },
      async () => {
        controller.abort();
        controller.signal.throwIfAborted();
      },
      { signal: controller.signal },
    ),
  );
  let calls = 0;
  const real = transport(supported);
  await assert.rejects(
    answerSourceDocument({ text, question: "Which block?" }, async (p, o) => {
      if (++calls === 2) throw Error("fixture window failure");
      return real(p, o);
    }),
    /fixture window failure/,
  );
});
test("rejects model changes, missing provenance and valid source spans outside their requested window", async () => {
  const text = Array.from({ length: 21 }, (_, i) => `Block ${i}.`).join("\n\n");
  let calls = 0;
  const real = transport(supported);
  await assert.rejects(
    answerSourceDocument({ text, question: "Which block?" }, async (p, o) => {
      const r = await real(p, o);
      if (calls++) r.model = "DIFFERENT MODEL";
      return r;
    }),
    /Inconsistent/,
  );
  await assert.rejects(
    answerSourceDocument({ text: "Ada.", question: "Who?" }, async () => ({
      model: "",
      plan: { excerpts: [] },
    })),
    /Invalid/,
  );
  await assert.rejects(
    answerSourceDocument({ text, question: "Which block?" }, async (p, o) => {
      const r = await real(p, o);
      const end = text.length,
        start = text.lastIndexOf("Block");
      r.plan.excerpts[0] = {
        id: `source-${start}-${end}`,
        text: text.slice(start),
        start,
        end,
        role: "direct",
        relevance: 0.93,
      };
      return r;
    }),
    /provenance/,
  );
});
test("serialized Unicode/control source windows respect API bytes and full-document resource guard", () => {
  const near = "é".repeat(1024 * 1024);
  assert.ok(
    createSourceAnswerInterpretation({ text: near, question: "What?" }).units
      .length,
  );
  assert.throws(() =>
    createSourceAnswerInterpretation({ text: near + "é", question: "What?" }),
  );
  const text = "a\u0000".repeat(15000);
  const spec = createSourceAnswerInterpretation({ text, question: "Why?" });
  for (const w of spec.windows) {
    const input = {
      mode: "source-answer",
      question: "Why?",
      passages: w.map((p, i) => ({ id: `u${i}`, ...p })),
    };
    assert.ok(
      new TextEncoder().encode(JSON.stringify({ tool: "qa", input })).length <=
        16000,
    );
  }
});
