# Utility workspace qualification

Candidate-only: no merge or production deployment. This branch covers JSON-to-CSV, meeting setup, webpage evidence presentation and the ModePot attribution copy; it does not yet wire document entity extraction into the browser.

## Verified behavior

- JSON: select a unique row source automatically, ask only for multiple supported lists, show meaningful names/counts and a two-row/four-field table. Preserve exact long numeric strings in downloaded CSV; clear stale previews when JSON becomes invalid. Parsing, formula protection and explicit nested-list handling remain local.
- Meetings: date/duration and city-first cards lead; local 09:00–17:00 presets remain editable in native disclosures. Optional controls follow Find times. Existing timezone, DST and calendar/export tests remain intact.
- Webpage evidence: question/outcome and exact quote lead; source link, quote copying and collapsed provenance support investigation. Single passages do not display redundant passage navigation. Original JSON export fields remain unchanged. Reader policy and inference code are unchanged.
- ModePot attribution uses the canonical mark from ModePot draft 42, source revision `210d7313c1e6d5d452c16960d1be6a4aa07c26ed`, path `public/modepot-mark.svg`, SHA-256 `ea58a6d4df5ed88aee93e7cdff532f7b697e64fc97310552cbb3f4ed578f6f1c`. The versioned consumer and contrast-checked light/dark spectrum are confined to ModePot; sibling accents remain unchanged. Pair this identity update with ModePot 42 rather than claiming the umbrella is already live.

## Local gates

- 133 unit tests; 276 browser tests; actual local Worker test; 10 release tests; deployment bundle and extracted-archive test.
- Astro check/build, Prettier check, npm audit (zero vulnerabilities), Wrangler deployment dry-run.
- Actual JSON and meeting desktop/mobile captures were inspected. Browser model fixtures are layout/state tests, not provider-quality evidence.

Earlier failures are retained in the session evidence: obsolete workflow assertions, a missing row-choice-control ID that stopped preview refresh, and one mobile entity-navigation viewport failure. The final unchanged full browser rerun passed 276/276. The latter passing rerun is observed recovery, not a demonstrated repair of that unchanged entity-navigation behavior.

## Fresh genuine-provider webpage journey

The actual built candidate UI was served on isolated loopback and its normal API requests forwarded to the existing production API, with the approved production Origin. No inference response was fabricated and no failed request was retried. This is candidate qualification, not proof of a production rollout.

- Source: `https://example.com/`; question: “What is this domain intended for?”
- Public-reader HTTP 200, one interpretation HTTP 200, actual model `jev-1.13.0`, one exact source excerpt.
- Verified exact source offsets/text, native Copy quote clipboard bytes, and downloaded JSON excerpt equality. No browser page errors.
- Actual desktop/mobile result screenshots inspected.
- Local evidence: `test-results-live/page-evidence-current/{ledger.json,evidence.json,answer-desktop.png,answer-mobile.png}`. The ledger distinguishes the genuine response from browser fixtures. Local evidence is not a remotely published artifact.

## Review corrections

Confirmed and fixed two review findings: a cleared meeting-hours input hidden inside a collapsed disclosure now reopens and receives focus, and ModePot gradient lettering has a visible system-colour fallback under forced colours. Both regressions failed before the fixes and passed afterward. Eight focused browser checks and the unit/check/build gates passed on the corrected source. A fresh 12-repeat mobile entity-navigation run also passed; it is not a demonstrated repair of the earlier intermittent scroll failure.

Independent review, current remote CI, and authorized deployment/public readback remain separate acceptance steps. Full-text entity extraction still needs its separate core/browser integration and actual candidate Worker qualification; the old production API cannot establish the new extraction contract.
