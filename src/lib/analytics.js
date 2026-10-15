export function sanitizeAnalyticsPayload(payload) {
  const campaignKey =
    /(?:^|_)(?:utm_[a-z0-9_]*|gclid|dclid|gbraid|wbraid|fbclid|fbc|fbp|msclkid|ttclid|twclid|li_fat_id|mc_cid|mc_eid|gclsrc|gad_source|igshid|rdt_cid|epik|qclid|sccid|irclid|_kx|campaign|adgroup|creative|keyword)(?:$|_)/i;
  const urlKey = /(?:url|referrer|destination|href)/i;
  function canonical(value, key) {
    if (/referrer/i.test(key)) {
      try {
        return new URL(value).origin;
      } catch {
        return undefined;
      }
    }
    try {
      const absolute = /^https?:\/\//i.test(value),
        protocolRelative = value.startsWith("//");
      if (!absolute && !protocolRelative && !urlKey.test(key)) return value;
      const parsed = new URL(value, "https://utilitypot.modepot.io");
      if (!/^https?:$/.test(parsed.protocol)) return undefined;
      return `${absolute || protocolRelative ? parsed.origin : ""}${parsed.pathname}`;
    } catch {
      return undefined;
    }
  }
  function clean(value, key = "") {
    if (typeof value === "string")
      return /^https?:\/\//i.test(value) ||
        value.startsWith("//") ||
        urlKey.test(key)
        ? canonical(value, key)
        : value;
    if (value === null || typeof value !== "object" || value instanceof Date)
      return value;
    if (Array.isArray(value))
      return value
        .map((item) => clean(item, key))
        .filter((item) => item !== undefined);
    const result = {};
    for (const [childKey, child] of Object.entries(value)) {
      const normalizedKey = childKey
        .replace(/^\$+/, "")
        .replace(/^(?:initial|session_entry|session_exit)_/i, "");
      if (
        campaignKey.test(normalizedKey) ||
        /(?:^|_)(?:password|passwd|secret|client_secret|access_token|refresh_token|authorization|api_key)(?:$|_)/i.test(
          childKey,
        )
      )
        continue;
      if (
        /^token$/i.test(childKey) &&
        !(
          childKey === "token" &&
          typeof child === "string" &&
          /^phc_[A-Za-z0-9]+$/.test(child)
        )
      )
        continue;
      if (
        /^\$(?:set|set_once)$/.test(childKey) &&
        child &&
        typeof child === "object"
      ) {
        const allowed = new Set([
          "$initial_url",
          "$initial_referrer",
          "$initial_referring_domain",
          "$referring_domain",
        ]);
        result[childKey] = Object.fromEntries(
          Object.entries(child)
            .filter(([key]) => allowed.has(key))
            .map(([key, item]) => [key, clean(item, key)])
            .filter(([, item]) => item !== undefined),
        );
        continue;
      }
      const sanitized = clean(child, childKey);
      if (sanitized !== undefined) result[childKey] = sanitized;
    }
    return result;
  }
  return clean(payload);
}

export const posthogPublicToken =
  "phc_qXkp5FBQfrqHQwkqf3ys8iSoGoMYw2tpTHXGugXJhP8V";
export const posthogScript = `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==e&&(e+="."+a),t||(e+=" (stub)"),e},o="init capture opt_out_capturing has_opted_out_capturing is_capturing set_config".split(" "),n=0;n<o.length;n++){g(u,o[n])}e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init('${posthogPublicToken}',{api_host:'https://us.i.posthog.com',defaults:'2026-05-30',person_profiles:'identified_only',persistence:'localStorage',capture_pageview:true,capture_pageleave:true,autocapture:false,disable_session_recording:true,save_campaign_params:false,save_referrer:false,advanced_disable_flags:true,before_send:(${sanitizeAnalyticsPayload.toString()})});`;
