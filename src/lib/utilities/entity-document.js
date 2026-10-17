import { createEntitiesInterpretation, entityTokens } from "./entities.js";

export const ENTITY_DOCUMENT_LIMIT = 2 * 1024 * 1024;
export const ENTITY_WINDOW_TOKENS = 72;
export const ENTITY_WINDOW_OVERLAP = 12;

export function entityWindows(
  text,
  windowTokens = ENTITY_WINDOW_TOKENS,
  overlap = ENTITY_WINDOW_OVERLAP,
) {
  if (
    !Number.isInteger(windowTokens) ||
    !Number.isInteger(overlap) ||
    overlap < 12 ||
    windowTokens < 1 ||
    windowTokens + overlap * 2 > 120
  )
    throw Error("Invalid entity window configuration.");
  const tokens = entityTokens(text);
  if (!tokens.length) throw Error("Use text containing words.");
  const windows = [];
  let from = 0;
  while (from < tokens.length) {
    let to = Math.min(tokens.length, from + windowTokens);
    const left = Math.max(0, from - overlap);
    let right, start, end;
    while (true) {
      right = Math.min(tokens.length, to + overlap);
      start = tokens[left].start;
      end = tokens[right - 1].end;
      if (
        end - start <= 5000 &&
        new TextEncoder().encode(text.slice(start, end)).length <= 10000
      )
        break;
      if (--to <= from)
        throw Error(
          "A word or its required context is too large to process safely.",
        );
    }
    windows.push({
      start,
      end,
      ownedStart: tokens[from].start,
      ownedEnd: tokens[to - 1].end,
      text: text.slice(start, end),
      index: windows.length,
    });
    from = to;
  }
  return windows;
}

/**
 * infer(payload, {signal}) sends one window to the existing entities Worker route.
 * Each payload contains text, definitions, owned range and per-category cursors.
 * Windows run serially: a span crossing a boundary excludes its own same-type
 * interior from the next window. No failed inference is retried. No partial result
 * is returned. Coverage means every owned source region completed, not semantic
 * certainty that every real-world name was recognized.
 */
export async function extractEntityDocument(
  input,
  infer,
  { signal, onProgress } = {},
) {
  const check = () => {
    if (signal?.aborted)
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
  };
  check();
  if (
    !input ||
    typeof input.text !== "string" ||
    new TextEncoder().encode(input.text).length > ENTITY_DOCUMENT_LIMIT
  )
    throw Error("Use a text document up to 2 MiB.");
  const windows = entityWindows(input.text);
  // Validate definitions and all resource bounds before the first paid request.
  const types = createEntitiesInterpretation({
    ...input,
    text: windows[0].text,
  }).state.types;
  for (const w of windows)
    createEntitiesInterpretation({ ...input, text: w.text });
  const cursors = new Map(types.map((t) => [t.name, 0]));
  const entities = [],
    confidence = {},
    models = new Set(),
    batches = [];
  const seen = new Set();
  for (const w of windows) {
    const localTokens = entityTokens(w.text);
    const range = { start: w.ownedStart - w.start, end: w.ownedEnd - w.start };
    let active = [...types],
      batch = 0;
    while (active.length) {
      check();
      active = active.filter((t) =>
        localTokens.some(
          (token) =>
            token.start >=
              Math.max(range.start, (cursors.get(t.name) ?? 0) - w.start) &&
            token.start < range.end,
        ),
      );
      if (!active.length) break;
      const after = Object.fromEntries(
        active.map((t) => [
          t.name,
          Math.max(range.start, (cursors.get(t.name) ?? 0) - w.start),
        ]),
      );
      const payload = {
        text: w.text,
        definitions: active.map((t) => `${t.name}: ${t.definition}`).join("\n"),
        range,
        after,
      };
      if (
        new TextEncoder().encode(
          JSON.stringify({ tool: "entities", input: payload }),
        ).length > 16000
      )
        throw Error("A text section exceeds the safe request size.");
      onProgress?.({ completed: w.index, total: windows.length, batch });
      const response = await infer(payload, { signal });
      check();
      const plan = response?.plan;
      if (
        response?.source !== "jev" ||
        typeof response.model !== "string" ||
        !response.model.length ||
        response.model.length > 100 ||
        !Array.isArray(plan?.entities) ||
        !Array.isArray(plan.continuation) ||
        plan.continuation.length !== active.length
      )
        throw Error("Invalid entity continuation response.");
      const entries = new Map();
      for (const c of plan.continuation) {
        if (
          !active.some((t) => t.name === c.type) ||
          entries.has(c.type) ||
          !Array.isArray(c.starts) ||
          c.starts.length > 3 ||
          c.exhausted !== c.starts.length < 3 ||
          !Number.isInteger(c.after)
        )
          throw Error("Invalid entity continuation metadata.");
        let previous = after[c.type] - 1;
        for (const start of c.starts) {
          if (
            !Number.isInteger(start) ||
            start <= previous ||
            start < after[c.type] ||
            start >= range.end ||
            !localTokens.some((t) => t.start === start)
          )
            throw Error("Invalid entity continuation start.");
          previous = start;
        }
        entries.set(c.type, c);
      }
      const pending = [];
      for (const e of plan.entities) {
        const c = entries.get(e.type);
        if (
          !c ||
          !Number.isInteger(e.start) ||
          !Number.isInteger(e.end) ||
          !c.starts.includes(e.start) ||
          e.end <= e.start ||
          e.end > w.text.length ||
          w.text.slice(e.start, e.end) !== e.text
        )
          throw Error("Invalid entity document span.");
        const startToken = localTokens.findIndex((t) => t.start === e.start),
          endToken = localTokens.findIndex((t) => t.end === e.end);
        if (endToken < startToken || endToken - startToken > 11)
          throw Error("Invalid entity document endpoint.");
        const absolute = {
          ...e,
          start: e.start + w.start,
          end: e.end + w.start,
        };
        const key = JSON.stringify([e.type, absolute.start, absolute.end]);
        if (
          seen.has(key) ||
          entities.some(
            (p) =>
              p.type === e.type &&
              p.start < absolute.end &&
              absolute.start < p.end,
          ) ||
          pending.some(
            (p) =>
              p.type === e.type &&
              p.start < absolute.end &&
              absolute.start < p.end,
          )
        )
          throw Error("Duplicate or overlapping entity document span.");
        seen.add(key);
        pending.push(absolute);
      }
      for (const t of active) {
        const c = entries.get(t.name);
        const expected = Math.max(
          after[t.name],
          ...c.starts.map(
            (start) => localTokens.find((token) => token.start === start).end,
          ),
          ...plan.entities.filter((e) => e.type === t.name).map((e) => e.end),
        );
        if (c.after !== expected || (!c.exhausted && c.after <= after[t.name]))
          throw Error("Non-progressing entity continuation.");
        cursors.set(t.name, c.after + w.start);
      }
      if (
        !response.confidence ||
        typeof response.confidence !== "object" ||
        Array.isArray(response.confidence)
      )
        throw Error("Invalid entity confidence metadata.");
      for (const [key, value] of Object.entries(response.confidence)) {
        if (
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 1
        )
          throw Error("Invalid entity confidence value.");
        confidence[`window${w.index}.batch${batch}.${key}`] = value;
      }
      entities.push(...pending);
      if (models.size && !models.has(response.model))
        throw Error(
          "The model version changed; no document result was accepted.",
        );
      models.add(response.model);
      batches.push({
        window: w.index,
        batch,
        types: active.map((t) => t.name),
      });
      active = active.filter((t) => !entries.get(t.name).exhausted);
      batch++;
    }
    onProgress?.({ completed: w.index + 1, total: windows.length, batch });
  }
  check();
  entities.sort(
    (a, b) =>
      a.start - b.start || a.end - b.end || a.type.localeCompare(b.type),
  );
  return {
    source: "jev",
    model: [...models][0],
    models: [...models],
    plan: {
      entities,
      needsReview: true,
      coverage: {
        complete: true,
        sourceLength: input.text.length,
        tokens: entityTokens(input.text).length,
        windows: windows.length,
        batches,
      },
    },
    confidence,
  };
}
