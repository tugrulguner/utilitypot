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
  assert.equal(resolveMeetingZone("UTC").zone, "Etc/UTC");
  assert.equal(resolveMeetingZone("Asia/Kolkata").zone, "Asia/Kolkata");
  assert.equal(resolveMeetingZone("Europe/Paris").zone, "Europe/Paris");
});
test("selected meeting presentation can use 24-hour time without losing its local date", () => {
  const slot = {
    local: [
      {
        name: "",
        zone: "Europe/London",
        start: "2026-11-03T09:00:00+00:00[Europe/London]",
        end: "2026-11-03T09:30:00+00:00[Europe/London]",
      },
    ],
  };
  const result = presentMeetingSlot(slot, "en-US", { hourCycle: "h23" })[0];
  assert.match(result.start, /Nov 3, 2026, 09:00/);
  assert.equal(result.zone, "Europe/London");
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

test("fresh UX: Boston discovery preserves city identity and ambiguous cities fail closed", async () => {
  const { meetingCities, compactMeetingSlot } =
    await import("./meeting-presentation.js");
  assert.deepEqual(resolveMeetingZone(" bOsToN "), {
    zone: "America/New_York",
    label: "Boston",
  });
  assert.ok(
    meetingCities.some(
      (c) => c.value === "Boston" && c.zone === "America/New_York",
    ),
  );
  assert.throws(() => resolveMeetingZone("Springfield"), /ambiguous.*state/i);
  const { findSlots, calendarEvent } = await import("./meeting.js");
  const people = [
    {
      name: "",
      zone: "Europe/Berlin",
      cityLabel: "Berlin",
      start: "14:00",
      end: "18:00",
    },
    {
      name: "",
      zone: resolveMeetingZone("Boston").zone,
      cityLabel: "Boston",
      start: "08:00",
      end: "12:00",
    },
  ];
  const slots = findSlots("2027-02-11", 45, people);
  assert.match(
    compactMeetingSlot(slots[0], "2027-02-11", "en-US"),
    /Boston 08:00/,
  );
  assert.equal(presentMeetingSlot(slots[0], "en-US")[1].city, "Boston");
  assert.match(calendarEvent(slots[0], 45), /DTSTART:20270211T130000Z/);
  assert.match(calendarEvent(slots[0], 45), /DTEND:20270211T134500Z/);
  assert.equal(
    findSlots("2027-03-15", 45, people)[0].start,
    "2027-03-15T13:00:00Z",
  );
});
