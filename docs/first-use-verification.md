# First-use simplification — implementation-phase local verification

This records the initial implementation phase. Parent follow-up reached 108 browser tests and completed real-provider candidate acceptance: 25 scenarios, 23 automatic passes and two explicit manual corrections. See `first-use-live-evidence.json`; original failures are retained. Publication/provider statements below describe this initial phase only.

Worktree base: `413043d`; branch: `feat/simpler-first-use`. No commits, publication, credentials or provider calls were used.

## Delivered behavior

- Each existing tool page has one descriptive example button (existing IDs retained) and a short expected-outcome helper. Examples load sample data only; they do not convert or submit to AI.
- Replacement uses native confirmation before mutation. Cancel preserves inputs, results and pending responses. Accept uses the existing revision lifecycle, clears uploaded file selection and invalidates stale results, including pending QA page reads. Auxiliary fields, participant changes and input entered before module initialization are protected.
- CSV says “Group rows by” and explains same-value grouping. The existing preview labels groups/items, expands the first group only when it has at most five items, and keeps technical JSON collapsed. Literal headers and string values are unchanged.
- JSON retains candidate paths/counts, explicit no-selection for multiple lists and the default Stop policy. The selected first record is displayed using `textContent`, capped at 1,000 characters plus a truncation marker. Existing nested-array paths explain Stop/Keep/Omit consequences.
- Meetings start with two people. Optional names and exclusions are collapsed; newly cloned people close their details even when the source participant’s details were opened. The sample uses the browser’s local date and explicitly describes sample availability. Exact scheduling fixtures retain explicit dates.
- Dates explain convention scope and retain ordinary, ambiguous, invalid and partial examples. Entities use a plain heading, repeated company mentions and accurate manual-correction guidance. Flowcharts make Mermaid an export format; the private approval example retains its branches when created, and fresh input clears the old plan. QA loads a passage, question and expected source quotation.
- Existing mobile action-position limits and homepage geometry remain covered without loosening their assertions. The only existing retry expectation change explicitly accepts its intended sample replacement.

## Observed RED → GREEN

Before implementation, ten initial first-use tests failed (labels/helpers, CSV expansion, JSON sample and hidden meeting names). The lifecycle run also recorded ten failures, covering auxiliary-only inputs and result/pending-read preservation; one textarea assertion was corrected to inspect its value rather than text content. The initial twenty focused tests then passed; file and pending-interpretation coverage expanded that to twenty-six passing tests.

A separate approval-flowchart test failed because Create diagram discarded the example branches; it passed after preserving the prepared graph. Another test failed for an auxiliary question entered before module initialization, then passed with comparison against declared defaults. Existing mobile density tests caught layout regressions; spacing/content were tightened rather than relaxing those checks. Initial failed logs remain in `/tmp/utilitypot-first-use-red*.log`, `/tmp/utilitypot-early-red.log` and `/tmp/utilitypot-browser.log` for this local session.

## Verification and limits

Final local results (Node 26.7.0):

| Command                         | Result                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm test`                      | 73 passed                                                                                    |
| `npm run test:release`          | 6 passed                                                                                     |
| `npm run check`                 | 0 errors, 0 warnings; 1 existing unused `url` hint in `src/lib/utilities/worker.test.mjs:90` |
| `npm run build`                 | Passed; 11 generated pages, 7 utility routes verified                                        |
| `npm run test:browser`          | 105 passed, including 28 focused first-use regressions                                       |
| `npm run test:worker`           | 1 passed, real local Worker fails closed without a key                                       |
| `npm run release:bundle`        | Passed; local dry-run bundle and checksums verified                                          |
| `npm run test:release-artifact` | 1 passed against the extracted local artifact                                                |
| `npm run format:check`          | Passed                                                                                       |
| `npm audit`                     | 0 vulnerabilities                                                                            |

The final mobile meeting screenshot was inspected locally at `/tmp/utilitypot-first-use-meeting.png`. No listeners remained on owned preview/Worker ports 4540–4544 or 4580 after verification. `git diff --check` passed. Worker inference and entity inference files, dependency manifests/lockfile, tracked Playwright configuration and family artwork were unchanged.

Browser AI responses are explicitly intercepted regression fixtures, never live Jev or human-participant evidence. Independent review, actual Jev tests and publication remain with the parent/owner. Worker inference, entity inference/math, budgets, host allowlist and calendar computation were not changed.

The targeted preview used port 4580 and was stopped before the normal browser suite on 4540. `ASTRO_PREVIEW_BACKGROUND=1` keeps Astro in the Playwright-owned process under this agent environment; no tracked Playwright configuration changed. All final commands use the existing Node 26.7.0 installation.
