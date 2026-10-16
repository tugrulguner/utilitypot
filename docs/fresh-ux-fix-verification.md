# Fresh UX fix verification

**Final complete hosted run: 13/13 scenarios passed, including 11 real Jev browser actions.** There were no uncaught page errors. One console 404 corresponded to a recorded Cloudflare preview navigation placeholder; it was retained, not relabelled as a clean navigation. No failed inference was retried. Original preview flags were restored and production deployment identity was unchanged.

The eight production-audit findings are implemented in this branch. The compact, generated [hosted evidence ledger](fresh-ux-fix-evidence.json) records the actual candidate version, application source commit, scenario outcomes, models, downloaded-file hashes and production/preview readback. Local fixtures are regression evidence, not live semantic qualification.

## What the fixes change

- JSON instructions use structured, contrastive array-policy criteria. Explicit manual choices remain authoritative through edits/uploads; loading a replacement example resets the visible policy and override together.
- Mobile CSV previews preserve complete values in a labelled, keyboard-focusable horizontal region, with column headings and a visible scrolling instruction.
- Evidence download/copy includes question, exact source snapshot, source kind, final URL where fetched, coverage/truncation and actual redirect-chain metadata. No retrieval timestamp is invented.
- Diagrams select relationships before source-aware node roles. The maximum remains 24 questions across two bounded provider stages; the client deadline covers both. Start terminals can lead onward. Contradictory intermediate endpoints are exposed for editing, not silently repaired.
- Boston resolves locally to America/New_York while retaining Boston identity through interpretation, comparison and calendar export. A searchable supported-city list makes the bounded capability discoverable; arbitrary places are not guessed or remotely geocoded.
- Discovery copy matches the guarded public-hostname reader.
- Named month/year and MM/YYYY dates preserve month precision, without inventing a day; accepted syntax is visible.
- Required-field checks give specific feedback/focus before API dispatch. Server safety/size/schema/rate checks remain in place.

## Reproduce the hosted checks

Build from the source corresponding to the uploaded candidate. After owner-approved preview enablement, run from the repository root:

```sh
npm ci
npm run build
UX_ORIGIN=https://VERSION8-utilitypot-site.tugrul-gunr.workers.dev \
  node scripts/fresh-ux-product-qa.mjs
```

Replace `VERSION8` with the uploaded version's actual eight-character prefix. `UX_ORIGIN` is required and restricted to this project's canonical or candidate hostnames. The script makes real, potentially billable Jev calls through the visible consent/action controls; it does not mock requests. It records outcomes incrementally, inspects downloads, captures desktop/mobile output and checks negative controls. It paces interpretation requests, does not retry failed inference, and exits nonzero for failed/empty/incomplete requested coverage. `UX_ONLY` may select exact comma-separated scenario IDs; partial runs report their actual scope, not full qualification.

HTML/module/font/style readiness is checked through the browser before paid actions. Bounded navigation retries apply only to the observed Cloudflare “There is nothing here yet” preview placeholder; ordinary application errors and failed interpretations are not retried. Earlier setup failures remain in the run artifacts.

Do not enable previews or deploy production merely to execute this command without the owner's authorization. Preview toggling/restoration is outside this credential-free runner. The owner-approved wrapper used for this qualification verifies exact original preview flags and unchanged production deployment before/after each run. It is intentionally not part of the application.

## Investigation of the failed runs

Three distinct problems were separated from application/model failures:

1. **The initial Python readiness probe was blocked by Cloudflare.** A direct comparison returned HTTP 403 with `error code: 1010` for Python urllib, while Node returned the expected HTTP 405 JSON `Use POST.` from the same candidate API. Cloudflare [documents 1010 as a client/browser-signature denial](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/). The old probe incorrectly summarized this as an unavailable API. No WAF or browser-integrity setting was weakened; actual Node/browser responses are used for application readiness.
2. **API/control-plane readiness did not establish HTML and asset readiness.** Browser attempts recorded Cloudflare's placeholder HTTP 404 for route HTML and JavaScript/CSS/font files after preview enablement, followed by successful responses. One run required ten static-readiness rounds. Another had a meeting-route placeholder after the JSON/CSV routes were ready. The runner now checks actual browser assets/private controls and handles this known placeholder per navigation before any model action. The internal Cloudflare routing/cache cause is not proven; this is not claimed as a repaired application defect or a guarantee of immediate preview availability.
3. **The meeting harness targeted a hidden optional field.** It attempted to fill a name before expanding “Name (optional).” That timeout occurred before interpretation. The corrected harness opens the real disclosure before entry. The corrected meeting run passed with real Jev, retained Boston and verified the selected 45-minute calendar slot. No user data or AI plan was manually corrected to turn that case green.

The initial aborted attempt retained its genuine successful JSON interpretation and its setup/closed-browser failures. A subsequent full run passed twelve cases and hit the meeting harness mistake; the targeted correction was kept separately. The final evidence ledger describes the complete final run rather than combining these earlier attempts into a fictional single pass.

## Regression and review evidence

The application changes passed 105 unit/security tests, six release tests, 119 browser regressions, actual local Worker and extracted-release execution, build/check, format, dependency audit and deployment dry run. The local full-browser launcher required a harness-only config for the owned daemonized Astro preview at the unchanged canonical test origin; no tracked runtime/test configuration was weakened. A formatting-only final-gate failure was corrected and formatting/audit/dry-run checks passed afterward.

Independent review found no P1/P2 blocker in runtime source `80e872b190ba3ff34e89ec91ab983b498f7112c6`, with 36 focused tests passing. Subsequent changes are test formatting and the verification runner/documentation; no production application source changed after that reviewed candidate.

This is hosted-candidate verification, not a claim that production already contains the fixes. It is agent-led desktop/mobile emulation, not recruited-human research, physical-device/accessibility certification or universal model accuracy. Production merge/deployment still requires explicit owner approval.
