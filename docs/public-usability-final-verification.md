# Final public-usability qualification

Runtime source: `cf82c14fbdfc7e70d12a617e95eae8655d4b20d1` (the prior first-use commit is `b00d88c`). Ordinary non-production Worker: `28811494-1c28-43fa-ad38-956d23fdd5f9`. Later documentation-only commits do not change this tested runtime.

## Changes and deterministic checks

The seven-tool first-use work adds descriptive examples/outcomes, explicit replacement protection, useful bounded CSV/JSON previews and compact meeting controls. The public reader replaces the documentation-host allowlist with guarded public hostname reading. It retains the documented Cloudflare public-egress dependency, supplementary DNS checks, redirect checks, exact source evidence, consent, bounds and honest access/format fallback. DoH is not connection pinning and arbitrary Node-server safety is not certified.

The first hosted candidate exposed an actual Worker incompatibility: `redirect: "error"` is unsupported. A fixed synthetic diagnostic captured the exception. The reader now uses manual redirects and rejects resolver redirect responses; a captured-runtime regression observed RED/GREEN. HTML charset validation parses actual meta attributes rather than raw tag-like text. Quoted `>`, inert comments/templates/scripts and SVG/Math HTML breakouts have positive/negative regressions. The final focused review found no remaining blocking issue.

Local gates: **99 unit/security tests, six release/contract tests, 109 browser tests**, actual Worker execution and extracted-release execution, build/check/bundle/format/audit/dry-run. Zero dependency vulnerabilities; zero errors/warnings and one existing unused-parameter hint in Astro check. Exact runtime-head GitHub CI passed. Local provider fixtures are not live qualification.

## Real candidate: all seven utilities

**25 scenarios completed: 24 automatic passes and one recorded CSV mapping correction, no final failures.**

- Seven example-to-fresh-input workflows reached actual results/downloads. The fresh Alex Rivera scenario required no manual name correction.
- The standard 11-scenario suite completed with its explicitly recorded CSV mapping correction, not silently relabeled as automatic inference success.
- Seven targeted scenarios passed: city selection/calendar, single-object/nested-array recovery, empty-date recovery, original repeated entities, fresh names, no entities and actual mobile answer visibility.

Jev-backed actions used actual responses; local/private actions were not described as AI calls. Real source evidence and downloads were asserted. The mobile answer was within the measured viewport and focused. Existing sandboxed Mermaid service-worker warnings are not described as a universally clean browser console. This is agent-led qualification, not recruited-human research or comprehensive accessibility certification.

## Public-page scenarios and retained limits

**17 distinct reader scenarios have final expected outcomes: 15 passed and two Python.org access-denial outcomes.** These are not 17 successful source fetches.

ModePot-family pages and IANA were actually read. Bare `modepot.io` and its HTTP form proceeded through the browser to real Jev and exact-source quotations. Local-address and credential URLs were rejected; SVG media produced a content-specific error; pasted text still answered from its own source.

The initial final-candidate run had one API Python case stopped by the existing application rate limit. It was retained as a failure in that run. A separately paced follow-up returned the publisher's actual denial, as did the browser Python case. The UI displayed the access restriction and paste fallback rather than inventing an answer. No rate limit was weakened and no inference failure was silently retried.

The initial broken-DNS qualification, early non-JSON preview response, application rate limit and publisher denial remain in the evidence. Preview control-plane readiness was also made bounded: an accepted write can precede its readback, and a homepage can become available before the API. Readiness retries happen before application actions and are not substituted model outcomes.

## Complete entity spans

The original captured Jev result shortened both Alex Rivera mentions to Alex. Endpoint criteria previously showed only isolated end tokens such as `w1: Rivera`. They now show complete exact source spans with the same end-token IDs, source bounds, presence decisions, conditioned starts, validators and decode rules.

Six revised whitespace variants returned all four complete names automatically. Each still used two provider stages and ten questions; input context increased, so this is not claimed to have zero token overhead. There is no capitalization heuristic or deterministic name extension. Generic model uncertainty and exact-source manual correction remain applicable. See [the captured before/after evidence](./entity-full-span-evidence.json).

## Publication and rollout

These results qualify the versioned candidate, not production. Preview access was restored/read back as disabled, and production deployment metadata was verified unchanged. Merge/deployment still require explicit owner approval.

The accompanying ModePot provenance change tracks currently published UtilityPot main, not this unmerged branch. If UtilityPot is merged first, refresh that record to the actual resulting merge SHA and README hash before merging the provenance update.

Full per-case outcomes, raw retained qualification failures, the paced follow-up and exact final-candidate identifiers are in [machine-readable evidence](./public-usability-final-evidence.json). Original first-use implementation-phase notes are historical and do not replace this final qualification.
