# UtilityPot

<p align="center"><img src="utilitypot.png?v=wordmark-2" alt="UtilityPot — Jev interprets. You review. Code executes." width="600"></p>

<p align="center">Part of <a href="https://modepot.io/">ModePot</a>. &nbsp; <a href="https://utilitypot.modepot.io/">Project website</a> &nbsp; <a href="https://tugrul.modepot.io/">Created by Tugrul Guner</a></p>

<p align="center"><strong>Jev interprets. You review. Code executes.</strong></p>

<p align="center">Open-source utilities for messy data, shared text, diagrams and planning. Bounded AI proposals become inspectable settings and exact operations—not arbitrary generated code.</p>

<p align="center"><a href="https://github.com/tugrulguner/utilitypot/actions/workflows/ci.yml"><img src="https://github.com/tugrulguner/utilitypot/actions/workflows/ci.yml/badge.svg" alt="CI"></a> <a href="https://discord.gg/u3AANZr6RG"><img src="https://img.shields.io/badge/Discord-ModePot-5865F2?logo=discord&logoColor=white" alt="ModePot Discord"></a> <a href="LICENSE"><img src="https://img.shields.io/github/license/tugrulguner/utilitypot" alt="MIT license"></a> <a href="https://github.com/tugrulguner/utilitypot"><img src="https://img.shields.io/github/stars/tugrulguner/utilitypot?style=flat" alt="GitHub stars"></a></p>

<p align="center"><a href="https://utilitypot.modepot.io/#tools">Browse tools</a> · <a href="#utilities">What ships</a> · <a href="#local-setup">Run locally</a> · <a href="https://utilitypot.modepot.io/privacy/">Privacy & limits</a> · <a href="docs/deployment-and-releases.md">Deployment & releases</a> · <a href="#contributing">Contribute</a></p>

**Live app:** https://utilitypot.modepot.io/ — free, no signup. Manual computation stays in your browser; optional AI interpretation sends only the disclosed context after consent.

## Utilities

- CSV to nested JSON: paste/upload, choose a grouping column, preview parent records and child rows. Custom schemas and Jev-assisted mappings are optional advanced controls; strings and literal headers are preserved.
- JSON to CSV: select a record array, flatten objects, explicitly omit/join/reject other arrays; escape spreadsheet formulas.
- Mixed spreadsheet dates: preserve original values, flag ambiguous dates and retain partial precision.
- Meeting time finder: reviewed one-off windows, exclusions, timezone-aware overlap and calendar export.
- Custom entity extraction: up to four definitions, three mentions per type and 120 source tokens. Exact offsets are validated; not exhaustive NER.
- Text to Mermaid: up to eight listed steps, reviewable graph, local flowchart rendering and Mermaid/SVG downloads. Not arbitrary code generation.
- Ask a webpage: exact supporting paragraphs with separate answer-presence judgment. Public URL reading is limited to documented approved hosts; other sources can be pasted. Not generated essays or independent fact verification.

## Simple workflows

Start with your source and the outcome-named action, then review the readable preview and copy/download. Entity and diagram corrections use normal controls; raw JSON import is optional. Meetings show either time fields or natural-language availability, never both at once. Webpage questions combine reading and evidence selection into one explicitly disclosed action. AI buttons explain what is sent to Jev/TypeSafe before you click; local modes never send your input.

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

For optional local inference, create a gitignored `.dev.vars` containing `TYPESAFE_API_KEY` through your own secure environment workflow. Do not put a key in browser variables, source, issues or chat. Never commit `.dev.vars` or print its values. Without a key, AI explicitly fails closed while manual converters and calculations remain usable.

## Verification

For product acceptance, run `npm run test:live` against the actual public webpage. This makes real, potentially billable Jev calls and records screenshots, responses and downloaded artifacts without network mocks. See [the live product QA report](docs/live-product-qa.md) for coverage, explicit manual corrections and currently outstanding production failures. Fixture-based regression tests are not a passing live-product gate.

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

Astro generates static assets; a small Cloudflare Worker owns `/api/utilities/interpret` and `/api/utilities/read-page`. The provider endpoint and questions are server-authored, not a generic AI proxy. One request has at most 24 Choice questions, a 16 KB body cap, a 15-second provider timeout and no automatic retries.

The `UTILITY_RATE_LIMIT` and `UTILITY_GLOBAL_RATE_LIMIT` bindings allow 6/client and 30/aggregate requests per minute **per Cloudflare location**. They are eventually consistent abuse controls, not exact global spend caps. Read-page requests share the same limits. Missing bindings fail closed. Configure provider-side spend limits before enabling public AI.

The production Worker is `utilitypot-site`, independent of `modepot-site` and LifePot. `wrangler.jsonc` declares the intended custom domain. The separate deployment workflow runs full CI and deploys only from `main` using the `production` environment and durable Cloudflare credentials. Tagged releases validate version/changelog and publish verified website artifacts, not npm/PyPI packages. Neither a configured route nor automation source proves a live deployment. See [deployment and releases](docs/deployment-and-releases.md) for prerequisites, release preparation and end-to-end verification. Do not repoint the umbrella Worker.

The compatibility date is supported by the bundled workerd runtime. No application input database, cookies, or session replay is introduced. PostHog page and coarse action analytics use a pseudonymous browser identifier in local storage and respect persisted SDK opt-out; pageview URLs retain only public paths, referrers are origin-only, and query strings, fragments, campaign identifiers and persisted acquisition values are removed. Events never include form values, provider context/results, or output. Copy/download events record user action intent, not successful clipboard or file transfer. See the user-visible `/privacy/` page for limits and third-party processing disclosures.

## Scope and limitations

Typed output does not guarantee semantic correctness. Names/categories, mappings, graph edges and source evidence require review. Cloudflare hosts request metadata; TypeSafe processes explicitly submitted AI context under its own terms. The application does not persist input histories or log raw provider bodies.

Mermaid is loaded only when rendering is requested; its renderer is a substantial optional download. Diagram output is generated from a validated graph, strict rendering is enabled, and the preview is placed in a sandboxed frame. URL reading uses an exact host allowlist, rechecks redirects, caps bytes/time and never executes source scripts.

## Contributing

Keep operations bounded and reviewable. Add tests before changing behavior, run all verification commands, and retain the distinction between fixture success and live-provider evidence. New remote-fetch hosts, budgets, storage or tracking require an explicit security/privacy review.

## License

[MIT](LICENSE).
