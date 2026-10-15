import test from "node:test";
import assert from "node:assert/strict";
import {
  createQaInterpretation,
  extractPageText,
  readPublicPage,
} from "./webpage.js";
test("inline formatting does not exhaust the paragraph budget of readable public pages", () => {
  const paragraph =
    "<p><code>asyncio</code>\n supports <em>concurrent</em>\n code.</p>";
  const text = extractPageText("<main>" + paragraph.repeat(40) + "</main>");
  assert.equal(text.split(/\n\s*\n/).filter(Boolean).length, 40);
  assert.doesNotThrow(() =>
    createQaInterpretation({ text, question: "What does asyncio support?" }),
  );
  assert.match(text.replace(/\s+/g, " "), /asyncio supports concurrent code/);
});

test("readable extraction prefers semantic main content over surrounding navigation", () => {
  const text = extractPageText(
    '<div>Navigation outside main</div><div role="main"><p>Use <em>concurrent</em> tasks.</p></div><aside><p>Sidebar</p></aside>',
  );
  assert.equal(text, "Use concurrent tasks.");
});
test("public reader output always fits the QA paragraph budget and discloses truncation", async () => {
  const html =
    "<main>" +
    Array.from({ length: 120 }, (_, i) => `<p>Paragraph ${i}</p>`).join("") +
    "</main>";
  const result = await readPublicPage(
    "https://docs.python.org/example",
    async () =>
      new Response(html, { headers: { "Content-Type": "text/html" } }),
  );
  assert.equal(result.truncated, true);
  assert.doesNotThrow(() =>
    createQaInterpretation({
      text: result.text,
      question: "What paragraphs are present?",
    }),
  );
  assert.equal(result.text.split(/\n\s*\n/).filter(Boolean).length, 100);
  assert.ok(!result.text.includes("Paragraph 119"));
});
test("an empty semantic main falls back to visible document text", () => {
  assert.equal(
    extractPageText("<main></main><p>Visible fallback.</p>"),
    "Visible fallback.",
  );
});
test("readable tables and block elements keep distinct source values separated", () => {
  const table =
    "<main><table><tr><th>Plan</th><th>Price</th></tr><tr><td>Basic</td><td>10 USD</td></tr></table><section><h5>Terms</h5><dl><dt>Notice</dt><dd>24 hours</dd></dl></section></main>";
  const text = extractPageText(table);
  assert.match(text, /Plan\s+Price/);
  assert.match(text, /Basic\s+10 USD/);
  assert.match(text, /Terms\s+Notice\s+24 hours/);
});
test("webpage questions return exact source paragraphs and abstain when absent", () => {
  const spec = createQaInterpretation({
    text: "The project is open source.\n\nIt runs on Cloudflare Workers.",
    question: "Where does it run?",
  });
  const answer = spec.decode({
    answerability: { choice: "answered" },
    passage: { choice: "p1" },
  });
  assert.equal(answer.excerpts[0].text, "It runs on Cloudflare Workers.");
  assert.equal(
    spec.decode({
      answerability: { choice: "absent" },
      passage: { choice: "p0" },
    }).excerpts.length,
    0,
  );
});
test("readable extraction removes scripts and never fetches private or redirected unapproved hosts", async () => {
  assert(
    !extractPageText(
      "<main><p>Hello world.</p><script>bad()</script></main>",
    ).includes("bad"),
  );
  let calls = 0;
  await assert.rejects(
    () =>
      readPublicPage("http://127.0.0.1/", async () => {
        calls++;
      }),
    /approved/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    () =>
      readPublicPage(
        "https://docs.python.org/",
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://localhost/private" },
          }),
      ),
    /approved/,
  );
});
