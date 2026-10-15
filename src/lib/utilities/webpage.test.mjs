import test from "node:test";
import assert from "node:assert/strict";
import {
  createQaInterpretation,
  extractPageText,
  readPublicPage,
} from "./webpage.js";
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
