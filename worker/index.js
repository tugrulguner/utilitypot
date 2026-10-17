import { createEntitiesInterpretation } from "../src/lib/utilities/entities.js";
import { createDiagramInterpretation } from "../src/lib/utilities/diagram.js";
import {
  createQaInterpretation,
  readPublicPage,
  PageReadError,
} from "../src/lib/utilities/webpage.js";
const builders = {
  entities: createEntitiesInterpretation,
  diagram: createDiagramInterpretation,
  qa: createQaInterpretation,
};
const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function boundedText(body, max) {
  if (!body) throw new Error("Missing body");
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new RangeError("Too large");
      }
      chunks.push(r.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export function validateAnswers(questions, response) {
  if (
    !response ||
    typeof response.model !== "string" ||
    !response.model.length ||
    response.model.length > 100 ||
    !response.answers ||
    typeof response.answers !== "object" ||
    Array.isArray(response.answers)
  )
    throw new Error("Invalid response");
  const keys = Object.keys(questions),
    answers = response.answers;
  if (
    keys.length !== Object.keys(answers).length ||
    keys.some((k) => !Object.hasOwn(answers, k))
  )
    throw new Error("Invalid keys");
  for (const key of keys) {
    const a = answers[key],
      opts = Object.keys(questions[key].criteria);
    if (
      !a ||
      a.type !== "choice" ||
      !opts.includes(a.choice) ||
      !a.probabilities ||
      typeof a.probabilities !== "object" ||
      Array.isArray(a.probabilities) ||
      Object.keys(a.probabilities).length !== opts.length ||
      opts.some((o) => !Object.hasOwn(a.probabilities, o))
    )
      throw new Error("Invalid choices");
    const probs = opts.map((o) => a.probabilities[o]);
    if (
      probs.some(
        (p) => typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1,
      ) ||
      Math.abs(probs.reduce((a, b) => a + b, 0) - 1) > 0.02 ||
      a.probabilities[a.choice] < Math.max(...probs) - 0.000001 ||
      typeof a.confidence !== "number" ||
      !Number.isFinite(a.confidence) ||
      a.confidence < 0 ||
      a.confidence > 1
    )
      throw new Error("Invalid probabilities");
  }
  const usage = response.usage;
  if (
    !usage ||
    ["input_tokens", "output_tokens"].some(
      (k) => !Number.isSafeInteger(usage[k]) || usage[k] < 0,
    )
  )
    throw new Error("Invalid usage");
  return answers;
}
export async function handleRequest(request, env, providerFetch = fetch) {
  const url = new URL(request.url);
  const readPage = url.pathname === "/api/utilities/read-page";
  if (url.pathname !== "/api/utilities/interpret" && !readPage)
    return url.pathname.startsWith("/api/")
      ? json({ error: "Not found." }, 404)
      : env.ASSETS.fetch(request);
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  if (
    request.headers.get("origin") !== url.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return json({ error: "Same-origin requests only." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "Use JSON." }, 415);
  let spec, pageUrl, entityInput;
  try {
    const body = JSON.parse(await boundedText(request.body, 16000));
    if (readPage) {
      if (
        !body ||
        Object.keys(body).join(",") !== "url" ||
        typeof body.url !== "string" ||
        body.url.length > 2000
      )
        throw new Error("Invalid URL");
      pageUrl = body.url;
    } else {
      if (
        !body ||
        Object.keys(body).sort().join(",") !== "input,tool" ||
        !Object.hasOwn(builders, body.tool)
      )
        return json({ error: "Invalid utility request." }, 400);
      spec = builders[body.tool](body.input);
      if (body.tool === "entities" && body.input.range)
        entityInput = body.input;
      if (Object.keys(spec.questions).length > 24)
        throw new Error("Question budget exceeded");
    }
  } catch (e) {
    return json(
      {
        error:
          e instanceof RangeError
            ? "Request is too large."
            : "Invalid input. Use a supported, small sample.",
      },
      e instanceof RangeError ? 413 : 400,
    );
  }
  if (
    (!readPage && !env.TYPESAFE_API_KEY) ||
    !env.UTILITY_RATE_LIMIT ||
    !env.UTILITY_GLOBAL_RATE_LIMIT
  )
    return json({ error: "Processing is unavailable. Try again later." }, 503);
  try {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const a = await env.UTILITY_RATE_LIMIT.limit({ key: `utilities:${ip}` });
    if (!a.success)
      return json(
        {
          error: "Request limit reached. Wait a minute before trying again.",
        },
        429,
      );
    const b = await env.UTILITY_GLOBAL_RATE_LIMIT.limit({
      key: "utilities:all",
    });
    if (!b.success)
      return json(
        { error: "Processing capacity reached. Try again later." },
        429,
      );
  } catch {
    return json(
      { error: "Request protection is unavailable. Try again later." },
      503,
    );
  }
  if (readPage) {
    try {
      return json(await readPublicPage(pageUrl, providerFetch));
    } catch (error) {
      const safe =
        error instanceof PageReadError
          ? error
          : new PageReadError("fetch_unavailable");
      const status =
        {
          timeout: 504,
          dns_unavailable: 502,
          fetch_unavailable: 502,
          upstream_auth: 401,
          upstream_forbidden: 403,
          upstream_rate_limited: 429,
        }[safe.code] || 400;
      return json({ error: safe.message, code: safe.code }, status);
    }
  }
  const providerUnavailable = Symbol("provider unavailable");
  let failurePhase = "provider_fetch",
    providerStage = 0;
  try {
    let model = "",
      plan;
    let remainingQuestions = 24;
    const mergedAnswers = {};
    const deadline = Date.now() + 30000;
    async function evaluate(initial, prefix = "") {
      let active = initial;
      for (let stage = 0; stage < 2; stage++) {
        providerStage = stage + 1;
        if (entityInput) request.signal.throwIfAborted();
        const count = Object.keys(active.questions).length;
        if (!count) {
          failurePhase = "decode";
          return active.decode({});
        }
        if (count > remainingQuestions) throw Error("Question budget exceeded");
        remainingQuestions -= count;
        const timeout = entityInput
          ? Math.min(15000, deadline - Date.now())
          : 15000;
        if (timeout <= 0) throw Error("Entity window deadline exceeded.");
        failurePhase = "provider_fetch";
        const r = await providerFetch("https://api.typesafe.ai/v1/systemone", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "jev-latest",
            state: active.state,
            questions: active.questions,
          }),
          signal: entityInput
            ? AbortSignal.any([request.signal, AbortSignal.timeout(timeout)])
            : AbortSignal.timeout(timeout),
        });
        if (!r.ok) {
          await r.body?.cancel();
          throw providerUnavailable;
        }
        failurePhase = "provider_body";
        const response = JSON.parse(await boundedText(r.body, 128000));
        failurePhase = "response_validation";
        const answers = validateAnswers(active.questions, response);
        if (model && model !== response.model)
          throw Error("Inconsistent models");
        model = response.model;
        for (const key of Object.keys(answers)) {
          const index = /^t(\d+)_/.exec(key)?.[1];
          const category =
            prefix && index !== undefined
              ? `${encodeURIComponent(active.state.types[Number(index)].name)}.`
              : "";
          const id = prefix + category + key;
          if (Object.hasOwn(mergedAnswers, id))
            throw Error("Duplicate question");
          mergedAnswers[id] = answers[key];
        }
        if (stage === 0 && typeof active.followup === "function") {
          failurePhase = "followup";
          active = active.followup(answers);
          continue;
        }
        failurePhase = "decode";
        return active.decode(answers);
      }
      throw Error("Incomplete interpretation");
    }
    if (!entityInput) plan = await evaluate(spec);
    else {
      // One causal next-start judgment per category; only subsequent, genuinely
      // unprocessed candidates are asked in later rounds. No inference retries.
      const types = spec.state.types,
        tokens = spec.state.tokens;
      const cursors = new Map(
        types.map((t) => [
          t.name,
          Math.max(
            entityInput.range.start,
            Object.hasOwn(entityInput.after ?? {}, t.name)
              ? entityInput.after[t.name]
              : 0,
          ),
        ]),
      );
      const nominations = new Map(types.map((t) => [t.name, []]));
      const entities = [],
        finished = new Set();
      for (let round = 0; round < 3; round++) {
        const active = types.filter(
          (t) =>
            !finished.has(t.name) &&
            tokens.some(
              (token) =>
                token.start >= cursors.get(t.name) &&
                token.start < entityInput.range.end,
            ),
        );
        if (!active.length) break;
        const step = createEntitiesInterpretation({
          text: entityInput.text,
          definitions: active
            .map((t) => `${t.name}: ${t.definition}`)
            .join("\n"),
          range: entityInput.range,
          after: Object.fromEntries(
            active.map((t) => [t.name, cursors.get(t.name)]),
          ),
        });
        const result = await evaluate(step, `round${round}.`);
        entities.push(...result.entities);
        for (const c of result.continuation) {
          nominations.get(c.type).push(...c.starts);
          cursors.set(c.type, c.after);
          if (c.exhausted) finished.add(c.type);
        }
      }
      plan = {
        entities,
        needsReview: true,
        continuation: types.map((t) => ({
          type: t.name,
          starts: nominations.get(t.name),
          after: cursors.get(t.name),
          exhausted: nominations.get(t.name).length < 3,
          batchSize: 3,
        })),
      };
    }
    if (!plan || !model) throw new Error("Incomplete interpretation");
    return json({
      source: "jev",
      model,
      plan,
      needsReview: true,
      confidence: Object.fromEntries(
        Object.entries(mergedAnswers).map(([k, a]) => [k, a.confidence]),
      ),
    });
  } catch (error) {
    if (error === providerUnavailable)
      return json(
        { error: "Processing is unavailable. Try again later." },
        503,
      );
    // Only fixed enums leave this boundary; never expose input or exception text.
    const codes = new Map([
      ["Inconsistent entity starts.", "entity_starts_invalid"],
      ["Inconsistent entity boundaries.", "entity_boundaries_invalid"],
      ["Invalid or overlapping entity span.", "entity_span_invalid"],
      ["Invalid response", "provider_response_invalid"],
      ["Invalid keys", "provider_response_invalid"],
      ["Invalid choices", "provider_choices_invalid"],
      ["Invalid probabilities", "provider_probabilities_invalid"],
      ["Invalid usage", "provider_usage_invalid"],
    ]);
    return json(
      {
        error:
          "The interpretation could not be verified. No result was accepted. Try again later.",
        code:
          codes.get(error instanceof Error ? error.message : "") ||
          "interpretation_unverified",
        phase: failurePhase,
        stage: providerStage,
      },
      503,
    );
  }
}
export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
