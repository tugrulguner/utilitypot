import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../../../worker/index.js";
const env = {
  UTILITY_RATE_LIMIT: { limit: async () => ({ success: true }) },
  UTILITY_GLOBAL_RATE_LIMIT: { limit: async () => ({ success: true }) },
};
const request = (body) =>
  new Request("https://utilitypot.modepot.io/api/utilities/read-page", {
    method: "POST",
    headers: {
      Origin: "https://utilitypot.modepot.io",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const dns = (url) => {
  const u = new URL(url),
    name = u.searchParams.get("name"),
    type = Number(u.searchParams.get("type"));
  return Response.json({
    Status: 0,
    TC: false,
    Question: [{ name, type }],
    Answer: [{ name, type, data: type === 1 ? "1.1.1.1" : "2606:4700::1111" }],
  });
};
test("Worker reads arbitrary public host without provider secret or provider calls", async () => {
  const calls = [];
  const response = await handleRequest(
    request({ url: "modepot.io" }),
    env,
    async (url, init) => {
      calls.push(url);
      assert.equal(init.headers.Authorization, undefined);
      return url.startsWith("https://cloudflare-dns.com/")
        ? dns(url)
        : new Response("Exact source.");
    },
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 3);
  assert.equal((await response.json()).text, "Exact source.");
});
test("Worker rejects client resolver/fetch options and exposes only safe stable errors", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw Error("secret raw upstream URL");
  };
  const malformed = await handleRequest(
    request({ url: "modepot.io", resolve: "bypass" }),
    env,
    fetcher,
  );
  assert.equal(malformed.status, 400);
  assert.equal(calls, 0);
  const unsafe = await handleRequest(
    request({ url: "http://127.0.0.1" }),
    env,
    fetcher,
  );
  assert.equal((await unsafe.json()).code, "unsafe_url");
  assert.equal(calls, 0);
  const unavailable = await handleRequest(
    request({ url: "modepot.io" }),
    env,
    fetcher,
  );
  assert.equal(unavailable.status, 502);
  const data = await unavailable.json();
  assert.equal(data.code, "dns_unavailable");
  assert.ok(!data.error.includes("secret"));
});
test("Worker maps upstream auth/access/rate errors without echoing upstream text", async () => {
  for (const [status, code] of [
    [401, "upstream_auth"],
    [403, "upstream_forbidden"],
    [429, "upstream_rate_limited"],
  ]) {
    const response = await handleRequest(
      request({ url: "unrelated.org" }),
      env,
      async (url) =>
        url.startsWith("https://cloudflare-dns.com/")
          ? dns(url)
          : new Response("SECRET", { status }),
    );
    assert.equal(response.status, status);
    const data = await response.json();
    assert.equal(data.code, code);
    assert.ok(!data.error.includes("SECRET"));
  }
});
