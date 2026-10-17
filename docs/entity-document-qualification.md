# Complete-source name extraction qualification

## Delivered behavior

The browser processes the complete pasted source in owned sections with endpoint context, preserving the original source whitespace and global offsets. There is no document-wide 120-token, three-mentions-per-category or twelve-mentions display/export ceiling. Inputs remain bounded to 2 MiB UTF-8 and four categories; processing coverage does not guarantee semantic completeness.

Each category now asks for one next supported start, then its conditioned endpoint. Up to three progressing units are composed inside one Worker request, within the existing 24-question budget and a 30-second window deadline. Absence, invalid spans, inconsistent model versions and any failed section remain fail-closed. No distribution repair, inference retry, local extraction fallback or partial-document export is used.

Browser requests are cancellation-aware, have a 35-second per-request deadline, and are spaced at least 13.5 seconds apart to respect existing abuse guards. The rate-limit bindings and namespaces are unchanged; the 2 MiB resource ceiling is not a throughput promise. Source/category/example changes invalidate pending and accepted results. Reviewed corrections retain exact source/type/offset and same-category non-overlap validation. Source annotation uses an event sweep rather than scanning every mention at every boundary.

## Reproduced failure and repair

A fixture-only inactive preview captured the genuine `entity_starts_invalid` response: all three independent ordinal questions chose `w83` (Amir), although only two candidate start positions were available. Strict ordered-start composition correctly rejected this impossible three-start selection. The capture is retained in `src/lib/utilities/fixtures/entities-continuation-jev-1.13.0.json`.

The causal next-start design subsequently returned the exact `Amir Kade` span from the same previously failing input with genuine Jev 1.13.0 responses. This was a separate controlled qualification, not an automatic retry or deletion of the original failure.

## Genuine hosted browser qualification

A complete candidate Worker and its built assets were uploaded as an inactive version. No responses were mocked. Three fresh primary-action journeys passed:

- Original multi-section document: five people and one organization, including the previously failing Amir Kade mention; four genuine interpretation API requests.
- Dense repeated Unicode names: eight person mentions, including two occurrences each of Zoë Lemaire and Priya Sen; three genuine API requests.
- Owned-section boundary: Mira Calder crosses the first owned section boundary, followed by Juniper Works; both exact mentions accepted once; two genuine API requests.

Each journey checked the complete visible source, every exported source slice, category/mention counts, native clipboard, actual downloaded JSON bytes and mobile selected-mention visibility. All responses identified Jev 1.13.0. The ledger recorded no console or page errors. These are agent-run examples, not a universal extraction-accuracy claim or recruited-human usability study.

Preview settings were restored and read back in `finally`; the production deployment identity was independently unchanged. This qualification does not mean the fix is deployed to production.

## Structural regressions and remaining delivery gates

Observed RED regressions covered the impossible independent ordinals and the actual Worker rejection. A browser RED then exposed the remaining full-source correction/editor use of the bounded single-window factory; both result validation and the correction editor now use independent category parsing.

New protocol-correct browser cases passed for a source beyond 120 tokens with six late mentions and exact JSON export, rejection of a later failed section without partial results, and source-edit cancellation preventing subsequent sections. These fixtures establish application behavior, not model quality.

At initial publication, 145 unit tests, Astro check/build and the three new browser regressions passed. Legacy browser fixture migration, full final gates, exact-head CI and independent review remain required before marking this change ready. No production merge, deployment, tag or release is authorized by this report.
