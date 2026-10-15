# Outcome-first UX verification

This change redesigns the seven tool workflows, not the family identity or inference backend. Existing engines, `worker/index.js`, host/redirect allowlists, rate limits, analytics sanitizer, marks and artwork are unchanged. New client-only defaults live in `src/lib/utilities/outcome.js`.

## Normal journeys

- **CSV:** paste/upload, choose a grouping column, create nested JSON. Literal header names and string values are retained. Optional parent fields and custom Jev-assisted schemas are under Advanced; missing mappings remain explicit corrections.
- **Dates:** paste and Fix dates. Before/after output preserves invalid/partial/ambiguous rows. Format choices appear when relevant; contextual Jev interpretation is optional.
- **Meetings:** compact participant cards, searchable timezone choices, visible 30-minute duration default, and either local time fields or natural-language statements—not both at once. Missing zones/windows are not silently guessed.
- **JSON:** paste/upload and Convert. Exactly one record array is selected automatically. Multiple arrays and nested-array policies require explicit choices rather than silent data loss.
- **Entities:** category presets, one disclosed extraction action, highlights and readable mention/category/occurrence corrections. The manual editor and JSON import are optional disclosures, not empty mandatory setup panels.
- **Diagrams:** private sequential generation or disclosed relationship inference, rendered result first, optional label/type/destination editing, Mermaid/SVG export. A rejected AI interpretation is not relabelled as success; manual recovery is clearly separate.
- **Webpage:** URL/text tabs plus a question and Find answer. URL mode reads and interprets internally; exact excerpts, source link, inspected snapshot, no-answer state and truncation coverage are retained.

AI action copy explains what goes to Jev/TypeSafe before the click; no inference occurs on paste, upload or passive edits. Blanket review/consent checkboxes are replaced by informed actions and readable previews/corrections. Copy/download remains an explicit user action. Client data is not added to analytics.

## Executed gates

- 48 unit/security/helper/component tests passed.
- 5 release/identity/live-target contract tests passed.
- 65 browser regressions passed, including all seven desktop/mobile default journeys, uploads, bounded array choices, manual corrections, source cancellation, privacy-safe analytics, error classification and 16 first-action/editor-density/selected-state checks.
- Actual local Worker and extracted-release Worker browser tests passed separately.
- Astro check: zero errors, warnings or hints. Production build verifies 11 HTML routes and seven canonical tool pages.
- Format and diff checks passed. Release bundle creation/verification was local dry-run only; no release or deployment was created.

Tests were added RED before default helpers and density changes; observed density/editor failures were corrected, not waived. The implementation agent's sandbox could not start preview/Worker servers; all browser gates above were subsequently rerun successfully on the host. Fixture-backed regression tests remain explicitly labelled and are not live-provider evidence.

## Rendered inspection

A separate built-page audit covered all seven tools at 1280, 820, 768, 390 and 320 CSS pixels, in light/dark: 70 cases, no horizontal overflow, theme mismatch or visible control below the 44-pixel target tolerance. Closed native disclosure content is excluded with actual visibility checks, not just nonzero DOM rectangles.

At 390 pixels, the primary action starts at approximately 748px (CSV), 596px (dates), 1075px (two-person meetings), 643px (JSON), 774px (entities), 642px (diagram), and 745px (questions). The longer two-person meeting form still scrolls on mobile; it is not falsely reported as fitting entirely in the first viewport. Default visible text/select/file fields are reduced from 16 to 11 for meetings and from three to one for dates/entities; categories remain visible preset choices, not hidden requirements.

## Real Jev integration — not mocked

The candidate **local built UI** was driven against the actual production API through an owner-run, loopback-only forwarding bridge. The bridge allows only the two existing utility POST endpoints, caps bodies to the production limit, requires the local Origin/Host, forwards to the fixed HTTPS production origin, contains no credentials and does not replace response bodies. Operational logs contain only path/status/response size/Cloudflare request identifier, not submitted input.

```sh
BASE_URL=http://127.0.0.1:4548 npm run test:live
```

The latest recorded run is `test-results-live/2026-10-15T12-04-10-373Z` (gitignored). It prints its exact target and records real-upstream headers for local testing. There are no Playwright response routes or provider fixtures in this live suite. Calls are spaced at least 13 seconds apart.

**Observed:** 11 cases: nine passed, CSV passed after a recorded manual mapping correction, branching Mermaid failed with HTTP 503. Ten accepted responses identified `jev-1.13.0`. Actual output checks include JSON/CSV downloads, calendar instant, entity offsets/highlights, rendered Mermaid plus SVG/source downloads, fetched Python source evidence, absent-answer abstention and preserved date ambiguity. Corrections, failure responses and screenshots are retained; the failed branching case was not removed.

An earlier invocation used an unsupported environment-variable name, accidentally targeted the unchanged deployed UI, and failed before provider requests. That attempt is retained as a harness-targeting error, not counted as candidate product failures or successes. The target is now printed before the suite starts.

Independent focused review found no blocking issues. A final selected-tab visibility regression was also observed RED, corrected and rerun GREEN.

A separate real-backend recovery journey reproduced the branching HTTP 503, started the explicitly private manual draft, edited the decision destinations through normal controls, rendered the correct branches and downloaded the validated Mermaid source. It made exactly one inference request; the recovery did not retry Jev or pretend to be AI output.

## Scope and approval boundary

These results prove candidate UI + real backend integration, **not deployment of the new UI**. Production still has the older interface until this branch is explicitly approved and deployed. Repeat `npm run test:live` without a local override after that deployment.

The existing branching Mermaid HTTP 503 and CSV's unresolved name mapping remain backend/model-quality limitations. This change supplies readable correction/recovery paths without changing questions, probabilities, decode rules or claiming those failures are fixed. No source data or provider response was fabricated to make acceptance green.
