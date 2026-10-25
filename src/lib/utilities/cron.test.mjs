import test from "node:test";
import assert from "node:assert/strict";
import { explainCron } from "./cron.js";

test("explains a weekday schedule with five later zoned instants", () => {
  const result = explainCron({
    expression: "0 9 * * MON-FRI",
    scheduleZone: "America/New_York",
    displayZone: "Asia/Kolkata",
    now: "2026-01-02T15:00:00Z",
  });
  assert.equal(result.runs.length, 5);
  assert.deepEqual(
    result.runs.map((run) => run.iso),
    [
      "2026-01-05T14:00:00.000Z",
      "2026-01-06T14:00:00.000Z",
      "2026-01-07T14:00:00.000Z",
      "2026-01-08T14:00:00.000Z",
      "2026-01-09T14:00:00.000Z",
    ],
  );
  assert.equal(
    result.runs[0].display,
    "Jan 5, 2026, 19:30 GMT+5:30 (UTC+05:30)",
  );
  assert.match(result.explanation, /Monday through Friday/i);
});

test("rejects unsupported seconds and invalid zones with safe errors", () => {
  assert.throws(
    () =>
      explainCron({
        expression: "* * * * * *",
        scheduleZone: "UTC",
        displayZone: "UTC",
        now: "2026-01-01T00:00:00Z",
      }),
    /five-field/,
  );
  assert.throws(
    () =>
      explainCron({
        expression: "* * * * *",
        scheduleZone: "Mars/Olympus",
        displayZone: "UTC",
        now: "2026-01-01T00:00:00Z",
      }),
    /timezone/i,
  );
});

test("does not loop forever for impossible dates", () => {
  assert.throws(
    () =>
      explainCron({
        expression: "0 0 30 FEB *",
        scheduleZone: "UTC",
        displayZone: "UTC",
        now: "2026-01-01T00:00:00Z",
      }),
    /within 32 years/i,
  );
});

test("records cron-parser DST gap shift and fall-back single occurrence policy", () => {
  const spring = explainCron({
    expression: "30 2 * * *",
    scheduleZone: "America/New_York",
    displayZone: "UTC",
    now: "2026-03-08T00:00:00Z",
  });
  assert.equal(spring.runs[0].iso, "2026-03-08T07:30:00.000Z");
  assert.match(spring.runs[0].schedule, /03:30/);
  const fall = explainCron({
    expression: "30 1 * * *",
    scheduleZone: "America/New_York",
    displayZone: "UTC",
    now: "2026-11-01T00:00:00Z",
  });
  assert.equal(fall.runs[0].iso, "2026-11-01T05:30:00.000Z");
  assert.equal(
    fall.runs.filter((r) => r.iso.startsWith("2026-11-01")).length,
    1,
  );
  assert.match(
    fall.notes.join(" "),
    /depending on the timezone and expression/i,
  );
});

test("uses day-of-month/day-of-week OR and explains it", () => {
  const result = explainCron({
    expression: "0 0 1 * MON",
    scheduleZone: "UTC",
    displayZone: "UTC",
    now: "2026-06-02T00:00:00Z",
  });
  assert.equal(result.runs[0].iso, "2026-06-08T00:00:00.000Z");
  assert.match(result.notes.join(" "), /OR semantics/);
});

test("applies Vixie OR before impossible day-of-month intuition", () => {
  const result = explainCron({
    expression: "0 9 30 2 MON",
    scheduleZone: "UTC",
    displayZone: "UTC",
    now: "2026-01-01T00:00:00Z",
  });
  assert.equal(result.runs[0].iso, "2026-02-02T09:00:00.000Z");
});

test("returns all five leap-day occurrences rather than rejecting a valid sparse schedule", () => {
  const result = explainCron({
    expression: "0 0 29 FEB *",
    scheduleZone: "UTC",
    displayZone: "UTC",
    now: "2026-03-01T00:00:00Z",
  });
  assert.deepEqual(
    result.runs.map((r) => r.iso),
    [
      "2028-02-29T00:00:00.000Z",
      "2032-02-29T00:00:00.000Z",
      "2036-02-29T00:00:00.000Z",
      "2040-02-29T00:00:00.000Z",
      "2044-02-29T00:00:00.000Z",
    ],
  );
});

test("supports bounded numeric syntax but rejects Quartz and macro extensions", () => {
  assert.equal(
    explainCron({
      expression: "*/15 8-10 1,15 JAN,MAR MON-FRI",
      scheduleZone: "UTC",
      displayZone: "UTC",
      now: "2026-01-01T00:00:00Z",
    }).fields.length,
    5,
  );
  for (const expression of [
    "@daily",
    "0 0 * * MON#2",
    "0 0 L * *",
    "0 0 * * ?",
    "0 0 * * * 2026",
  ]) {
    assert.throws(
      () =>
        explainCron({
          expression,
          scheduleZone: "UTC",
          displayZone: "UTC",
          now: "2026-01-01T00:00:00Z",
        }),
      /five-field|invalid/i,
    );
  }
});

test("explains stepped and named fields in words without turning steps into month names", () => {
  const basic = {
    scheduleZone: "UTC",
    displayZone: "UTC",
    now: "2026-01-01T00:00:00Z",
  };
  const quarters = explainCron({ ...basic, expression: "*/15 * * * *" });
  assert.match(quarters.explanation, /Every 15 minutes/i);
  const months = explainCron({ ...basic, expression: "0 9 * */2 *" });
  assert.equal(months.fields[3].value, "*/2");
  assert.match(months.fields[3].description, /January/);
  assert.match(months.fields[3].description, /November/);
  assert.doesNotMatch(months.fields[3].description, /\*\/FEB/);
});

test("explains parser OR behavior for stepped day fields and states DST variability", () => {
  const r = explainCron({
    expression: "0 9 */2 * MON",
    scheduleZone: "UTC",
    displayZone: "UTC",
    now: "2026-01-01T00:00:00Z",
  });
  assert.match(
    r.notes.join(" "),
    /both day-of-month and day-of-week are restricted/,
  );
  const repeated = explainCron({
    expression: "*/15 * * * *",
    scheduleZone: "America/New_York",
    displayZone: "America/New_York",
    now: "2026-11-01T05:30:00Z",
  });
  assert.deepEqual(
    repeated.runs.slice(0, 3).map((r) => r.iso),
    [
      "2026-11-01T05:45:00.000Z",
      "2026-11-01T06:00:00.000Z",
      "2026-11-01T06:15:00.000Z",
    ],
  );
  assert.doesNotMatch(
    repeated.notes.join(" "),
    /repeated fall-back wall times occur once/i,
  );
});

test("selected week includes inclusive local midnight through exclusive seven-day end across DST", () => {
  const result = explainCron({
    expression: "0 0 * * *",
    scheduleZone: "America/New_York",
    displayZone: "UTC",
    weekStart: "2026-03-08",
    now: "2026-01-01T00:00:00Z",
  });
  assert.deepEqual(result.preview, {
    startDate: "2026-03-08",
    endDate: "2026-03-15",
    startIso: "2026-03-08T05:00:00.000Z",
    endIso: "2026-03-15T04:00:00.000Z",
  });
  assert.equal(result.runs.length, 7);
  assert.equal(result.runs[0].iso, result.preview.startIso);
  assert.ok(result.runs.every((r) => r.iso < result.preview.endIso));
});

test("selected weeks handle fall back and Lord Howe half-hour transition", () => {
  const run = (weekStart, scheduleZone, expression = "0 0 * * *") =>
    explainCron({
      expression,
      scheduleZone,
      displayZone: "UTC",
      weekStart,
      now: "2026-01-01T00:00:00Z",
    });
  assert.equal(
    run("2026-11-01", "America/New_York").preview.endIso,
    "2026-11-08T05:00:00.000Z",
  );
  assert.equal(
    run("2026-04-05", "Australia/Lord_Howe").preview.endIso,
    "2026-04-11T13:30:00.000Z",
  );
});

test("selected-week validation, sparse zero runs, exact boundaries and dense completeness", () => {
  const base = {
    expression: "0 0 * * *",
    scheduleZone: "UTC",
    displayZone: "UTC",
    now: "2026-01-01T00:00:00Z",
  };
  for (const weekStart of [
    "2026-2-01",
    "2026-02-30",
    "1800-01-01",
    "10000-01-01",
  ]) {
    assert.throws(
      () => explainCron({ ...base, weekStart }),
      /weekStart.*YYYY-MM-DD|valid date/i,
    );
  }
  assert.equal(
    explainCron({ ...base, weekStart: "2026-02-01", expression: "0 0 31 * *" })
      .runs.length,
    0,
  );
  const dense = explainCron({
    ...base,
    weekStart: "2026-03-01",
    expression: "* * * * *",
  });
  assert.equal(dense.runs.length, 10080);
  assert.equal(dense.runs[0].iso, "2026-03-01T00:00:00.000Z");
  assert.equal(dense.runs.at(-1).iso, "2026-03-07T23:59:00.000Z");
  assert.equal(explainCron(base).preview, null);
});
