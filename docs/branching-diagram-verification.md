# Branching diagram verification

## Root cause and bounded correction

The original, unchanged four-step order workflow repeatedly returned HTTP 503 from production. An approved fixed-fixture diagnostic Worker version captured a real `jev-1.13.0` response: the decision at `n1` correctly selected `n2` for yes and `n3` for no. The independent false-branch questions also selected destinations for terminal nodes `n2` and `n3`. The decoder incorrectly required those inapplicable answers to be `none` and rejected the entire graph with `Inconsistent decision branches.`

False-branch answers are now consumed only for nodes classified as decisions. Actual decision branches still reject duplicate yes/no destinations and invalid source-node references. Model-response validation, confidence metadata, source labels, manual review, budgets, protection, escaping, rendering and downloads are unchanged. This follows TypeSafe's documented speculative fan-out rule: code ignores answers whose branch does not apply.

The regression fixture is the captured real provider answer, not a fabricated successful response. The fixture reproduced the exact decoding exception before the correction and passed afterward. Additional tests preserve invalid-decision rejection and exercise every allowed irrelevant destination.

## Real, non-production acceptance

- Runtime commit: `f44ce0e` (`fix: ignore inapplicable speculative diagram branches`).
- Worker version: `6ffd28fd-579d-4e89-b66b-cd26172f8791`.
- Tested origin: `https://6ffd28fd-utilitypot-site.tugrul-gunr.workers.dev`.
- Mode: **non-production Worker version UI + real Jev**, without response mocks.
- Reused the full production browser acceptance harness, changing only its explicit target origin/mode in a temporary scratch copy. Consent/actions, API responses, output assertions and downloaded-file checks were retained.
- Evidence: `test-results-live/2026-10-15T13-12-21-393Z/{results,summary}.json` in the verification worktree.
- All 11 scenarios completed: 10 passed without corrections; CSV passed with the existing, explicitly recorded customer-name mapping correction; zero failed. All 11 interpretation responses identified `jev-1.13.0`.
- The original branching instructions were unchanged: HTTP 200, both correct decision edges, actual Mermaid SVG rendering, and validated Mermaid/SVG downloads. No added user clarification or manual graph repair was needed.
- The temporary preview-routing setting was restored and read back as `enabled=false`, `previews_enabled=false`. No production deployment was made.

## Local gates

52 unit/security tests, 5 identity/release tests, 65 browser regressions, actual Worker acceptance, extracted-release Worker acceptance, Astro check/build, release-bundle verification, formatting and diff checks passed. The extracted-release gate was rerun after generating its required bundle.

## Release boundary

This proves the candidate fix through an uploaded Worker version, not that production is repaired. Merge/deployment and production readback require separate authorization. CSV's remaining manual correction is not relabeled as automatic inference success.
