# Human-numbered diagram choices

## Failure retained

Production at `1dd7b701b153e478e0155ba8d00dff8edec21a28` completed 22/23 readiness scenarios. The eight-step onboarding interpretation selected `n4` (human step 5, password reset) instead of `n3` (human step 4, account creation). The disconnected-step warning worked, but the interpretation was wrong. [The actual application response](diagram-routing-before-response.json) is retained; it is not a full provider probability trace.

Adding one-based metadata beside zero-based option names had not established reliable routing. The decoder copied the selected ID correctly, so this was not a demonstrated arithmetic off-by-one bug. Option-name ambiguity was a design hypothesis, not a proven internal model cause.

## Change

Provider destinations now use `step1` through `step8`, matching the human positions described in the instructions. A fixed map converts a validated selected destination into its original public graph ID (`step4` → `n3`). Conditioned role questions see the mapped graph IDs, just as before. `none` remains absent. Public graph IDs, labels, manual editing, source validation, applicable-branch rules, reachability warnings, total 24-question/two-stage budget and deadlines are unchanged.

No natural-language instruction parser, probability adjustment, inferred edge repair or automatic inference retry is introduced. Legacy raw IDs are rejected under the new provider contract rather than silently treated as differently numbered steps.

Historical captured provider fixtures are unchanged. Local regression adapters bijectively rename their option identifiers only, preserving their probability values and original destinations: old `n4` becomes `step5`, **not** `step4`. These adapted tests are explicitly not new live-provider evidence.

## Verification

The [generated ledger](diagram-routing-evidence.json) binds source `08db2ccf0a69645d60793528de6cf257d1a12aff` to candidate `395334c0-de7a-4d09-876c-9f367722b053`:

- All 117 unit tests, 132 browser regressions, six release tests, actual local Worker and extracted-release Worker checks passed, along with check/build/format/audit/dry-run.
- A fixed six-action real-Jev browser protocol passed 6/6 over five distinct inputs: the original failing onboarding task, stock-branch and start/end controls, fresh triage and reordered-grant tasks, and a predeclared repeat of onboarding. Every scheduled result counts; the repeat is not retry-until-success.
- Exact graph destinations, labels and relevant roles were checked, plus twelve real SVG/Mermaid downloads and mobile drawing/frame containment.
- The first setup attempt encountered preview static 404s and left actions disabled. It made zero inference attempts and is preserved separately. The completed run preflighted exact candidate assets and working private controls before paid actions.
- Preview settings were restored to `false/false`; production was unchanged. No inference was retried and no request was mocked.
- Independent runtime review found no P1/P2 blocker and passed 30 focused tests, including mapping and captured-distribution checks.

## Scope

This is a targeted candidate qualification, not universal natural-language correctness or human usability research. Production's 22/23 result remains the recorded production result until this change is separately approved, deployed and verified. No promotion, advertising, analytics or other utility engine changes are included.

To run the fixed live protocol against an approved origin:

```sh
UX_ORIGIN=https://utilitypot.modepot.io UX_RESULTS_DIR=test-results-live/diagram-routing node scripts/diagram-routing-live-qa.mjs
```

This uses real, potentially billable Jev actions through the public controls. Candidate preview enable/restore and credential resolution remain outside the application; uploaded versions do not receive production traffic automatically.
