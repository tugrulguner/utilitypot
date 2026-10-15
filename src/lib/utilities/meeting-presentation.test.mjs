import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveMeetingZone,
  presentMeetingSlot,
} from "./meeting-presentation.js";
test("resolves familiar city names and explicit IANA IDs", () => {
  assert.deepEqual(resolveMeetingZone("London"), {
    zone: "Europe/London",
    label: "London",
  });
  assert.equal(resolveMeetingZone("New York").zone, "America/New_York");
  assert.equal(resolveMeetingZone("Europe/Paris").zone, "Europe/Paris");
});
test("rejects ambiguous and unknown city names", () => {
  assert.throws(() => resolveMeetingZone("Springfield"), /ambiguous|Unknown/i);
  assert.throws(
    () => resolveMeetingZone("Atlantis"),
    /choose a listed city or IANA/i,
  );
});
test("presents readable local participant times", () => {
  const slot = {
    local: [
      {
        name: "",
        zone: "Europe/London",
        start: "2026-06-15T09:30:00+01:00[Europe/London]",
        end: "2026-06-15T10:00:00+01:00[Europe/London]",
      },
    ],
  };
  assert.deepEqual(presentMeetingSlot(slot, "en-US")[0], {
    label: "London",
    city: "London",
    zone: "Europe/London",
    start: "Jun 15, 2026, 9:30 AM",
    end: "Jun 15, 2026, 10:00 AM",
  });
});
