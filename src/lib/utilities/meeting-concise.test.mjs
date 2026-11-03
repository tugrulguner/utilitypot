import test from "node:test";
import assert from "node:assert/strict";
import * as view from "./meeting-presentation.js";
const person = (zone, start, end) => ({ zone, name: "", start, end });
test("concise selected ranges share a date and distinguish UTC offsets without changing slot data", () => {
  assert.equal(typeof view.conciseMeetingSlot, "function");
  const slot = {
    local: [
      person(
        "Europe/London",
        "2026-11-03T09:00:00+00:00[Europe/London]",
        "2026-11-03T09:30:00+00:00[Europe/London]",
      ),
      person(
        "Asia/Kolkata",
        "2026-11-03T14:30:00+05:30[Asia/Kolkata]",
        "2026-11-03T15:00:00+05:30[Asia/Kolkata]",
      ),
    ],
  };
  const before = JSON.stringify(slot),
    result = view.conciseMeetingSlot(slot, "en-US");
  assert.equal(result.date, "Nov 3, 2026");
  assert.equal(result.people[0].range, "09:00 – 09:30 UTC");
  assert.equal(result.people[1].range, "14:30 – 15:00 UTC+5:30");
  assert.equal(JSON.stringify(slot), before);
});
test("cross-day ranges keep complete dates and clock-change ranges keep both offsets", () => {
  assert.equal(typeof view.conciseMeetingSlot, "function");
  const rollover = view.conciseMeetingSlot(
    {
      local: [
        person(
          "Europe/London",
          "2026-12-31T23:45:00+00:00[Europe/London]",
          "2027-01-01T00:15:00+00:00[Europe/London]",
        ),
      ],
    },
    "en-US",
  );
  assert.equal(rollover.date, null);
  assert.match(rollover.people[0].range, /Dec 31, 2026/);
  assert.match(rollover.people[0].range, /Jan 1, 2027/);
  const dst = view.conciseMeetingSlot(
    {
      local: [
        person(
          "America/New_York",
          "2026-11-01T01:30:00-04:00[America/New_York]",
          "2026-11-01T01:15:00-05:00[America/New_York]",
        ),
      ],
    },
    "en-US",
  );
  assert.match(dst.people[0].range, /UTC-4/);
  assert.match(dst.people[0].range, /UTC-5/);
});

test("common Kolkata city input resolves without requiring an old timezone alias", () => {
  assert.deepEqual(view.resolveMeetingZone("Kolkata"), {
    zone: "Asia/Kolkata",
    label: "Kolkata",
  });
});
