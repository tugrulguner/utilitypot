// Analytics accepts fixed categories only, never response/error text or URLs.
const categories = new Set([
  "validation",
  "request_rejected",
  "network",
  "timeout",
  "rate_limited",
  "service_unavailable",
  "provider_failure",
  "invalid_response",
  "presentation",
  "cancelled",
  "unknown",
]);
const invalidResponseCodes = new Set([
  "entity_starts_invalid",
  "entity_boundaries_invalid",
  "entity_span_invalid",
  "provider_response_invalid",
  "provider_choices_invalid",
  "provider_probabilities_invalid",
  "provider_usage_invalid",
]);

export function failureCategory(error, fallback = "unknown") {
  if (categories.has(error?.failureCategory)) return error.failureCategory;
  if (error?.name === "TimeoutError") return "timeout";
  if (error?.name === "AbortError") return "cancelled";
  return categories.has(fallback) ? fallback : "unknown";
}

export function failureError(message, category) {
  return Object.assign(new Error(message), {
    failureCategory: failureCategory(null, category),
  });
}

export function failureOutcome(category) {
  if (category === "cancelled") return "cancelled";
  return ["validation", "request_rejected", "rate_limited", "timeout"].includes(
    category,
  )
    ? "rejected"
    : "unexpected_failure";
}

export function failureProperties(outcome, category) {
  if (outcome === "success") return {};
  return {
    failure_category: failureCategory(
      null,
      category ??
        (outcome === "rejected"
          ? "validation"
          : outcome === "cancelled"
            ? "cancelled"
            : "presentation"),
    ),
  };
}

export async function requestUtility(
  options,
  fallback,
  path = "/api/utilities/interpret",
) {
  let response;
  try {
    response = await fetch(path, options);
  } catch (error) {
    // Fetch deliberately hides connectivity, CORS and browser-policy causes behind
    // opaque errors. `network` means no usable HTTP response, not a diagnosed outage;
    // request_rejected is reserved for an observable HTTP denial.
    throw failureError(
      error?.message || fallback,
      failureCategory(error, "network"),
    );
  }
  // Classify HTTP before decoding: a non-JSON gateway failure is not a schema failure.
  const httpCategory =
    response.status === 429
      ? "rate_limited"
      : [408, 504].includes(response.status)
        ? "timeout"
        : response.status >= 500
          ? "service_unavailable"
          : "request_rejected";
  let data;
  try {
    data = await response.json();
  } catch {
    throw failureError(
      fallback,
      response.ok ? "invalid_response" : httpCategory,
    );
  }
  if (!response.ok) {
    const category = invalidResponseCodes.has(data?.code)
      ? "invalid_response"
      : data?.code === "interpretation_unverified"
        ? ["response_validation", "followup", "decode"].includes(data.phase)
          ? "invalid_response"
          : ["provider_fetch", "provider_body"].includes(data.phase)
            ? "provider_failure"
            : "unknown"
        : httpCategory;
    throw failureError(
      typeof data?.error === "string" ? data.error : fallback,
      category,
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw failureError(fallback, "invalid_response");
  return data;
}
