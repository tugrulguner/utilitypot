import test from "node:test";
import assert from "node:assert/strict";
import {
  sourceAnswerMarkdown,
  sourceAnswerData,
} from "./utilities/source-answer-view.js";
test("source data export preserves retrieval coverage, redirects and unmodified raw model evidence", () => {
  const result = {
      source: "jev",
      model: "fixture",
      confidence: { "window0.complete": 0.49 },
      plan: { excerpts: [] },
    },
    text = "First paragraph.\n\nSecond paragraph.",
    redirects = [
      { from: "https://example.org/", to: "https://www.example.org/" },
    ];
  const data = sourceAnswerData(result, {
    question: "What happened?",
    text,
    url: "https://www.example.org/",
    truncated: true,
    retrieval: { redirects },
  });
  assert.equal(data.provider, "jev");
  assert.equal(data.source.kind, "fetched-url");
  assert.equal(data.source.text, text);
  assert.deepEqual(data.source.coverage, {
    characters: text.length,
    paragraphs: 2,
    truncated: true,
  });
  assert.deepEqual(data.source.retrieval, { redirects });
  assert.equal(data.confidence, result.confidence);
  assert.equal(result.source, "jev");
});
test("pasted source exports no fabricated URL or retrieval history", () => {
  const data = sourceAnswerData(
    { source: "jev", model: "fixture", confidence: {} },
    { question: "What?", text: "Source." },
  );
  assert.equal(data.source.kind, "pasted-text");
  assert.equal(data.source.coverage.truncated, false);
  assert.equal(data.source.url, undefined);
  assert.equal(data.source.retrieval, undefined);
});
test("source-answer Markdown retains main answer and every supporting detail without a global excerpt cap", () => {
  const lead = { text: "Inputs are not stored.", start: 0, end: 22 };
  const items = Array.from({ length: 8 }, (_, i) => ({
    text: `Source detail ${i}.`,
    start: 100 + i * 20,
    end: 116 + i * 20,
  }));
  const output = sourceAnswerMarkdown(
    {
      status: "answered",
      excerpts: [lead, ...items],
      answer: {
        lead: [lead],
        sections: [{ kind: "caveat", title: "Important conditions", items }],
      },
    },
    { question: "How are inputs handled?", sourceLabel: "example.com" },
  );
  assert.ok(output.includes("# How are inputs handled?"));
  assert.ok(output.includes("Inputs are not stored."));
  for (const item of items) assert.ok(output.includes(item.text));
  assert.ok(output.includes("## Important conditions"));
  assert.equal(output.split("Inputs are not stored.").length, 2);
});
test("source-answer export does not turn source HTML or Markdown links into active markup", () => {
  const item = {
    text: "<script>alert(1)</script> [open](javascript:alert(1))",
    start: 0,
    end: 53,
  };
  const output = sourceAnswerMarkdown(
    {
      status: "answered",
      excerpts: [item],
      answer: { lead: [item], sections: [] },
    },
    { question: "What is in this source?" },
  );
  assert.ok(output.includes("&lt;script&gt;"));
  assert.ok(!output.includes("<script>"));
  assert.ok(output.includes("\\[open\\]"));
});
