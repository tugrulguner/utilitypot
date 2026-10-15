import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeAnalyticsPayload, posthogScript } from "./analytics.js";
import vm from "node:vm";

test("analytics sanitization retains SDK necessities and bounds the entire envelope", () => {
  const date = new Date("2026-01-01T00:00:00.000Z");
  const source = {
    event: "$pageview",
    properties: {
      token: "phc_publicFixture123",
      timestamp: date,
      distinct_id: "sdk-id",
      $current_url:
        "https://utilitypot.modepot.io/tools/x/?secret=URL_SENTINEL#FRAG_SENTINEL",
      $referrer: "https://source.example/a?secret=REFERRER_SENTINEL",
      arbitrary_url: "//else.example/path?secret=ARBITRARY_URL_SENTINEL",
      $set: {
        $initial_referrer: "https://source.example/?private=SET_SENTINEL",
        arbitrary_secret: "SET_PRIVATE",
      },
      $session_entry_gclid: "GCLID_SENTINEL",
      password: "PASSWORD_SENTINEL",
      nested: [{ access_token: "ACCESS_SENTINEL", keep: "bounded" }],
    },
  };
  const result = sanitizeAnalyticsPayload(source);
  const json = JSON.stringify(result);
  for (const secret of [
    "URL_SENTINEL",
    "FRAG_SENTINEL",
    "REFERRER_SENTINEL",
    "ARBITRARY_URL_SENTINEL",
    "SET_SENTINEL",
    "SET_PRIVATE",
    "GCLID_SENTINEL",
    "PASSWORD_SENTINEL",
    "ACCESS_SENTINEL",
  ])
    assert.equal(json.includes(secret), false);
  assert.equal(
    result.properties.$current_url,
    "https://utilitypot.modepot.io/tools/x/",
  );
  assert.equal(result.properties.$referrer, "https://source.example");
  assert.equal(result.properties.arbitrary_url, "https://else.example/path");
  assert.equal(result.properties.token, "phc_publicFixture123");
  assert.equal(result.properties.timestamp, date);
  assert.equal(result.properties.distinct_id, "sdk-id");
  assert.equal(result.properties.nested[0].keep, "bounded");
});

test("campaign metadata nested anywhere is removed while action dimensions survive", () => {
  const result = sanitizeAnalyticsPayload({
    event: "utility_action_completed",
    properties: {
      tool: "csv_to_nested_json",
      action: "manual_run",
      outcome: "success",
      $initial_utm_source: "CAMPAIGN",
      nested: { $session_entry_gclid: "CLICK", network_name: "utility" },
    },
  });
  assert.deepEqual(result.properties, {
    tool: "csv_to_nested_json",
    action: "manual_run",
    outcome: "success",
    nested: { network_name: "utility" },
  });
});

test("serialized before_send sanitizer is self-contained and preserves the full SDK envelope", () => {
  const context = {
    window: {},
    document: {
      createElement: () => ({ setAttribute() {}, parentNode: null }),
      getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }],
    },
    URL,
    Date,
  };
  context.window = context;
  context.posthog = [];
  vm.runInNewContext(posthogScript, context);
  const [token, config] = context.posthog._i[0];
  assert.equal(config.persistence, "localStorage");
  assert.equal(config.autocapture, false);
  assert.equal(config.disable_session_recording, true);
  assert.equal(config.advanced_disable_flags, true);
  assert.equal(config.person_profiles, "identified_only");
  assert.equal(config.capture_pageview, true);
  assert.equal(config.capture_pageleave, true);
  assert.equal(context.posthog._i.length, 1);
  context.posthog.capture("utility_action_started", {
    tool: "fix_excel_dates",
    action: "manual_run",
  });
  context.posthog.opt_out_capturing();
  assert.equal(context.posthog[0][0], "capture");
  assert.equal(context.posthog[0][1], "utility_action_started");
  assert.equal(context.posthog[1][0], "opt_out_capturing");
  assert.equal(token, "phc_qXkp5FBQfrqHQwkqf3ys8iSoGoMYw2tpTHXGugXJhP8V");
  const envelope = {
    event: "$pageview",
    properties: {
      token: "phc_publicFixture123",
      distinct_id: "sdk-id",
      $current_url: "https://utilitypot.modepot.io/tools/x/?secret=SENTINEL",
      $set: {
        $initial_referrer: "https://source.example/?secret=REF_SENTINEL",
        arbitrary: "SET_SENTINEL",
      },
      $session_entry_gclid: "CLICK_SENTINEL",
    },
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
  };
  const clean = config.before_send(envelope);
  assert.equal(clean.properties.token, "phc_publicFixture123");
  assert.equal(clean.properties.distinct_id, "sdk-id");
  assert.equal(
    clean.properties.$current_url,
    "https://utilitypot.modepot.io/tools/x/",
  );
  assert.equal(
    clean.properties.$set.$initial_referrer,
    "https://source.example",
  );
  assert.deepEqual(Object.keys(clean.properties.$set), ["$initial_referrer"]);
  assert.equal(clean.timestamp.getTime(), envelope.timestamp.getTime());
  assert.doesNotMatch(JSON.stringify(clean), /SENTINEL|CLICK_SENTINEL/);
});
