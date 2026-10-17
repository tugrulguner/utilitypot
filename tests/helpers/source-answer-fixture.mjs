import { SOURCE_ANSWER_PROTOCOL } from "../../src/lib/utilities/source-answer.js";

// Adapter for explicitly declared presentation fixtures only; never production fallback.
export function sourceAnswerFixture(input, legacy, sourceText) {
  if (legacy?.plan?.coverage?.protocol === SOURCE_ANSWER_PROTOCOL)
    return legacy;
  if (input?.mode !== "source-answer" || !Array.isArray(input.passages))
    return legacy;
  const text = sourceText ?? "";
  if (
    !legacy ||
    legacy.source !== "jev" ||
    typeof legacy.model !== "string" ||
    !legacy.plan ||
    !["answered", "partial", "not-answered"].includes(legacy.plan.status) ||
    !Array.isArray(legacy.plan.excerpts)
  )
    return legacy;
  const excerpts = [];
  for (const e of legacy.plan.excerpts) {
    if (
      !Number.isSafeInteger(e.start) ||
      !Number.isSafeInteger(e.end) ||
      e.start < 0 ||
      e.end <= e.start ||
      text.slice(e.start, e.end) !== e.text
    )
      return legacy;
    for (const p of input.passages) {
      const start = Math.max(e.start, p.start),
        end = Math.min(e.end, p.end);
      if (start < end) {
        const piece = text.slice(start, end);
        excerpts.push({
          id: `source-${start}-${end}`,
          sourceId: `source-${p.start}-${p.end}`,
          start,
          end,
          text: piece,
          role: e.role ?? "direct",
          relevance: 1,
        });
      }
    }
  }
  const supported = new Map(excerpts.map((e) => [e.sourceId, e]));
  const contexts = input.passages
    .filter((p) => supported.has(`source-${p.start}-${p.end}`))
    .map((p) => ({
      id: `source-${p.start}-${p.end}`,
      start: p.start,
      end: p.end,
      text: p.text,
      role: supported.get(`source-${p.start}-${p.end}`).role,
      relevance: 1,
    }));
  const status = legacy.plan.status;
  return {
    ...legacy,
    plan: {
      ...legacy.plan,
      excerpts,
      contexts,
      answer: {
        lead: excerpts,
        sections: excerpts.length
          ? [{ kind: "direct", title: "Supporting details", items: excerpts }]
          : [],
        intent: "fact",
      },
      coverage: {
        protocol: SOURCE_ANSWER_PROTOCOL,
        passageIds: input.passages.map((p) => p.id),
        processed: input.passages.length,
        completeProbability: status === "answered" ? 1 : 0,
        intent: "fact",
      },
    },
  };
}
