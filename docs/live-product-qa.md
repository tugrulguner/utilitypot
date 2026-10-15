# Real production product QA

`npm run test:live` opens **https://utilitypot.modepot.io/** in Chromium, fills fresh synthetic user inputs, accepts the actual consent controls, clicks **Ask Jev**, reviews the returned proposals and validates real downloads/rendered output. It does not intercept, fulfill, replace or mock network responses. `source: jev`, real model identifiers, HTTP status and non-service-worker responses are checked. No browser API key is needed or exposed.

This makes **real, potentially billable Jev calls** against production. Calls are paced at least 13 seconds apart to respect existing per-client limits. Do not bypass throttling or run many copies concurrently. Install Chromium once with `npx playwright install chromium`.

```sh
npm run test:live
# Focused repeat, preserving a new evidence directory:
UTILITYPOT_CASES=csv-to-nested-json,text-to-mermaid npm run test:live
```

Evidence is written incrementally under gitignored `test-results-live/<run timestamp>/`: screenshots, received API envelopes, output downloads, per-case failures and summary JSON. This is test-authored data/public documentation only; never substitute private customer input. Failed first attempts are retained. Explicit user-review corrections are recorded separately; they are not silently rewritten into successful model answers.

## Coverage

- CSV → nested JSON: real column/grouping proposals, source-preserving export, leading-zero identifiers.
- Mixed dates: real numeric-convention choice, partial dates, invalid leap day and an unresolved-ambiguity case.
- Meeting finder: real natural-language window interpretation, London/India offset calculation and actual calendar export.
- JSON → CSV: actual record-array selection and a validated flattened CSV download.
- Entity extractor: real people/employer spans, exact offsets, repeated mentions, highlighting and JSON export.
- Mermaid: real node/branch proposals, iframe rendering, Mermaid and SVG exports.
- Webpage questions: real answer-bearing excerpt selection, exact offsets, absent-answer abstention, plus reading an actual Python documentation URL and asking about its fetched text.

## Observed production results

The initial full live run returned **7 passes and 3 failures out of 10 checks**, using `jev-1.13.0` for accepted model responses. This is not a green production acceptance result.

- Dates, meeting times, JSON → CSV, entity extraction, pasted-source evidence, absent-answer abstention and preserved date ambiguity passed with real webpage-originated Jev calls.
- CSV's real proposal left the `name` mapping unresolved. A focused follow-up used the visible review dropdown to select `CustomerName`, then successfully downloaded and checked the grouped JSON. That is **a pass after a recorded manual correction**, not correct automatic inference.
- The branching Mermaid case returned **503** twice from the real production interpretation endpoint. Its internal validation failure is not yet isolated; this change does not claim to fix it. A separate **sequential Mermaid** case succeeded with real Jev, rendered on the webpage, and produced verified Mermaid/SVG downloads; that success does not erase the branching failures.
- The public Python-page reader returned a 3,909-character source split into **145 paragraphs**. The next **Ask Jev** action was rejected with **400** because QA permits at most 100 paragraphs. The reader accepted a source its own question flow could not consume.

## Reader correction in this change

The public-page parser was inventing breaks at inline closing tags and including surrounding navigation despite semantic main content. Regression tests now preserve inline text, prefer `<main>` / `role="main"`, and keep reader output within both character and paragraph budgets, disclosing truncation. Replaying the exact downloaded public Python HTML produces **59 source paragraphs** accepted by the QA builder, rather than the original 145.

This correction is **not live until separately approved and deployed**. The fetched-page → real Jev browser case must be repeated after deployment. Ordinary unit/browser fixtures remain useful regression checks but are not evidence that these live flows work. Production is not fully verified while the real Mermaid case fails.
