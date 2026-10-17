import { entityWindows } from "../../src/lib/utilities/entity-document.js";
import { fulfillSourceAnswerFixture } from "./source-answer-fixture.mjs";

/** Adapt legacy global-offset entity fixtures to the current window protocol. */
export function adaptEntityDocumentFixture(
  json,
  input,
  source = input?.text,
  knownTypes,
) {
  if (Object.hasOwn(json?.plan ?? {}, "continuation")) return json;
  if (typeof input?.text !== "string" || typeof source !== "string")
    return json;
  const entities = json?.plan?.entities;
  if (
    !Array.isArray(entities) ||
    !entities.every(
      (e) =>
        e &&
        typeof e === "object" &&
        typeof e.type === "string" &&
        typeof e.text === "string" &&
        Number.isInteger(e.start) &&
        Number.isInteger(e.end) &&
        e.start >= 0 &&
        e.end <= source.length &&
        e.end > e.start &&
        source.slice(e.start, e.end) === e.text,
    ) ||
    typeof input?.text !== "string" ||
    typeof source !== "string" ||
    typeof input.definitions !== "string" ||
    !input.range ||
    typeof input.range !== "object" ||
    !input.after ||
    typeof input.after !== "object"
  )
    return json;

  const definitions = [...input.definitions.matchAll(/^\s*([^:\n]+):/gm)].map(
    (m) => m[1].trim(),
  );
  if (
    !definitions.length ||
    entities.some((e) => !(knownTypes ?? definitions).includes(e.type))
  )
    return json;
  const windows = entityWindows(source);
  const window = windows.find(
    (w) =>
      w.text === input.text &&
      w.ownedStart - w.start === input.range.start &&
      w.ownedEnd - w.start === input.range.end,
  );
  if (!window) return json;

  const localized = entities
    .filter((e) => e.start >= window.start && e.end <= window.end)
    .map((e) => ({
      ...e,
      start: e.start - window.start,
      end: e.end - window.start,
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const continuation = definitions.map((type) => {
    const cursor = input.after[type];
    if (!Number.isInteger(cursor)) return null;
    const nominated = localized
      .filter(
        (e) =>
          e.type === type &&
          e.start >= cursor &&
          e.start >= input.range.start &&
          e.start < input.range.end,
      )
      .slice(0, 3);
    return {
      type,
      starts: nominated.map((e) => e.start),
      after: Math.max(cursor, ...nominated.map((e) => e.end)),
      exhausted: nominated.length < 3,
      batchSize: 3,
    };
  });
  if (continuation.some((c) => !c)) return json;
  const selectedStarts = new Map(
    continuation.map((c) => [c.type, new Set(c.starts)]),
  );
  return {
    ...json,
    plan: {
      ...json.plan,
      entities: localized.filter((e) =>
        selectedStarts.get(e.type)?.has(e.start),
      ),
      continuation,
    },
  };
}

const acceleratedPages = new WeakSet();
const sessions = new WeakMap();
export async function fulfillEntityDocumentFixture(
  route,
  options = {},
  source,
) {
  try {
    if (route.request().postDataJSON()?.tool === "qa")
      return fulfillSourceAnswerFixture(route, options, source);
  } catch {}
  let json = options.json;
  if (
    json === undefined &&
    options.contentType === "application/json" &&
    typeof options.body === "string"
  ) {
    try {
      json = JSON.parse(options.body);
    } catch {}
  }
  if (json?.plan?.entities && !Object.hasOwn(json.plan, "continuation")) {
    try {
      const request = route.request().postDataJSON();
      if (request?.tool === "entities") {
        source = await (typeof source === "function"
          ? source()
          : (source ??
            route
              .request()
              .frame()
              .page()
              .locator("#source-text")
              .inputValue()));
        const page = route.request().frame().page();
        const fresh =
          request.input.range.start === 0 &&
          Object.values(request.input.after).every((v) => v === 0);
        if (
          fresh ||
          !sessions.has(page) ||
          sessions.get(page).source !== source
        )
          sessions.set(page, {
            source,
            types: [
              ...request.input.definitions.matchAll(/^\s*([^:\n]+):/gm),
            ].map((m) => m[1].trim()),
          });
        const adapted = adaptEntityDocumentFixture(
          json,
          request.input,
          source,
          sessions.get(page).types,
        );
        if (
          adapted !== json &&
          (entityWindows(source).length > 1 ||
            adapted.plan.continuation.some((c) => !c.exhausted))
        ) {
          // Accelerate only legacy presentation fixtures, never production or
          // the real-time document pacing/cancellation regression suite.
          const page = route.request().frame().page();
          if (!acceleratedPages.has(page)) {
            await page.clock.install();
            acceleratedPages.add(page);
          }
          await page.clock.fastForward(14000);
        }
        json = adapted;
      }
    } catch {
      // Keep non-JSON and intentionally malformed fixture responses unchanged.
    }
  }
  return route.fulfill(
    json === undefined ? options : { ...options, body: undefined, json },
  );
}
