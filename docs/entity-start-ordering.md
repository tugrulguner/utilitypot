# Repeated-entity 503: captured cause and fix

## Reproduction, not another passing rerun

The original uninstrumented qualification had returned the application's generic HTTP503. Earlier repeated passes did not explain it. A new diagnostic run kept the paragraph and definitions unchanged semantically, varied only leading spaces, and captured both browser input and every actual Jev response. No failed inference was retried.

With two leading spaces, Jev returned HTTP200 and valid distributions but independently selected person starts `w0,w11,w11`. Its second and third ordinal questions chose the same source position. The application then threw **`Inconsistent entity starts.`** before asking endpoints and returned the reported generic503. Neither provider availability nor frontend timeouts caused this captured failure.

The captured second-person distribution supported the earlier `w5` (“Noah”) at 0.48, versus `w11` (“Mina”) at 0.51. The third-person distribution supported `w11` at 0.56. Consuming separate argmax winners discarded the alternative needed to satisfy the questions' shared source-order invariant.

The actual captured response is retained in [`entities-duplicate-starts-jev-1.13.0.json`](../src/lib/utilities/fixtures/entities-duplicate-starts-jev-1.13.0.json). Its regression failed on the old implementation with the exact exception before the fix.

The earlier uninstrumented request cannot retrospectively be assigned an exact exception. This is a newly captured reproduction of the same application error on the same paragraph, not a claim that all historical503s must share one cause.

## Correction

Compose each type's independently reported start distributions under the existing shared constraints:

- Keep already-valid ordered winners unchanged.
- Preserve the provider's presence/absence decisions; absent slots stay absent, and a mention after an absent slot still rejects.
- For conflicting starts, choose the strictly increasing token sequence with greatest sum of log probabilities, considering only positive-probability source-token alternatives.
- If no feasible supported sequence exists, reject rather than inventing a token or silently dropping mentions.
- Ask the existing conditioned endpoint questions about the composed starts. Endpoints, source slices, overlap checks and maximum span length remain mandatory.

This is constrained composition of independent distributions, not a claim that their product is a calibrated probability of overall correctness. Raw provider answers are not rewritten, and their confidence metadata remains the original distribution-concentration statistic. Every accepted plan still requires user review.

The change adds no provider request, question, retry, permissive fallback, input normalization or external API field. The existing maximum of two calls / 24 questions and 35-second entity client deadline remain intact. Impossible/malformed answers still fail closed and offer manual correction.

## Verification

Runtime source: `f9b6329488db7fbc57c6e5a8200b5f21f5e89190`.

- **Captured RED → GREEN:** the real duplicate-start response now composes to `w0,w5,w11`; exact original offsets, including leading spaces, are preserved.
- **250 seeded comparisons:** the decoder agrees with an independent exhaustive assignment oracle. Zero-mass alternatives, missing/gapped presence decisions, unknown tokens and impossible support still reject; provider answers remain immutable.
- **Worker seam:** a captured first-stage response and real captured endpoint response pass through normal response validation, conditioned questions and decoding in two calls within the question budget. These replay tests are fixtures, not additional live calls.
- **Independent review:** no blocking issues; checked conditional optimization, complexity bounds, source/absence safety and focused tests. The reviewer did not call providers.
- **25 real browser actions:** original paragraph plus 24 leading-whitespace variants, alternating desktop/mobile and custom/default categories, against diagnostic version `07a8eee4-56aa-42c7-8944-87190d06ad3c`. Every action returned200, two real provider stages and the correct five source spans. Thirteen raw start responses were duplicate/reversed and needed composition.
- **Old/new differential replay:** the exact same 25 captured start responses produce **13 `Inconsistent entity starts.` rejections in pre-fix source `3a295917d0a0e4d8874e6e0cad5831bc537ca5ed`**, versus 25 successful validated plans in the fixed source. This is evidence of a behavioral correction, not merely later successful model samples. See [case-level evidence](./entity-ordering-evidence.json).
- **Ordinary Worker, no diagnostic entry:** version `7432e80b-c5aa-42eb-a9c7-9fd42cd69456` passed all seven tools through the browser and real Jev: 18 scenarios, 17 automatic passes plus one explicitly recorded CSV mapping correction, zero failed scenarios. Original/fresh/absent entities, actual source-backed Q&A, selected calendars and mobile answer reveal passed.
- **Full deterministic gates:** 73 unit/security, six release/contract and 77 browser tests, actual Worker execution, extracted-release execution, check/build/format and zero dependency vulnerabilities.

Final live run directories are `test-results-live/2026-10-15T17-47-44-832Z/` and `test-results-live/product-review-2026-10-15T17-50-05.476Z/`. Temporary preview routing/asset404s were handled before application actions; inference failures were not silently retried. Sandboxed Mermaid frames emitted their existing service-worker access warnings while rendering/export checks passed; those warnings are not described as a clean browser console.

Both diagnostic and ordinary-candidate runs restored preview access to disabled. The ordinary run read back production deployment metadata and verified it was unchanged. No diagnostic entry was deployed to production and no production traffic was moved.

The formerly unexplained primary failure now has a captured mechanism, a failing-before/passing-after regression, differential replay and live qualification. This closes that code blocker; it does not promise that a provider can never be unavailable or that every model judgment will be correct.
