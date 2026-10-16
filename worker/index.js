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
  let spec, pageUrl;
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
  try {
    let active = spec,
      model = "",
      plan;
    let remainingQuestions = 24;
    const mergedAnswers = {};
    // Entity ends depend on selected starts; never ask unrelated endpoints
    // independently or spend more than the original per-action question budget.
    for (let stage = 0; stage < 2; stage++) {
      const count = Object.keys(active.questions).length;
      if (count === 0) {
        plan = active.decode({});
        break;
      }
      if (count > remainingQuestions)
        throw new Error("Question budget exceeded");
      remainingQuestions -= count;
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
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) {
        await r.body?.cancel();
        return json(
          { error: "Processing is unavailable. Try again later." },
          503,
        );
      }
      const response = JSON.parse(await boundedText(r.body, 128000));
      const answers = validateAnswers(active.questions, response);
      if (model && model !== response.model)
        throw new Error("Inconsistent models");
      model = response.model;
      for (const key of Object.keys(answers)) {
        if (Object.hasOwn(mergedAnswers, key))
          throw new Error("Duplicate question");
        mergedAnswers[key] = answers[key];
      }
      if (stage === 0 && typeof active.followup === "function") {
        active = active.followup(answers);
        continue;
      }
      plan = active.decode(answers);
      break;
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
  } catch {
    return json(
      {
        error:
          "The interpretation could not be verified. No result was accepted. Try again later.",
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
