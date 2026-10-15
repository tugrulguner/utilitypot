import test from "node:test";
import assert from "node:assert/strict";
import {
  findSlots,
  calendarEvent,
  createMeetingInterpretation,
} from "./meeting.js";
test("finds exact overlaps with half-hour timezone offsets", () => {
  const result = findSlots("2026-06-15", 30, [
    { name: "London", zone: "Europe/London", start: "09:00", end: "12:00" },
    { name: "India", zone: "Asia/Kolkata", start: "14:00", end: "16:00" },
  ]);
  assert.equal(result[0].start, "2026-06-15T08:30:00Z");
  assert.equal(result.at(-1).start, "2026-06-15T10:00:00Z");
  assert.match(calendarEvent(result[0], 30), /DTSTART:20260615T083000Z/);
});
test("exclusions remove overlapping duration and empty intersection remains empty", () => {
  const people = [
    {
      name: "A",
      zone: "Etc/UTC",
      start: "09:00",
      end: "10:00",
      excludeStart: "09:15",
      excludeEnd: "09:45",
    },
  ];
  assert.equal(findSlots("2026-06-15", 30, people).length, 0);
  assert.equal(
    findSlots("2026-06-15", 30, [
      { name: "A", zone: "Etc/UTC", start: "09:00", end: "10:00" },
      { name: "B", zone: "Etc/UTC", start: "11:00", end: "12:00" },
    ]).length,
    0,
  );
});
test("DST gaps and repeated local times require explicit resolution", () => {
  assert.throws(
    () =>
      findSlots("2026-03-08", 30, [
        { name: "A", zone: "America/New_York", start: "02:30", end: "04:00" },
      ]),
    /daylight/,
  );
  assert.throws(
    () =>
      findSlots("2026-11-01", 30, [
        { name: "A", zone: "America/New_York", start: "01:30", end: "04:00" },
      ]),
    /daylight/,
  );
});
test("AI refuses multiple allowed windows rather than bridging an unavailable gap", () => {
  for (const text of [
    "available from 9am to 5pm, or 7pm to 9pm",
    "9am to noon and 2pm to 5pm, except 10am to 11am",
  ])
    assert.throws(
      () =>
        createMeetingInterpretation({
          date: "2026-06-15",
          duration: 30,
          participants: [{ name: "A", zone: "Etc/UTC", text }],
        }),
      /multiple.*window|manually/i,
    );
});

test("AI interprets bounded source time candidates rather than inventing times", () => {
  const spec = createMeetingInterpretation({
    date: "2026-06-15",
    duration: 30,
    participants: [
      {
        name: "A",
        zone: "Europe/London",
        text: "from 9am until noon, not 10am to 11am",
      },
    ],
  });
  assert.deepEqual(Object.keys(spec.questions.p0_start.criteria), [
    "09:00",
    "12:00",
    "none",
  ]);
  const answers = Object.fromEntries(
    Object.keys(spec.questions).map((k) => [
      k,
      {
        choice: k.endsWith("scope")
          ? "supported"
          : k.endsWith("excludeStart")
            ? "10:00"
            : k.endsWith("excludeEnd")
              ? "11:00"
              : k.endsWith("start")
                ? "09:00"
                : "12:00",
      },
    ]),
  );
  assert.deepEqual(Object.keys(spec.questions.p0_excludeEnd.criteria), [
    "10:00",
    "11:00",
    "none",
  ]);
  assert.equal(spec.decode(answers).participants[0].excludeEnd, "11:00");
});
