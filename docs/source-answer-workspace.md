# Source-assembled answers (Jev-only)

The owner explicitly chose Jev-only, source-assembled answers, not a text-generating model. This change replaces the single-passage/quote interface with an article-like answer: selected answer spans, explanations, procedures, comparisons, caveats and conflicts, with original source context behind citations. No generated prose or outside facts are added.

## Capability and authority

- `answerSourceDocument({text, question}, infer, {signal, onProgress})` processes the complete source, up to 2 MiB UTF-8, without the previous first-10,000-character / 100-paragraph search cutoff.
- The callback sends `{tool:"qa", input:payload}`. Payload is a FLAT `{mode:"source-answer",question,passages}` object. The actual Worker handler builds and validates every provider question; clients do not supply provider questions.
- Jev judges substantive relevance and each block's contribution, plus whole-question completeness and answer intent. It does not split question meaning with keyword heuristics.
- A dependent choice selects the concise contiguous source span retaining the block's responsive information. Sentence ranges and a full-block option prevent a fixed snippet length from dropping necessary conditions. If only one supported span exists, code copies it without a ceremonial additional model call.
- Every selected span must match the original source and its requested source block. Missing coverage metadata, inconsistent models, malformed scores, cancellation or a failed section rejects the result. Raw scores are preserved and namespaced per section.
- Main-answer placement is limited for readability, not evidence availability: all accepted answer points remain in supporting sections; full original contexts and the complete source snapshot remain inspectable and exportable.

## Explicit resource change

New QA mode permits at most ten blocks and **32 typed questions per Worker request**, across at most two dependent provider stages: up to 22 relevance/role/completeness/intent questions, then up to ten precise-span choices. This QA-specific increase from 24 enables actual semantic span selection rather than dumping entire paragraphs. Entity and diagram budgets are unchanged. Client/aggregate abuse bindings, namespaces and limits are unchanged. Requests remain bounded to 16,000 bytes; provider stages have 15-second deadlines and source-answer windows share a 30-second deadline. Browser requests use 35 seconds and abortable pacing. No financial-control infrastructure or automatic inference retries are added.

The public reader retains its public-address/redirect protections, `global_fetch_strictly_public`, 250,000-byte transport bound, eight-second deadline and three-redirect maximum. It now returns all readable text within those existing transport limits instead of clipping the semantic search prefix. It does not bypass logins, paywalls or publisher blocks.

## Verification state

Implemented and exercised locally: actual helper-to-Worker contract, late answers beyond 10k/100 paragraphs, all supporting points, precise source spans, Unicode, code/list source preservation, absence, cancellation, later-section failure, model changes, malformed/misowned provenance, serialized byte guards and QA's bounded question budget. The new browser presentation tests exercise article output, secondary source inspection, Markdown downloads, late support and stale-question cancellation. These are structural/presentation fixtures, not genuine-provider quality evidence.

At draft publication, broad legacy browser-fixture migration, fresh genuine hosted qualification, full final gates and independent review remain outstanding. No merge or deployment of this new Q&A change is authorized by this document.
