# Public-page reader

The existing UtilityPot Worker reads public HTTP/HTTPS hostname URLs without a domain allowlist. Bare `modepot.io/path` becomes `https://modepot.io/path`. Only each protocol's default port is supported. Credentials, IP literals (including canonicalized numeric forms), local/intranet/special-use hostnames, unsupported schemes and control characters are rejected. Workers does not support direct IP URL fetching; use a public hostname.

## Transport boundary and accepted threat model

Production depends on Cloudflare hosted native global `fetch()` and its documented [public Internet egress boundary](https://developers.cloudflare.com/workers/reference/security-model/#api-design). The explicit [`global_fetch_strictly_public`](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public) compatibility flag routes requests through the public front door, avoiding the own-zone private-origin shortcut. Do not add private-network bindings or replace this transport without another security review.

This implementation accepts that platform dependency. Cloudflare does not enumerate every IANA-prefix implementation detail in that architecture documentation. The supplementary DNS policy below is conservative, but **DoH is not connection-time pinning and is not independently DNS-rebinding-proof**. The subsequent native fetch may resolve independently or retry another address. No custom Node Agent/lookup is involved. Unit fixtures, local Wrangler and arbitrary Node servers do not certify hosted egress, and this reader is not certified safe for arbitrary Node-server deployment.

## Defense in depth and bounds

- URL canonicalization and public-name checks run before DNS and again for every redirect. HTTPS cannot downgrade. At most three redirects/four page fetches; loops fail before another fetch. Discarded response bodies are cancelled.
- Fixed `https://cloudflare-dns.com/dns-query` requests validate A and AAAA answers and CNAME chains. Each family permits at most five queries, each response is capped at 32,768 decoded bytes and 64 answers; alias graphs are bounded and must lead to the returned addresses. Missing, malformed, truncated, cyclic, unrelated or non-global answers fail closed. At least one address is required, while one family may legitimately have no data.
- Exact dependency `ipaddr.js@2.5.0` supplies address parsing/classification, supplemented by conservative explicit special-purpose blocks. IPv6 must be global unicast in `2000::/3` and exclude special, documentation, reserved and transition ranges. Any private/non-global answer, including a mixed public/private result, rejects the read.
- One eight-second deadline includes DNS, every redirect, and streamed body consumption. Page bodies are capped at 250,000 decoded bytes delivered by native fetch, independent of `Content-Length`. Stream cancellation and abort signals bound stalled reads. Only HTML/plain text and UTF-8 (with or without an explicit UTF-8 declaration) are supported; malformed UTF-8 and conflicting HTML encoding declarations are rejected.
- Requests are fixed GETs with server-authored headers. No cookies, authorization, user headers, embedded-resource requests, scripts, proxy response forwarding or external scraper infrastructure. The DNS endpoint never receives provider secrets. Resolver/fetch/deadline injection is server-owned test code, not JSON request options.
- Extraction preserves existing exact-source behavior, limits to 10,000 characters/100 paragraphs and reports truncation, canonical final URL and bounded redirect provenance. The UI retains the fetched source snapshot and revision guards. A failed read stops the action before any AI request.
- Stable error codes distinguish URL/address safety, DNS/fetch availability, upstream 401/403/429, timeout/cancellation, content/encoding, size, empty/JavaScript-only pages and redirects. Messages do not echo raw exceptions, upstream bodies, credentials or URLs. Existing fail-closed budgets, consent and analytics remain unchanged.

## Access limits and verification

Public URLs are supported broadly; this is not a browser, login or paywall bypass. Anti-bot/access rules, JavaScript-rendered pages, non-UTF-8 pages, large pages and PDFs may require pasted text. Requests disclose the hostname to Cloudflare DNS and the requested URL to the destination site through Cloudflare. No application input history or raw-input logging is added.

Tests use server-owned DNS/fetch fixtures, including unsafe/private targets without contacting those targets. They establish application policy and UI behavior, not live provider quality or hosted transport certification. Live Worker reads of ModePot and an unrelated public URL are a separate owner-run acceptance step. No deployment or credential access is required for local fixture verification.
