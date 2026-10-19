# UtilityPot

<p align="center"><img src="utilitypot.png?v=public-positioning-2" alt="UtilityPot — Focused browser tools for data, text, diagrams and planning. Review AI-assisted results; no arbitrary generated code." width="600"></p>

<p align="center">Part of <a href="https://modepot.io/">ModePot</a>. &nbsp; <a href="https://utilitypot.modepot.io/">Project website</a> &nbsp; <a href="https://tugrul.modepot.io/">Created by Tugrul Guner</a></p>

<p align="center"><strong>Focused browser tools for data, text, diagrams and planning.</strong></p>

<p align="center">Five tools work in your browser; three use bounded AI only after you ask. Review AI-assisted results; no arbitrary generated code.</p>

<p align="center"><a href="https://github.com/tugrulguner/utilitypot/actions/workflows/ci.yml"><img src="https://github.com/tugrulguner/utilitypot/actions/workflows/ci.yml/badge.svg" alt="CI"></a> <a href="https://discord.gg/u3AANZr6RG"><img src="https://img.shields.io/badge/Discord-ModePot-5865F2?logo=discord&logoColor=white" alt="ModePot Discord"></a> <a href="LICENSE"><img src="https://img.shields.io/github/license/tugrulguner/utilitypot" alt="MIT license"></a> <a href="https://github.com/tugrulguner/utilitypot"><img src="https://img.shields.io/github/stars/tugrulguner/utilitypot?style=flat" alt="GitHub stars"></a></p>

<p align="center"><a href="https://utilitypot.modepot.io/#tools">Browse tools</a> · <a href="#utilities">What ships</a> · <a href="#local-setup">Run locally</a> · <a href="https://utilitypot.modepot.io/privacy/">Privacy & limits</a> · <a href="docs/deployment-and-releases.md">Deployment & releases</a> · <a href="#contributing">Contribute</a></p>

**Live app:** https://utilitypot.modepot.io/ — free, no signup. CSV/JSON conversion, date cleanup, cron previews and meeting-time calculation stay in your browser. Entity extraction, flowchart interpretation and webpage evidence selection use bounded AI after disclosed consent. Each utility has one workflow, not an AI/manual mode chooser.

## Utilities

- CSV to nested JSON: paste/upload, choose a grouping column, preview parent records and child rows. Custom output shapes use explicit field mappings; strings and literal headers are preserved. No AI or input upload is used.
- JSON to CSV: select a record array, flatten objects, explicitly omit/join/reject other arrays; escape spreadsheet formulas. Numeric values that would be rounded are refused; quote long identifiers and high-precision values to preserve them.
- Mixed spreadsheet dates: preserve original values, flag ambiguous dates and retain partial precision.
- Meeting time finder: reviewed one-off windows, exclusions, timezone-aware overlap and calendar export.
- When will this cron run?: explain a standard five-field cron expression and preview the next five occurrences. Choose the schedule and display timezones separately; inspect dates and UTC offsets, then copy or download the run times. Browser-local, no AI; this does not schedule a job.
- Extract names from text: extract people, organizations and custom categories from source text up to 2 MiB. Review exact offsets, correct mentions and export JSON; AI results may miss or misclassify names.
- Text to Mermaid: up to eight listed steps, reviewable graph, local flowchart rendering and Mermaid/SVG downloads. Not arbitrary code generation.
- Ask a webpage: exact supporting paragraphs with separate answer-presence judgment. Read public HTTP/HTTPS pages by hostname, or paste text. Access-blocked, JavaScript-only, large or unsupported pages require pasted text. Not generated essays or independent fact verification.

## Simple workflows

Start with your source and one outcome-named action, then investigate the readable result and copy/download. The converters, date cleanup, cron preview and meeting calculator use explicit task settings and never call AI. Meetings use timezone-aware time fields, with optional exclusions. Entity and diagram corrections are ordinary post-result investigation, not alternative execution modes. Webpage questions combine source reading and evidence selection in one disclosed action. The three AI utilities explain what is sent to Jev/TypeSafe before you click; failures remain explicit and never silently switch execution methods.

Ask a webpage reads only the supplied URL, not links on that page. Adjacent source paragraphs are packed into byte-bounded answer requests without dropping source text; long sources can still need multiple requests. Packing is a transport boundary, not an instruction to quote the entire packet: Jev selects question-focused paragraphs or sentences, preserving necessary conditions while excluding unrequested navigation and promotions. Overview questions ask for the central subject and purpose, not every related detail. The reading surface puts the primary excerpt first, with inline citations, compact copy/download actions and expandable supporting details. Readable answer downloads and exact source-data exports remain available. A reader failure offers a report link beside the visible error with static page/tool context, never source text or questions.

## Local setup

Use Node 22.19+ (CI uses Node 22).

```sh
npm ci
npm run dev
```

Astro development serves static/manual workflows. Use a built Worker for API integration:

```sh
npm run build
npx wrangler dev --local --ip 127.0.0.1 --port 4398 --inspector-port 9398
```

For optional local inference, create a gitignored `.dev.vars` containing `TYPESAFE_API_KEY` through your own secure environment workflow. Do not put a key in browser variables, source, issues or chat. Never commit `.dev.vars` or print its values. Without a key, the three AI utilities explicitly fail closed while the five browser-local tools remain usable.

## Verification

The cron tool has deterministic scheduling regressions in `src/lib/utilities/cron.test.mjs` and real browser interaction/export checks in `tests/cron-explainer.spec.mjs` and `tests/cron-privacy.spec.mjs`. These run without AI or a server credential. They cover separate timezones, clock changes, leap-day schedules, invalid input, clipboard/download parity and zero API requests. Its preview follows the pinned cron-parser implementation, not a promise that every cron daemon handles DST identically.

For the original local4/AI3 workflows, run `UX_ORIGIN=<approved hosted origin> UX_RESULTS_DIR=<dedicated evidence directory> node scripts/focused-workspace-product-qa.mjs`. The runner accepts production or an approved immutable Worker preview, makes real, potentially billable Jev calls at least 13.5 seconds apart, and checks zero-API local computation, source spans, investigation controls and actual downloads. It saves every case, response, failure and screenshot; it does not mock requests or retry inference. Temporary previews must be approved and restored separately.

The [public-readiness report](docs/public-readiness.md), [generated ledger](docs/public-readiness-evidence.json), older 23-scenario `fresh-ux-product-qa.mjs` runner and [original live QA report](docs/live-product-qa.md) describe earlier workflows. They do not qualify this redesign or declare its deployment. Fixture-green CI is not live semantic qualification.

```sh
npm test
npm run check
npm run build
npm run test:browser
npm run test:worker
npm run test:release
npm run format:check
npm run release:bundle
npm run test:release-artifact
```

Browser AI-success tests intercept requests with explicitly labeled fixtures. They prove consent, transport consumption and review behavior, **not live Jev quality**. Unit tests also validate real typed-response envelopes and deterministic execution. The live-product report records real browser-driven Jev calls, outputs, manual corrections and remaining failures. Candidate local-UI tests against the real backend are labelled separately from deployed-UI verification. Automated success fixtures do not establish the accuracy of every utility or replace representative model evaluation.

## Server and deployment

Astro generates static assets; a small Cloudflare Worker owns `/api/utilities/interpret` and `/api/utilities/read-page`. The provider endpoint and questions are server-authored, not a generic AI proxy. Entity and diagram requests allow up to 24 typed questions; source-answer requests have a separate 32-question budget. The client request body is capped at 16 KB and each provider stage has a 15-second timeout. There are no automatic inference retries.

The `UTILITY_RATE_LIMIT` and `UTILITY_GLOBAL_RATE_LIMIT` bindings allow 6/client and 30/aggregate requests per minute **per Cloudflare location**. They are eventually consistent abuse controls, not exact global spend caps. Read-page requests share the same limits. Missing bindings fail closed. Configure provider-side spend limits before enabling public AI.

The production Worker is `utilitypot-site`, independent of `modepot-site` and LifePot. `wrangler.jsonc` declares the intended custom domain. The separate deployment workflow runs full CI and deploys only from `main` using the `production` environment and durable Cloudflare credentials. Tagged releases validate version/changelog and publish verified website artifacts, not npm/PyPI packages. Neither a configured route nor automation source proves a live deployment. See [deployment and releases](docs/deployment-and-releases.md) for prerequisites, release preparation and end-to-end verification. Do not repoint the umbrella Worker.

The compatibility date is supported by the bundled workerd runtime. No application input database, cookies, or session replay is introduced. PostHog page and coarse action analytics use a pseudonymous browser identifier in local storage and respect persisted SDK opt-out; pageview URLs retain only public paths, referrers are origin-only, and query strings, fragments, campaign identifiers and persisted acquisition values are removed. Events never include form values, provider context/results, or output. Copy/download events record user action intent, not successful clipboard or file transfer. See the user-visible `/privacy/` page for limits and third-party processing disclosures.

Action completions add only a bounded `failure_category` on failure: validation, request rejection, network, timeout, rate limit, service availability, unverified provider output, invalid response, presentation, cancellation or unknown. No exception text or response body enters analytics. A failed webpage read is a separate `read_page` attempt and does not create an AI interpretation attempt; successful operations retain their existing event contract. These events describe execution, not semantic answer quality or automatic alerts. `network` means Fetch returned no usable HTTP response; browsers deliberately do not distinguish connectivity, CORS and request-policy blocking at this boundary. `request_rejected` requires an observable HTTP denial. For `interpretation_unverified`, the Worker’s fixed phase distinguishes provider fetch/body failures from response-validation, follow-up and decode failures; missing or unrecognized phases remain unknown.

## Scope and limitations

Typed output does not guarantee semantic correctness. Names/categories, mappings, graph edges and source evidence require review. Cloudflare hosts request metadata; TypeSafe processes explicitly submitted AI context under its own terms. The application does not persist input histories or log raw provider bodies.

Mermaid is loaded only when rendering is requested; its renderer is a substantial optional download. Diagram output is generated from a validated graph, strict rendering is enabled, and the preview is placed in a sandboxed frame. URL reading supports public hostnames, rechecks URL/DNS safety on redirects, caps bytes/time and never executes source scripts. Hosted Cloudflare strictly-public fetch is the transport boundary; DNS preflight is supplementary, not connection pinning. See [public reader security and limits](docs/public-page-reader.md).

## Contributing

Keep operations bounded and reviewable. Add tests before changing behavior, run all verification commands, and retain the distinction between fixture success and live-provider evidence. Changes to remote-fetch security policy, budgets, storage or tracking require an explicit security/privacy review.

## License

[MIT](LICENSE).
