# Named-entity extraction investigation qualification

## Scope

Candidate-only presentation changes on the existing public-information draft. The tool is **Extract named entities**, with a short Named Entity Recognition (NER) explanation and **Extract entities** as its disclosed primary action. The server interpretation, question/schema composition, confidence values, limits and export format are unchanged.

Results distinguish unique exact-text/category groups, mentions and represented categories. Compact numbered occurrences link to the complete source, with selected category/name/position details. Four configured category slots have distinct theme-aware colours and visible category labels; shared spans retain both categories without duplicating source text. Source whitespace and validated offsets remain intact. JSON stays secondary. Selection does not call AI or change exports; edits/reset clear the workspace. ModePot attribution now uses the approved neutral identity; UtilityPot rose and sibling accents are preserved.

## Automated candidate checks

- 133 unit tests; 263 browser cases, including six new NER cases.
- 1280/1050/390/320px result investigation, keyboard jumps/return, exact download bytes and stale invalidation.
- Four default/custom category slots and overlapping same-name categories in Light/Dark/Auto. Rendered highlight text meets 4.5:1; category text meets 4.5:1; category markers/underline boundaries meet 3:1.
- Existing zero-result, correction, invalid-source, disclosure, first-action geometry, result focus, fixed discovery lane and privacy checks retained. No first-action/layout/privacy acceptance thresholds were relaxed.
- Actual Worker without a key and extracted release-artifact checks passed. Release tests, formatting, build/check, audit and dry-run checks passed before qualification. Final-head gates are also reported on the pull request.

Initial failed runs are retained separately: the inherited family mark rule overrode category fills, and old capability/count expectations still referenced the rejected wording. The scoped category cascade was fixed; expectations were updated to the new explicit labels rather than removing the tests.

## Real Jev, not fixtures

The actual candidate UI ran on loopback against the production interpretation endpoint through an explicitly scoped QA bridge. No production deployment, preview setting or traffic routing was changed. Inputs are synthetic qualification sentences, not visitor data. No responses were mocked and no inference was retried.

Both runs are retained in `ner-investigation-evidence.json`:

- Earlier presentation build: three successful interpretations (repeated names, distinct names, absent organization category), three original exports and one separate local-correction export. Accepted responses used Jev 1.13.0 and retained `needsReview: true`.
- Final UI source: two successful interpretations and two byte-verified exports. The repeated-name action returned HTTP 503 with `entity_starts_invalid`, `phase: followup`, `stage: 1`. No result was accepted and no export was produced for that failed action. It was not retried. The runner exited nonzero rather than describing the run as green.

Source spans, category/name expectations and keyboard navigation were verified on accepted responses. A regression reproduces the exact 503 payload and verifies preserved input, no result/download, restored primary action and no automatic retry. Inference validation and provider behavior are unchanged by this presentation batch; the observed rejection remains an unresolved inference reliability limitation, not a successful extraction or a proven fix.

The ledgers preserve action spacing, actual upstream status/model/request identifiers, raw scores, failures and export hashes. Both batches had zero browser page errors. Local screenshots and full ledgers remain under `test-results-live/ner-investigation-candidate/` and `test-results-live/ner-investigation-final/`. The committed evidence identifies the final UI source and static-dist manifest digest. Final-source accepted-case results do not erase the failed action or borrow the earlier run's success verdict.

Run the opt-in, billable protocol against an explicitly started candidate server:

```sh
NER_QA_ORIGIN=http://127.0.0.1:4475 node scripts/ner-investigation-live-qa.mjs
```

This is agent QA, not recruited-human usability research, universal semantic accuracy or a new inference capability. Limits remain 120 source tokens, four definitions and three mentions per type. The other AI utilities were not re-qualified with paid requests for this NER-only change.
