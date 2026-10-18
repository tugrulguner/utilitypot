import test from "node:test";
import assert from "node:assert/strict";
import { readPublicPage } from "./webpage.js";
test("URL reader fetches only the pasted page, never its links, images or scripts", async () => {
  const seen = [];
  const result = await readPublicPage(
    "https://example.com/article",
    async (url) => {
      seen.push(String(url));
      return new Response(
        '<main><h1>One page</h1><p>This page contains the answer.</p><a href="https://other.example/nested">Linked article</a><img src="/cover.png"><script src="/app.js"></script></main>',
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    },
    { resolve: async () => {} },
  );
  assert.deepEqual(seen, ["https://example.com/article"]);
  assert.ok(result.text.includes("This page contains the answer."));
  assert.equal(result.url, "https://example.com/article");
});
