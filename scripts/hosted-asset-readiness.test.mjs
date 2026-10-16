import test from "node:test";
import assert from "node:assert/strict";
import { waitForHostedAssets } from "./hosted-asset-readiness.mjs";
const origin = "https://example.test";
function page() {
  return new Response(
    '<main class="utility-app" data-processing="local"><script src="/_astro/app.js"></script><link rel="stylesheet" href="/_astro/app.css"></main>',
    { headers: { "content-type": "text/html" } },
  );
}
test("all routes and transitive local JS/CSS/font assets are ready before cases start", async () => {
  const paths = [],
    probes = [];
  await waitForHostedAssets(origin, {
    routes: ["/tools/meeting-time-finder/"],
    onProbe: (p) => probes.push(p),
    fetcher: async (url) => {
      const p = new URL(url).pathname;
      paths.push(p);
      if (p.startsWith("/tools/")) return page();
      if (p.endsWith("app.js"))
        return new Response(
          'import("./chart.js"); import x from "https://third-party.invalid/a.js"',
        );
      if (p.endsWith("app.css"))
        return new Response('body{font:url("./text.woff2")}');
      return new Response("ready");
    },
    wait: async () => {
      throw Error("healthy assets need no wait");
    },
  });
  assert.ok(paths.includes("/_astro/chart.js"));
  assert.ok(paths.includes("/_astro/text.woff2"));
  assert.ok(paths.every((p) => !p.startsWith("/api/")));
  assert.ok(probes.every((p) => p.status === 200));
});
test("only observed Cloudflare placeholder404 readiness is retried and retained", async () => {
  let calls = 0,
    waits = 0;
  const probes = [];
  await waitForHostedAssets(origin, {
    routes: ["/tools/meeting-time-finder/"],
    onProbe: (p) => probes.push(p),
    fetcher: async (url) => {
      assert.ok(!url.includes("/api/"));
      calls++;
      return calls === 1
        ? new Response("There is nothing here yet", { status: 404 })
        : new Response("ready");
    },
    wait: async () => {
      waits++;
    },
  });
  assert.equal(waits, 1);
  assert.equal(probes[0].status, 404);
  assert.equal(probes[0].placeholder, true);
});
test("missing application assets and forbidden responses fail immediately, never hide real errors", async () => {
  for (const status of [404, 403, 429, 503]) {
    let waits = 0;
    await assert.rejects(
      () =>
        waitForHostedAssets(origin, {
          routes: ["/tools/missing/"],
          fetcher: async () =>
            new Response("application or access failure", { status }),
          wait: async () => waits++,
        }),
      /readiness/,
    );
    assert.equal(waits, 0);
  }
});
test("readiness placeholder waits are bounded and never invoke a paid endpoint", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      waitForHostedAssets(origin, {
        routes: ["/tools/meeting-time-finder/"],
        maxAttempts: 2,
        fetcher: async (url) => {
          assert.ok(!url.includes("/api/"));
          calls++;
          return new Response("There is nothing here yet", { status: 404 });
        },
        wait: async () => {},
      }),
    /readiness/,
  );
  assert.equal(calls, 2);
});
