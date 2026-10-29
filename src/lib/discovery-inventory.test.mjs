import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import tools from "../data/tools.json" with { type: "json" };

test("agent discovery advertises every registered utility with the actual processing split", async () => {
  const text = await readFile(
    new URL("../../public/llms.txt", import.meta.url),
    "utf8",
  );
  const local = tools.filter((t) => t.processing === "In your browser").length;
  const ai = tools.length - local;
  assert.ok(
    text.includes(
      `${tools.length} tools: ${local} browser-local workflows and ${ai} bounded AI workflows`,
    ),
  );
  const found = [
    ...text.matchAll(
      /^- \[[^\]]+\]\(https:\/\/utilitypot\.modepot\.io\/tools\/([^/]+)\/\):/gm,
    ),
  ]
    .map((m) => m[1])
    .sort();
  assert.deepEqual(found, tools.map((t) => t.slug).sort());
  for (const slug of [
    "screenshot-to-spreadsheet",
    "redact-screenshot",
    "compare-spreadsheets",
  ])
    assert.match(
      text.split("\n").find((l) => l.includes(`/tools/${slug}/`)),
      /Browser-local; no.*upload/,
    );
});

test("homepage tool count is derived from the same registry as the cards", async () => {
  const source = await readFile(
    new URL("../pages/index.astro", import.meta.url),
    "utf8",
  );
  assert.match(source, /<h2>\{tools\.length\} tools\. No signup\.<\/h2>/);
});
