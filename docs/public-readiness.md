# Public-readiness verification

This report records a bounded readiness gate for UtilityPot's seven tools, not universal model accuracy, recruited-human usability research, or a production deployment. The generated [evidence ledger](public-readiness-evidence.json) identifies the exact candidate, source revisions, scenario outcomes, models, download hashes, and production/preview readbacks. Earlier failures remain evidence; a successful follow-up does not erase them.

## Confirmed failures and changes

### JSON numeric integrity

Fresh public-site conversion changed numeric transaction identifiers `9007199254740993` and `9007199254740995` in both the preview and actual downloaded CSV. Native JavaScript parsing had already rounded them before serialization.

Raw source is now checked before native parsing, record previews, AI sampling and conversion. Values that would change when represented as a native number are refused with guidance to quote identifiers or high-precision values. Quoted identifiers, ordinary decimals, equivalent exponent notation and true zero are accepted. A browser regression exercises paste, upload, no API dispatch on unsafe source, correction and the exact downloaded digits. Follow-up review caught and fixed an exponent-zero false positive and an error-message masking bug.

This is a fail-closed guard, not an arbitrary-precision arithmetic implementation. JSON numeric formatting is not preserved verbatim (`0.10` may become `0.1`); identifiers needing exact lexical representation should be strings. A caller handing `jsonToCsv` an already-rounded JavaScript object cannot recover original source digits.

### Startup readiness and recovery

Controls previously looked usable even when their controller module had not loaded. Buttons are now disabled in server-rendered HTML and enabled only after controller initialization. A small independent inline bootstrap reports loading/failure and preserves copyable input; a static JavaScript-required notice and noscript guidance cover disabled scripting. There is no automatic page reload or inference retry.

Dedicated browser regressions deliberately fail or hold the main/extra modules, verify recovery messaging and no API calls, and prove early pasted input survives successful initialization. Every tool's server-rendered disabled-script path is tested. These are labelled fault-injection regressions, not live provider results.

The original production startup incident also recorded transient asset 404s. Its complete failing-navigation request trace was not available, so the deeper Cloudflare/cache cause is not claimed as established or repaired. The application fallback cannot fix a document that the hosting edge does not deliver.

### Entity interpretation

An unfamiliar text containing three person mentions returned only two. Fixed synthetic provider instrumentation reproduced that omission and a separate third-person omission while preserving full typed answers and probabilities. The captured third-start answers selected `none`; the decoder was not discarding an otherwise selected third person.

A wording-only proposal recovered a person but omitted a company instead and was rejected. A second experiment changed only selectable-token criteria: each unchanged token ID now includes its exact source position and the following bounded five-token source context. That experiment selected all expected mentions in the repeated-name, three-distinct-person and absent-entity cases, including exact endpoints. The candidate uses the measured token-context change, not the failed wording proposal.

No missing mention is filled heuristically. Absence decisions, raw probability distributions, positive-support ordering composition, exact source/overlap validation, 120-token/four-type/three-mention limits, at most 24 total questions and at most two provider stages are preserved. Three diagnostic cases are limited evidence; the UI's review requirement and non-exhaustive-extraction disclosure still apply.

### Diagram relationships and reviewability

A real eight-step onboarding proposal routed its affirmative branch past account creation, leaving that required step disconnected. Human-facing step numbers are now explicit alongside the unchanged zero-based node IDs in model state and criteria. This removes a representation ambiguity; it is not a claim to know the model's internal reason for the original wrong choice.

Unreachable steps now produce actionable review warnings, including the possibility of an intentional separate entry point. No edge is invented or repaired. Existing start/end-role checks, speculative false-branch handling and the 24-question/two-stage budget remain intact. Regression tests replay the actual disconnected graph, check loops and valid branches, and verify original graph IDs/labels are unchanged.

Pixel inspection found another gap after semantic checks passed: a correct tall SVG was clipped inside a fixed 480px preview. The sandboxed frame now follows the renderer's finite positive viewBox dimensions, caps itself to native SVG width on desktop and scales responsively on mobile. The complete graph can be reviewed with normal page scrolling. A RED/GREEN browser regression verifies both mobile visibility and desktop sizing. Strict rendering and the empty iframe sandbox remain in place; downloads retain the original SVG/Mermaid.

## Qualification scope

The live runner retains thirteen earlier regression scenarios and adds ten readiness scenarios: seven fresh ordinary tool tasks, two additional entity controls, and the numeric-integrity safety/recovery control. These are scenarios, not twenty-three independent users. A successful refusal followed by quoted-source correction is a safety/recovery success, not automatic interpretation of the original unsafe number.

The tasks cover expense-array selection versus audit logs, a custom volunteer schema with quoted commas and string hours, Irish date context with invalid/leap/partial/blank dates, repeated and distinct names plus an absence control, an eight-step conditional onboarding graph, an unrelated public RFC with exact source provenance, and three-city availability/exclusions with a selected calendar download. Assertions inspect actual file contents and source spans, not just HTTP 200 or download events. Requests are paced and failed inference is not retried.

Separate desktop checks use native Tab navigation at 1280×900 on all seven routes. Mobile captures use 390×844. Download, rendering, keyboard and semantic observations are separate evidence dimensions, not additional user successes. The initial independent browser audit was incomplete for desktop keyboard and actual exports; those omissions were not treated as an all-clear and were covered by parent-run checks.

## Reproduce

```sh
npm ci
npm test
npm run test:release
npm run check
npm run build
npm run test:browser
npm run test:worker
npm run release:bundle
npm run test:release-artifact
npm run format:check
npm audit
npx wrangler deploy --dry-run
```

Live qualification makes real, potentially billable provider calls through the actual controls:

```sh
UX_ORIGIN=https://utilitypot.modepot.io node scripts/fresh-ux-product-qa.mjs
```

A candidate origin may be supplied instead. Uploaded versions are not production deployments. Enabling disabled candidate previews requires owner approval; the qualification wrapper restores and freshly reads back original preview flags and checks unchanged production. That credential-resolving wrapper and fixed-synthetic diagnostic Worker are intentionally outside the application/release. Neither diagnostic Worker was deployed to production.

## Operational scope and remaining limits

Existing rate limits, request/response bounds, deadlines, sanitized failures, consent, input-content analytics exclusions, reader DNS/redirect validation and hosted strictly-public egress are preserved. No tracking, storage or fetch-access expansion is introduced.

Provider account billing and alert settings were outside this qualification's scope and were not changed. Hard spending caps and budget alerts are not certified by these results; existing application abuse controls are retained.

A public site can still encounter hosting, publisher-access or provider failures. AI proposals can be semantically wrong despite valid schemas; review and manual correction remain part of the product. This gate does not establish exhaustive extraction, arbitrary webpage access, physical-device/accessibility certification, human first-use success or a reliability SLA. Production merge/deployment remains a separate owner-approved action.
