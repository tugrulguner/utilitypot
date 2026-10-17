# Complete-source entity extraction core

Status: internal core implemented; browser wiring, visitor-copy migration and real-provider qualification are still outstanding. This change alone does **not** enable document extraction in the public interface.

## Contract

`extractEntityDocument({ text, definitions }, infer, { signal, onProgress })` processes the complete source and resolves only after all owned sections and continuation batches succeeded. Coverage is processing coverage, not a guarantee that a model identified every real-world entity correctly.

`infer(payload, { signal })` sends one POST to the existing `/api/utilities/interpret` endpoint with `{ tool: "entities", input: payload }`. Pass the supplied signal to fetch, check HTTP status, and return the parsed response. The callback must not retry a failed request. Credentials remain in the Worker.

A payload contains:

- `text`: the bounded source section, including context on both sides;
- `definitions`: only the still-active categories, using the existing `Type: definition` syntax;
- `range: { start, end }`: half-open, section-relative character offsets owning possible mention starts;
- `after`: per-category, section-relative progress cursors.

The existing Worker delegates to `createEntitiesInterpretation`, which now validates these optional fields and builds its own questions. Only eligible, owned starts are offered to the model. Ends remain conditioned on validated starts. Existing bounded requests without these fields preserve their response contract.

New window requests return `plan.continuation`, one entry per active category: `{ type, starts, after, exhausted }`. The server derives this from nominated starts, including nominations with abstaining endpoints. Consequently a rejected endpoint does not hide later source text. The client validates metadata, exact source spans, cursor progress and same-category non-overlap before advancing. A full batch continues over new, unprocessed candidates; this is not an inference retry.

Sections run serially so a boundary-crossing mention's same-category interior is excluded from the next section. Different-category overlaps remain valid. Full-source offsets are translated without changing source text. A failure, cancellation, malformed continuation or model-version change rejects the whole document; no partial plan is returned. Raw confidence values are namespaced by section/batch without normalization. The provider's actual model version is preserved.

Progress callbacks receive `{ completed, total, batch }`, without partial extracted results. No inferred names or partial exports are emitted through progress.

## Resource boundaries

- Full input: at most 2 MiB UTF-8, matching the upload resource policy.
- Normally 72 owned word tokens per section, with 12-token context on each side; individual provider inputs remain within the existing 120-token bound.
- Sections shrink when necessary to stay within 5,000 UTF-16 code units and 10,000 UTF-8 bytes. Unusually large words/context that cannot fit are refused, never truncated.
- Every serialized API request stays within the existing 16,000-byte body limit.
- At most four categories and the current maximum 12-token mention span are retained. Three nominations are a **batch size**, not a document-wide or category-wide output ceiling.
- Each API request still uses server-owned questions, at most two provider stages and the existing 24-question budget. Existing abuse/capacity guards are unchanged and can reject a request. A 2 MiB resource ceiling is not a promise of unlimited provider throughput or completion latency.
- The infer callback owns its network deadline and must honor the supplied AbortSignal. The server retains its existing bounded provider deadlines.

## Parent browser integration

Replace full-source calls to `createEntitiesInterpretation` with this orchestrator. Pass each payload through the normal same-origin API client, propagate source-edit cancellation, and present progress without accepting partial results. Validate manual corrections by exact source/type/offset and same-category non-overlap, not by the old 12-total/3-per-category display ceilings. Remove short-text/technical public wording only together with that working integration. Preserve the complete annotated source and export bytes.

A new client requires a Worker containing the owned-range/continuation implementation. Do not silently accept a legacy response with missing continuation metadata, infer dropped mentions locally, or claim full coverage from an old capped response.

## Evidence

The previously failing five structural regressions now pass: owned candidates, late/dense mentions beyond 120 tokens and three mentions per category, Unicode/exact offsets and cross-category overlap, boundary-spanning names, failure/cancellation rejection and nonredundant empty-window processing. Additional tests exercise the actual Worker handler with a deterministic provider transport oracle, including 54 mentions in 160 tokens, and reject invalid ownership/cursors before provider access. Model-version changes reject the entire document.

These tests are structural/oracle tests, **not** real-provider semantic-quality evidence. Genuine Jev document qualification and rendered browser integration remain required before public readiness.
