# Product-review fixes and qualification

## Delivery state

The latest UX fixes are committed and pushed. Current source `5f6544a87620aef75ed0a61d32787c4d1d28a104`, uploaded as non-production Worker `d01269c1-3dd1-45da-bdb2-fc7b96a5dc4b`, passed all 18 final live scenarios: 17 automatically and one with an explicitly recorded CSV mapping correction. Current local gates passed 68 unit/security, 6 release/contract and 77 browser tests, Worker execution, extracted-release execution, check/build/format and dependency audit.

The earlier intermittent repeated-name extraction HTTP 503 remains unexplained and is preserved below; do not describe later successful requests as establishing its cause or elimination. PR #9 remains draft pending disposition of that reliability risk. No production traffic was moved. Preview access was restored to disabled and production deployment metadata was unchanged.

See [fresh-user UX testing](./user-experience-testing.md) and [final machine-readable evidence](./product-review-final-evidence.json). The older failed-candidate evidence below is historical, not the latest run.

## Implemented changes

- Entity interpretation first selects and validates ordered starts, then asks endpoint questions conditioned on those starts and bounded before the next same-type mention. Source-span and overlap checks remain strict. There are at most two provider calls and 24 total questions, with no second call when all starts are absent.
- Rejected entity inference opens the manual mention editor with explicit correction instructions. A `none` endpoint still rejects the candidate; it is not silently accepted or omitted.
- Entity requests allow 35 seconds in the frontend for two bounded 15-second provider stages plus transit; other interpretation requests retain 20 seconds. A genuine 22-second local latency regression failed before the fix and passed afterward. This is explicitly a fixture regression, not live-provider evidence.
- Meeting inputs resolve listed city names such as London and New York, explicit supported IANA IDs/aliases, and UTC. Unknown or ambiguous cities require correction. Readable participant-local comparisons and a localized selector replace the default ISO dump; exact times remain under technical details.
- Changing the selected slot preserves the result and exports that exact calendar event. For the tested November 3, 2026 London/New York windows, the second slot exports `DTSTART:20261103T141500Z` and `DTEND:20261103T144500Z`.
- Completed off-screen extra-tool results are brought into view and accessibly focused, without changing source-revision cancellation. Actual mobile evidence at 390×844 shows the answer between approximately y=296 and y=621.
- Single JSON objects offer explicit one-row conversion. Multiple record arrays remain unselected. Nested arrays list paths and require an explicit stop/keep-as-JSON/omit policy; omission is never the default. String IDs and spreadsheet-formula protection remain intact.
- Wholly empty date input requests data; blank rows inside non-empty input remain preserved. Empty/malformed JSON and empty diagram input have actionable messages.
- The homepage leads with tasks, labels local versus AI processing, and discloses real input limits. Canonical artwork, family shell, provider disclosure, URL allowlists and DST semantics are unchanged.

## Local verification

The application source in runtime commit `2cbbea2876a2ec72841f87d4d834781cc893f903` passed:

- 67 unit/security tests, 6 release/contract tests, 73 browser regressions.
- Actual Worker execution and extracted-release Worker execution.
- Type checking (zero errors, warnings or hints), build, formatting and whitespace checks.
- Release bundle/checksums, Wrangler dry-run and dependency audit (zero vulnerabilities).

A subsequent QA-only fix gives the new real-provider acceptance runner an explicit 45-second response wait, exceeding the 35-second entity frontend deadline. A source-contract regression prevents accidentally reverting to Playwright's shorter default. CI exercises this additional regression as well.

## Independent review

The initial review's entity-recovery finding was addressed and independently confirmed. The next review identified the frontend/Worker timeout mismatch, which was reproduced with an actual 22-second delayed fixture and fixed. Follow-up confirmed that fix and identified the acceptance runner's separate 30-second default response wait; it now explicitly waits 45 seconds. No additional blocking security finding was reported. These code-review results do not clear the live failure below.

## Earlier browser/provider evidence and retained failure

The earlier application candidate was uploaded without deploying production:

- Runtime source: `2cbbea2876a2ec72841f87d4d834781cc893f903`.
- Worker version: `3e275fbf-0a9d-4439-bae2-a0a968d45d7d`.
- Standard run: `test-results-live/2026-10-15T14-51-58-095Z`.
- Targeted run: `test-results-live/product-review-2026-10-15T14-54-29.710Z`.
- Machine-readable retained summary: [`product-review-live-evidence.json`](./product-review-live-evidence.json).

The standard 11-scenario suite exercised every utility through the browser and real Jev: **10 automatic passes, one explicit CSV name-mapping correction, zero failed scenarios**. The manual correction is not an automatic AI success. The harness observed 11 successful interpretation envelopes; an entity interpretation can contain two underlying provider calls.

The seven targeted checks produced **six passes and one failure**. Meeting city selection/calendar export, one-row nested-array recovery, empty dates, fresh unique entities, no entities, and mobile source-backed answering passed. The original repeated-name paragraph returned HTTP 503 once with the sanitized verification error. Earlier candidates had passed that paragraph; those earlier passes do not override this result.

Eight subsequent paced real-provider diagnostic attempts against fixed-fixture version `5674b012-3fe9-4592-983c-cc2686ce9100` all returned HTTP 200 with two stages and the five expected spans. Captured responses were independently replayed through the actual provider-response validator and entity decoder. **The intermittent browser failure was not reproduced or explained by these captures.** Do not label it fixed because a retry passed.

Temporary preview enablement initially produced Cloudflare placeholder-page and static-asset 404s. The non-production wrapper records these and applies bounded navigation/readiness retries before any action. It never retries an inference failure and never substitutes responses. API requests and asset responses remain real. Browser instrumentation also observed sandboxed Mermaid iframe `navigator.serviceWorker` access errors during the standard run; graph rendering and both exports passed. The targeted suite recorded no page errors.

Preview settings were restored and read back as `enabled: false`, `previews_enabled: false`. The final full candidate run also compared production deployment metadata before and afterward and verified it was unchanged.

## Reproduction

After an approved deployment, run the browser checks against production:

```sh
npm run test:live
node scripts/review-product-qa.mjs
```

Both runners use real provider actions and generated downloads. The targeted runner paces requests by 13 seconds and tests the original repeated-name paragraph, additional names, an absent-entity input and mobile answering. Unsupported URL hosts, serial/timestamp date inputs, the entity token/match cap and eight-step diagrams remain disclosed capability limits, not silently broadened features.
