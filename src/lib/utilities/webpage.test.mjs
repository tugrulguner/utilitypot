import test from "node:test";
import assert from "node:assert/strict";
import {
  createQaInterpretation,
  extractPageText,
  readPublicPage,
} from "./webpage.js";
test("HTML encoding validation parses real meta attributes, not comments or quoted tag ends", async () => {
  for (const html of [
    '<meta name=">" charset="windows-1252"><p>café</p>',
    '<math><p>HTML breakout</p><meta charset="windows-1252"><p>café</p>',
    '<svg><meta charset="windows-1252"><p>café</p>',
    '<meta http-equiv="Content-Type" content="text/html; charset=windows-1252"><p>café</p>',
  ])
    await assert.rejects(
      () =>
        readPublicPage(
          "modepot.io",
          async () =>
            new Response(html, { headers: { "content-type": "text/html" } }),
          { resolve: async () => {} },
        ),
      { code: "unsupported_encoding" },
    );
  for (const html of [
    '<meta charset="utf-8"><!-- <meta charset="windows-1252"> --><p>café</p>',
    '<template><meta charset="windows-1252"></template><p>café</p>',
    `<script>const sample='<meta charset="windows-1252">';</script><p>café</p>`,
  ]) {
    const result = await readPublicPage(
      "modepot.io",
      async () =>
        new Response(html, { headers: { "content-type": "text/html" } }),
      { resolve: async () => {} },
    );
    assert.match(result.text, /café/);
  }
});
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
  const result = await read(
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
test("readable extraction removes scripts and never fetches private or redirected private hosts", async () => {
  assert(
    !extractPageText(
      "<main><p>Hello world.</p><script>bad()</script></main>",
    ).includes("bad"),
  );
  let calls = 0;
  await assert.rejects(
    () =>
      read("http://127.0.0.1/", async () => {
        calls++;
      }),
    /public hostname|unsupported destination/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    () =>
      read(
        "https://docs.python.org/",
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://localhost/private" },
          }),
      ),
    /public hostname|unsupported destination/,
  );
});

const publicDns = async () => {};
const read = (url, fetcher, options = {}) =>
  readPublicPage(url, fetcher, { resolve: publicDns, ...options });
test("ordinary ModePot and unrelated public domains read with canonical provenance", async () => {
  for (const host of ["modepot.io", "unrelated.org"]) {
    const result = await read(host + "/about#x", async (url, init) => {
      assert.equal(url, `https://${host}/about`);
      assert.equal(init.redirect, "manual");
      assert.equal(init.credentials, "omit");
      assert.equal(init.method, "GET");
      return new Response("<main><p>Exact <b>source</b>.</p></main>", {
        headers: { "Content-Type": "Text/HTML; charset=UTF-8" },
      });
    });
    assert.equal(result.text, "Exact source.");
    assert.equal(result.url, `https://${host}/about`);
  }
});
test("redirects revalidate DNS, allow public targets, and cancel discarded bodies", async () => {
  const visited = [],
    resolved = [];
  let cancelled = 0;
  const result = await read(
    "modepot.io",
    async (url) => {
      visited.push(url);
      return visited.length === 1
        ? new Response(
            new ReadableStream({
              cancel() {
                cancelled++;
              },
            }),
            {
              status: 302,
              headers: { location: "https://unrelated.org/page" },
            },
          )
        : new Response("source");
    },
    { resolve: async (host) => resolved.push(host) },
  );
  assert.deepEqual(resolved, ["modepot.io", "unrelated.org"]);
  assert.equal(cancelled, 1);
  assert.equal(result.url, "https://unrelated.org/page");
});
test("unsafe redirects, downgrade, loop and excessive redirects never fetch rejected targets", async () => {
  for (const location of [
    "http://modepot.io/next",
    "https://127.0.0.1",
    "https://localhost",
    "https://modepot.io/",
  ]) {
    let calls = 0;
    await assert.rejects(
      read("https://modepot.io/", async () => {
        calls++;
        return new Response(null, { status: 302, headers: { location } });
      }),
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(
    read(
      "modepot.io",
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: `/page${++calls}` },
        }),
    ),
    { code: "redirect_limit" },
  );
  assert.equal(calls, 4);
  calls = 0;
  await assert.rejects(
    read(
      "modepot.io",
      async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { location: "https://private.example.org" },
        });
      },
      {
        resolve: async (host) => {
          if (host.startsWith("private")) throw Error("private");
        },
      },
    ),
  );
  assert.equal(calls, 1);
});
test("read failures have distinct stable safe codes and cancel rejected bodies", async () => {
  for (const [status, type, body, code] of [
    [401, "text/html", "login", "upstream_auth"],
    [403, "text/html", "blocked", "upstream_forbidden"],
    [429, "text/html", "rate", "upstream_rate_limited"],
    [500, "text/html", "oops", "fetch_unavailable"],
    [200, "application/pdf", "pdf", "unsupported_content"],
    [200, "", "text", "unsupported_content"],
    [200, "text/plain; charset=shift_jis", "text", "unsupported_encoding"],
    [200, "text/html", "<script>only()</script>", "empty_page"],
  ]) {
    await assert.rejects(
      read(
        "modepot.io",
        async () =>
          new Response(body, { status, headers: { "content-type": type } }),
      ),
      { code },
    );
  }
  await assert.rejects(
    read("modepot.io", async () => {
      throw Error("https://secret@private");
    }),
    (e) => e.code === "fetch_unavailable" && !e.message.includes("secret"),
  );
});
test("shared deadline interrupts stalled fetch, DNS and body; oversized streams cancel", async () => {
  for (const phase of ["fetch", "dns", "body"]) {
    let cancelled = false;
    const fetcher = async () =>
      phase === "fetch"
        ? new Promise(() => {})
        : new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { "content-type": "text/plain" } },
          );
    await assert.rejects(
      read("modepot.io", fetcher, {
        timeoutMs: 20,
        ...(phase === "dns" ? { resolve: () => new Promise(() => {}) } : {}),
      }),
      { code: "timeout" },
    );
    if (phase === "body") assert.equal(cancelled, true);
  }
  let cancelled = false;
  await assert.rejects(
    read(
      "modepot.io",
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(250001));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { "content-type": "text/plain" } },
        ),
    ),
    { code: "page_too_large" },
  );
  assert.equal(cancelled, true);
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    read(
      "modepot.io",
      async () => {
        calls++;
      },
      { signal: controller.signal },
    ),
    { code: "cancelled" },
  );
  assert.equal(calls, 0);
});
test("declared or malformed non-UTF8 encodings and invalid UTF8 fail closed", async () => {
  for (const type of [
    "text/plain; charset",
    'text/plain; charset="utf-8',
    "text/plain; charset=utf-8; charset=latin1",
  ])
    await assert.rejects(
      read(
        "modepot.io",
        async () => new Response("text", { headers: { "content-type": type } }),
      ),
      { code: "unsupported_encoding" },
    );
  await assert.rejects(
    read(
      "modepot.io",
      async () =>
        new Response('<meta charset="windows-1252"><p>text</p>', {
          headers: { "content-type": "text/html" },
        }),
    ),
    { code: "unsupported_encoding" },
  );
  await assert.rejects(
    read(
      "modepot.io",
      async () =>
        new Response(new Uint8Array([0xff]), {
          headers: { "content-type": "text/plain" },
        }),
    ),
    { code: "unsupported_encoding" },
  );
});
test("shared signal reaches DNS and all redirects; rejection cancels upstream streams", async () => {
  let signal,
    cancelled = 0;
  await assert.rejects(
    read(
      "modepot.io",
      async (url, init) => {
        assert.equal(url, "https://modepot.io/");
        assert.equal(init.signal, signal);
        return new Response(
          new ReadableStream({
            cancel() {
              cancelled++;
            },
          }),
          { headers: { "content-type": "application/pdf" } },
        );
      },
      {
        resolve: async (host, s) => {
          assert.equal(host, "modepot.io");
          signal = s;
        },
      },
    ),
    { code: "unsupported_content" },
  );
  assert.equal(cancelled, 1);
});
test("real DNS validation seam blocks private and mixed answers before any page fetch", async () => {
  for (const addresses of [["10.0.0.1"], ["1.1.1.1", "127.0.0.1"]]) {
    let pages = 0;
    await assert.rejects(
      readPublicPage("modepot.io", async (url) => {
        const u = new URL(url);
        if (u.hostname !== "cloudflare-dns.com") {
          pages++;
          return new Response("should not fetch");
        }
        const name = u.searchParams.get("name"),
          type = Number(u.searchParams.get("type"));
        return Response.json({
          Status: 0,
          TC: false,
          Question: [{ name, type }],
          Answer: addresses.map((data) => ({ name, type, data })),
        });
      }),
      { code: "unsafe_address" },
    );
    assert.equal(pages, 0);
  }
});

test("redirect DNS rejects private resolution before fetching that target", async () => {
  const fetched = [];
  await assert.rejects(
    readPublicPage("modepot.io", async (url) => {
      const u = new URL(url);
      if (u.hostname === "cloudflare-dns.com") {
        const name = u.searchParams.get("name"),
          type = Number(u.searchParams.get("type"));
        return Response.json({
          Status: 0,
          TC: false,
          Question: [{ name, type }],
          Answer: [
            {
              name,
              type,
              data:
                name === "unrelated.org"
                  ? "10.0.0.1"
                  : type === 1
                    ? "1.1.1.1"
                    : "2606:4700::1111",
            },
          ],
        });
      }
      fetched.push(url);
      return new Response(null, {
        status: 302,
        headers: { location: "https://unrelated.org/private" },
      });
    }),
    { code: "unsafe_address" },
  );
  assert.deepEqual(fetched, ["https://modepot.io/"]);
});
test("three redirects can succeed and character truncation preserves exact source prefix", async () => {
  let calls = 0;
  const text = "é".repeat(10001);
  const result = await read("modepot.io", async () =>
    ++calls <= 3
      ? new Response(null, {
          status: 302,
          headers: { location: `/page${calls}` },
        })
      : new Response(text),
  );
  assert.equal(calls, 4);
  assert.equal(result.redirects.length, 3);
  assert.equal(result.text, text.slice(0, 10000));
  assert.equal(result.truncated, true);
});
