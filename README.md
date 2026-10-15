# UtilityPot

**Jev interprets. You review. Code executes.**

Focused public utilities for data, text, diagrams and planning. Part of [ModePot](https://modepot.io/), created by [Tugrul Guner](https://tugrul.modepot.io/).

Intended production origin: **https://utilitypot.modepot.io/**. The source implementation is available; a configured origin is not proof of deployment or live inference.

## Utilities

- CSV to nested JSON: editable column mappings, parent grouping and one child array; preserves strings.
- JSON to CSV: select a record array, flatten objects, explicitly omit/join/reject other arrays; escape spreadsheet formulas.
- Mixed spreadsheet dates: preserve original values, flag ambiguous dates and retain partial precision.
- Meeting time finder: reviewed one-off windows, exclusions, timezone-aware overlap and calendar export.
- Custom entity extraction: up to four definitions, three mentions per type and 120 source tokens. Exact offsets are validated; not exhaustive NER.
- Text to Mermaid: up to eight listed steps, reviewable graph, local flowchart rendering and Mermaid/SVG downloads. Not arbitrary code generation.
- Ask a webpage: exact supporting paragraphs with separate answer-presence judgment. Public URL reading is limited to documented approved hosts; other sources can be pasted. Not generated essays or independent fact verification.

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

```sh
npm test
npm run check
npm run build
npm run test:browser
npm run test:worker
npx wrangler deploy --dry-run
```

Browser AI-success tests intercept requests with explicitly labeled fixtures. They prove consent, transport consumption and review behavior, **not live Jev quality**. Unit tests also validate real typed-response envelopes and deterministic execution. Live provider verification requires a separately available server-side credential; no public AI launch should be claimed until exercised.

## Server and deployment

Astro generates static assets; a small Cloudflare Worker owns `/api/utilities/interpret` and `/api/utilities/read-page`. The provider endpoint and questions are server-authored, not a generic AI proxy. One request has at most 24 Choice questions, a 16 KB body cap, a 15-second provider timeout and no automatic retries.

The `UTILITY_RATE_LIMIT` and `UTILITY_GLOBAL_RATE_LIMIT` bindings allow 6/client and 30/aggregate requests per minute **per Cloudflare location**. They are eventually consistent abuse controls, not exact global spend caps. Read-page requests share the same limits. Missing bindings fail closed. Configure provider-side spend limits before enabling public AI.

The intended Worker is `utilitypot-site`, independent of `modepot-site` and LifePot. `wrangler.jsonc` declares the intended custom domain. The separate deployment workflow runs full CI and deploys only from `main` using the `production` environment and durable Cloudflare credentials. Tagged releases validate version/changelog and publish verified website artifacts, not npm/PyPI packages. Neither a configured route nor automation source proves a live deployment. See [deployment and releases](docs/deployment-and-releases.md) for prerequisites, release preparation and end-to-end verification. Do not repoint the umbrella Worker.

The compatibility date is supported by the bundled workerd runtime. No application input database, cookies, SDK tracking or session replay is introduced. See the user-visible `/privacy/` page for limits and third-party processing disclosures.

## Scope and limitations

Typed output does not guarantee semantic correctness. Names/categories, mappings, graph edges and source evidence require review. Cloudflare hosts request metadata; TypeSafe processes explicitly submitted AI context under its own terms. The application does not persist input histories or log raw provider bodies.

Mermaid is loaded only when rendering is requested; its renderer is a substantial optional download. Diagram output is generated from a validated graph, strict rendering is enabled, and the preview is placed in a sandboxed frame. URL reading uses an exact host allowlist, rechecks redirects, caps bytes/time and never executes source scripts.

## Contributing

Keep operations bounded and reviewable. Add tests before changing behavior, run all verification commands, and retain the distinction between fixture success and live-provider evidence. New remote-fetch hosts, budgets, storage or tracking require an explicit security/privacy review.

## License

[MIT](LICENSE).
