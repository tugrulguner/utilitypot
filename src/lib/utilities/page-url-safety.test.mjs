import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  canonicalPageUrl,
  isGlobalAddress,
  validatePublicDns,
} from "./page-url-safety.js";

test("DNS requests use the captured hosted Worker redirect contract", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL("./fixtures/public-dns-modepot.json", import.meta.url),
      "utf8",
    ),
  );
  let calls = 0;
  await validatePublicDns(
    "modepot.io",
    async (value, init) => {
      if (!["follow", "manual"].includes(init.redirect))
        throw new TypeError(captured.capturedRuntimeError);
      assert.equal(
        init.redirect,
        "manual",
        "Resolver redirects must never be followed",
      );
      calls++;
      return Response.json(
        captured.responses[new URL(value).searchParams.get("type")],
        { headers: { "content-type": "application/dns-json" } },
      );
    },
    AbortSignal.timeout(1000),
  );
  assert.equal(calls, 2);
});
test("manual DNS redirect mode still rejects every resolver redirect", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      validatePublicDns(
        "modepot.io",
        async (_url, init) => {
          calls++;
          assert.equal(init.redirect, "manual");
          return new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/private" },
          });
        },
        AbortSignal.timeout(1000),
      ),
    { code: "dns_unavailable" },
  );
  assert.equal(calls, 1);
});
test("public hostname URLs canonicalize without a domain allowlist", () => {
  for (const [input, expected] of [
    ["modepot.io/path#part", "https://modepot.io/path"],
    ["https://UNRELATED.org:443/x", "https://unrelated.org/x"],
    ["http://example.net:80/", "http://example.net/"],
  ])
    assert.equal(canonicalPageUrl(input).href, expected);
});
test("unsafe and canonicalized IP URL forms are rejected", () => {
  for (const input of [
    "localhost",
    "host",
    "host.local",
    "host.internal",
    "host.home.arpa",
    "a.test",
    "a.invalid",
    "a.onion",
    "https://user:secret@modepot.io",
    "ftp://modepot.io",
    "https://modepot.io:80",
    "http://modepot.io:443",
    "https://modepot.io:8000",
    "https://modepot.io\n/",
    "https://127.0.0.1",
    "https://2130706433",
    "https://0177.0.0.1",
    "https://0x7f000001",
    "https://%31%32%37.0.0.1",
    "https://[::1]",
    "https://[::ffff:8.8.8.8]",
    "https://8.8.8.8",
    "//modepot.io",
    "https://modepot.io\\@localhost",
  ]) {
    assert.throws(() => canonicalPageUrl(input), { code: "unsafe_url" }, input);
  }
});
test("address classification excludes special IPv4 and non-global/transition IPv6", () => {
  for (const ip of [
    "0.0.0.0",
    "10.1.1.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.168.0.1",
    "192.0.0.9",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.1.1.1",
    "240.1.1.1",
    "::",
    "::1",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
    "100::1",
    "2001::1",
    "2001:db8::1",
    "2002::1",
    "3fff::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "bad",
  ])
    assert.equal(isGlobalAddress(ip), false, ip);
  for (const ip of [
    "1.1.1.1",
    "8.8.8.8",
    "104.16.1.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])
    assert.equal(isGlobalAddress(ip), true, ip);
});
const answer = (name, type, data) => ({ name, type, data, TTL: 60 });
const dns = (name, type, records) => ({
  Status: 0,
  TC: false,
  Question: [{ name, type }],
  Answer: records,
});
test("DoH uses fixed bounded requests and validates A, AAAA and CNAME chains", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push([url, init]);
    const u = new URL(url),
      name = u.searchParams.get("name"),
      type = Number(u.searchParams.get("type"));
    return Response.json(
      dns(name, type, [
        answer(name, 5, "edge.example.org."),
        answer(
          "edge.example.org",
          type,
          type === 1 ? "1.1.1.1" : "2606:4700::1111",
        ),
      ]),
    );
  };
  await validatePublicDns("modepot.io", fetcher, AbortSignal.timeout(1000));
  assert.equal(calls.length, 2);
  for (const [url, init] of calls) {
    assert.equal(new URL(url).origin, "https://cloudflare-dns.com");
    assert.equal(init.redirect, "manual");
    assert.deepEqual(Object.keys(init.headers), ["Accept"]);
  }
});
test("malformed, mixed, private, unrelated, cyclic and incomplete DNS fails closed", async () => {
  const records = [
    [answer("modepot.io", 1, "1.1.1.1"), answer("modepot.io", 1, "10.0.0.1")],
    [answer("modepot.io", 28, "::ffff:1.1.1.1")],
    [answer("unrelated.org", 1, "1.1.1.1")],
    [answer("modepot.io", 5, "localhost")],
    [
      answer("modepot.io", 5, "edge.example.org"),
      answer("edge.example.org", 5, "modepot.io"),
    ],
    [answer("modepot.io", 1, "garbage")],
    [],
  ];
  for (const recordsCase of records)
    await assert.rejects(
      validatePublicDns(
        "modepot.io",
        async (url) => {
          const u = new URL(url);
          return Response.json(
            dns("modepot.io", Number(u.searchParams.get("type")), recordsCase),
          );
        },
        AbortSignal.timeout(1000),
      ),
    );
  for (const body of [
    {},
    { Status: 2 },
    { Status: 0, Answer: "bad" },
    { Status: 0, TC: true },
    { Status: 0, Question: [{ name: "wrong.org", type: 1 }] },
  ])
    await assert.rejects(
      validatePublicDns(
        "modepot.io",
        async () => Response.json(body),
        AbortSignal.timeout(1000),
      ),
      { code: "dns_unavailable" },
    );
});
test("DNS transport errors, oversized bodies and excessive CNAME chains are bounded", async () => {
  for (const fetcher of [
    async () => {
      throw Error("secret");
    },
    async () => new Response("bad", { status: 503 }),
    async () => Response.json({ padding: "x".repeat(33000) }),
    async () =>
      new Response("not JSON", {
        headers: { "content-type": "application/dns-json" },
      }),
  ])
    await assert.rejects(
      validatePublicDns("modepot.io", fetcher, AbortSignal.timeout(1000)),
      { code: "dns_unavailable" },
    );
  let calls = 0;
  await assert.rejects(
    validatePublicDns(
      "modepot.io",
      async (url) => {
        calls++;
        const u = new URL(url),
          name = u.searchParams.get("name"),
          type = Number(u.searchParams.get("type"));
        return Response.json(
          dns(name, type, [answer(name, 5, `alias${calls}.example.org`)]),
        );
      },
      AbortSignal.timeout(1000),
    ),
    { code: "dns_unavailable" },
  );
  assert.equal(calls, 5);
});
test("empty userinfo and ambiguous slash forms are rejected before canonicalization", () => {
  for (const value of [
    "https://@modepot.io",
    "https:modepot.io",
    "https:///modepot.io",
  ])
    assert.throws(() => canonicalPageUrl(value), { code: "unsafe_url" });
});

test("CNAME-only responses are followed and IPv6-only public hosts are supported", async () => {
  const calls = [];
  await validatePublicDns(
    "modepot.io",
    async (url) => {
      const u = new URL(url),
        name = u.searchParams.get("name"),
        type = Number(u.searchParams.get("type"));
      calls.push([name, type]);
      const records =
        name === "modepot.io"
          ? [answer(name, 5, "edge.example.org.")]
          : type === 28
            ? [answer(name, 28, "2606:4700::1111")]
            : [];
      return Response.json(dns(name, type, records));
    },
    AbortSignal.timeout(1000),
  );
  assert.deepEqual(calls, [
    ["modepot.io", 1],
    ["edge.example.org", 1],
    ["modepot.io", 28],
    ["edge.example.org", 28],
  ]);
});
test("a public A result does not excuse private AAAA or a missing family response", async () => {
  for (const data of ["fc00::1", "2001:db8::1", "::ffff:1.1.1.1"])
    await assert.rejects(
      validatePublicDns(
        "modepot.io",
        async (url) => {
          const u = new URL(url),
            type = Number(u.searchParams.get("type"));
          return Response.json(
            dns("modepot.io", type, [
              answer("modepot.io", type, type === 1 ? "1.1.1.1" : data),
            ]),
          );
        },
        AbortSignal.timeout(1000),
      ),
      { code: "unsafe_address" },
    );
});
