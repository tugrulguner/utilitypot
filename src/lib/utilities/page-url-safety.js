import ipaddr from "ipaddr.js";

const messages = {
  unsafe_url:
    "Use a public hostname with HTTP or HTTPS and its default port. IP addresses, local names and credentials are not supported. Paste page text instead.",
  unsafe_address:
    "This hostname does not resolve exclusively to supported public Internet addresses. Paste page text instead.",
  dns_unavailable:
    "Public DNS could not be verified. Try again or paste page text.",
  fetch_unavailable:
    "The public page could not be fetched. Try again or paste page text.",
  upstream_auth:
    "This page requires authentication. Paste text you can access instead.",
  upstream_forbidden:
    "This site denied the page reader access. Paste page text instead.",
  upstream_rate_limited:
    "This site is limiting requests. Try later or paste page text.",
  timeout:
    "Page reading exceeded the eight-second limit. Paste page text instead.",
  cancelled: "Page reading was cancelled.",
  unsupported_content:
    "Only HTML or plain text pages are supported, not PDF or binary files. Paste page text instead.",
  unsupported_encoding:
    "This page uses an unsupported text encoding. Use UTF-8 page text or paste it instead.",
  page_too_large:
    "This page exceeds the 250,000-byte reading limit. Paste a shorter excerpt instead.",
  empty_page:
    "No readable page text was found. The page may require JavaScript. Paste page text instead.",
  redirect_loop: "This page has a redirect loop. Paste page text instead.",
  redirect_limit:
    "This page exceeds the three-redirect limit. Paste page text instead.",
  unsafe_redirect:
    "This page redirects to an unsupported destination or downgrades HTTPS. Paste page text instead.",
};
export class PageReadError extends Error {
  constructor(code) {
    super(messages[code]);
    this.code = code;
  }
}
const fail = (code) => {
  throw new PageReadError(code);
};

export function canonicalPageUrl(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 2000 ||
    /[\s\\\x00-\x1f\x7f]/.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value) ||
    value.startsWith("//")
  )
    fail("unsafe_url");
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(value);
  if (absolute && !/^https?:\/\/[^/]/i.test(value)) fail("unsafe_url");
  const authority = (absolute ? value.split("//")[1] : value).split(/[/?#]/)[0];
  if (authority.includes("@")) fail("unsafe_url");
  let url;
  try {
    url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
    );
  } catch {
    fail("unsafe_url");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    fail("unsafe_url");
  const host = url.hostname.replace(/\.$/, "");
  if (
    host.length > 253 ||
    ipaddr.isValid(host) ||
    host.includes(":") ||
    !host.includes(".") ||
    !host
      .split(".")
      .every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))
  )
    fail("unsafe_url");
  if (
    /(?:^|\.)(?:localhost|localdomain|local|internal|intranet|private|lan|corp|home|arpa|test|invalid|example|onion|alt)$/.test(
      host,
    )
  )
    fail("unsafe_url");
  url.hostname = host;
  url.hash = "";
  return url;
}

// Conservative global-unicast policy. Reject entire special-purpose blocks,
// including globally reachable exceptions, rather than permit transition space.
const deniedV4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
].map(ipaddr.parseCIDR);
const deniedV6 = ["2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20"].map(
  ipaddr.parseCIDR,
);
const globalV6 = ipaddr.parseCIDR("2000::/3");
export function isGlobalAddress(value) {
  try {
    // DNS address records must use ordinary IP notation, not URL-style octal.
    if (typeof value !== "string" || value.includes("%")) return false;
    const ip = ipaddr.parse(value);
    if (ip.kind() === "ipv4")
      return (
        /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) &&
        value === ip.toString() &&
        ip.range() === "unicast" &&
        !deniedV4.some((range) => ip.match(range))
      );
    return (
      ip.range() === "unicast" &&
      ip.match(globalV6) &&
      !deniedV6.some((range) => ip.match(range))
    );
  } catch {
    return false;
  }
}

export function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", aborted));
  });
}
export function cancelBody(body) {
  // Cancellation is best effort and must never extend the shared deadline.
  try {
    Promise.resolve(body?.cancel()).catch(() => {});
  } catch {
    /* locked/closed */
  }
}
export async function boundedBytes(response, max, signal, code) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > max) fail(code);
      chunks.push(value);
    }
  } catch (error) {
    cancelBody(reader);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export async function boundedFetch(fetcher, url, init) {
  init.signal.throwIfAborted();
  const pending = Promise.resolve().then(() => fetcher(url, init));
  pending.then(
    (response) => {
      if (init.signal.aborted) cancelBody(response.body);
    },
    () => {},
  );
  return abortable(pending, init.signal);
}

// Supplementary DNS validation, NOT connection-time pinning. Hosted Workers'
// strictly-public global fetch is the actual egress boundary (see docs).
export async function validatePublicDns(host, fetcher, signal) {
  const normalize = (value) => {
    if (typeof value !== "string" || /[^a-z\d.-]/i.test(value))
      fail("dns_unavailable");
    try {
      return canonicalPageUrl(`https://${value}`).hostname;
    } catch {
      fail("unsafe_address");
    }
  };
  let totalAddresses = 0;
  try {
    for (const type of [1, 28]) {
      let name = host;
      const seen = new Set();
      for (let depth = 0; depth < 5; depth++) {
        if (seen.has(name)) fail("dns_unavailable");
        seen.add(name);
        const endpoint = new URL("https://cloudflare-dns.com/dns-query");
        endpoint.searchParams.set("name", name);
        endpoint.searchParams.set("type", String(type));
        const response = await boundedFetch(fetcher, endpoint.href, {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          signal,
          headers: { Accept: "application/dns-json" },
        });
        if (
          !response.ok ||
          !/^application\/(?:dns-json|json)(?:\s*;|$)/i.test(
            response.headers.get("content-type") || "",
          )
        ) {
          cancelBody(response.body);
          fail("dns_unavailable");
        }
        const data = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            await boundedBytes(response, 32768, signal, "dns_unavailable"),
          ),
        );
        if (
          data.Status !== 0 ||
          data.TC !== false ||
          !Array.isArray(data.Question) ||
          data.Question.length !== 1 ||
          normalize(data.Question[0].name) !== name ||
          data.Question[0].type !== type ||
          (data.Answer !== undefined && !Array.isArray(data.Answer))
        )
          fail("dns_unavailable");
        const records = data.Answer || [];
        if (records.length > 64) fail("dns_unavailable");
        const aliases = new Map(),
          addresses = [];
        for (const record of records) {
          const owner = normalize(record.name);
          if (record.type === 5) {
            const target = normalize(record.data);
            if (aliases.has(owner)) fail("dns_unavailable");
            aliases.set(owner, target);
          } else if (record.type === type) {
            if (!isGlobalAddress(record.data)) fail("unsafe_address");
            if ((type === 1) !== (ipaddr.parse(record.data).kind() === "ipv4"))
              fail("dns_unavailable");
            addresses.push(owner);
          } else fail("dns_unavailable");
        }
        let terminal = name;
        const chain = new Set([name]);
        while (aliases.has(terminal)) {
          terminal = aliases.get(terminal);
          if (
            chain.has(terminal) ||
            seen.has(terminal) ||
            chain.size + seen.size > 8
          )
            fail("dns_unavailable");
          chain.add(terminal);
        }
        if (
          [...aliases.keys()].some((owner) => !chain.has(owner)) ||
          addresses.some((owner) => owner !== terminal)
        )
          fail("dns_unavailable");
        if (addresses.length) {
          totalAddresses += addresses.length;
          break;
        }
        if (terminal === name) break; // Valid no-data for this family.
        if (depth === 4) fail("dns_unavailable");
        for (const member of chain) if (member !== terminal) seen.add(member);
        name = terminal;
      }
    }
    if (!totalAddresses) fail("dns_unavailable");
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof PageReadError) throw error;
    fail("dns_unavailable");
  }
}
