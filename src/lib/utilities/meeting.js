import { Temporal } from "@js-temporal/polyfill";
function plainDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s))
    throw new Error("Select an exact date.");
  return Temporal.PlainDate.from(s);
}
function instant(date, zone, time) {
  if (typeof zone !== "string" || zone.length > 80 || !zone.includes("/"))
    throw new Error("Choose an IANA timezone, such as Europe/London.");
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Use times in 24-hour HH:MM format.");
  const [hour, minute] = time.split(":").map(Number);
  try {
    return Temporal.ZonedDateTime.from(
      {
        timeZone: zone,
        year: date.year,
        month: date.month,
        day: date.day,
        hour,
        minute,
      },
      { disambiguation: "reject" },
    ).toInstant();
  } catch {
    throw new Error(
      "Invalid timezone or ambiguous/nonexistent local time at a daylight-saving change. Choose another time.",
    );
  }
}
function range(date, p, start, end) {
  const a = instant(date, p.zone, start);
  const b = instant(end <= start ? date.add({ days: 1 }) : date, p.zone, end);
  if (start === end) throw new Error("Start and end must differ.");
  return [a.epochMilliseconds, b.epochMilliseconds];
}
export function findSlots(dateText, duration, participants) {
  const date = plainDate(dateText);
  if (
    !Number.isInteger(duration) ||
    duration < 15 ||
    duration > 240 ||
    !Array.isArray(participants) ||
    participants.length < 1 ||
    participants.length > 4
  )
    throw new Error("Use 1–4 participants and 15–240 whole minutes.");
  const windows = participants.map((p) => {
    if (typeof p.name !== "string" || p.name.length > 60)
      throw new Error("Use short participant labels.");
    const [start, end] = range(date, p, p.start, p.end);
    let blocked = null;
    if (p.excludeStart || p.excludeEnd) {
      if (!p.excludeStart || !p.excludeEnd)
        throw new Error("An excluded interval needs both times.");
      blocked = range(date, p, p.excludeStart, p.excludeEnd);
    }
    return { p, start, end, blocked };
  });
  const lower = Math.max(...windows.map((w) => w.start));
  const upper = Math.min(...windows.map((w) => w.end));
  const step = 15 * 60000;
  const span = duration * 60000;
  const slots = [];
  for (let t = Math.ceil(lower / step) * step; t + span <= upper; t += step) {
    if (
      windows.some(
        (w) => w.blocked && t < w.blocked[1] && t + span > w.blocked[0],
      )
    )
      continue;
    const start = Temporal.Instant.fromEpochMilliseconds(t);
    const end = start.add({ minutes: duration });
    slots.push({
      start: start.toString(),
      end: end.toString(),
      local: windows.map((w) => ({
        name: w.p.name,
        zone: w.p.zone,
        start: start.toZonedDateTimeISO(w.p.zone).toString(),
        end: end.toZonedDateTimeISO(w.p.zone).toString(),
      })),
    });
  }
  return slots;
}
export function calendarEvent(slot, duration) {
  const start = Temporal.Instant.from(slot.start);
  const end = start.add({ minutes: duration });
  const fmt = (i) =>
    i.toString({ smallestUnit: "second" }).replace(/[-:]/g, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ModePot//Meeting time finder//EN",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@modepot.io`,
    `DTSTAMP:${fmt(Temporal.Now.instant())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    "SUMMARY:Meeting",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
export function timeCandidates(text) {
  const values = new Set();
  const matches = text.matchAll(
    /\b(noon|midnight|(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:am|pm)?|(?:1[0-2]|0?[1-9])\s*(?:am|pm))\b/gi,
  );
  for (const m of matches) {
    const s = m[0].toLowerCase().replace(/\s/g, "");
    if (s === "noon") {
      values.add("12:00");
      continue;
    }
    if (s === "midnight") {
      values.add("00:00");
      continue;
    }
    const n = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
    if (!n) continue;
    let h = +n[1];
    if (n[3]) {
      if (h < 1 || h > 12) continue;
      h = (h % 12) + (n[3] === "pm" ? 12 : 0);
    }
    values.add(`${String(h).padStart(2, "0")}:${n[2] || "00"}`);
  }
  return [...values].slice(0, 16);
}
export function createMeetingInterpretation(input) {
  if (
    !input ||
    !Array.isArray(input.participants) ||
    input.participants.length < 1 ||
    input.participants.length > 4
  )
    throw new Error("Use 1–4 participants.");
  plainDate(input.date);
  if (
    !Number.isInteger(input.duration) ||
    input.duration < 15 ||
    input.duration > 240
  )
    throw new Error("Select a duration of 15–240 minutes.");
  const state = {
    date: input.date,
    duration: input.duration,
    participants: [],
  };
  const questions = {};
  const candidates = [];
  input.participants.forEach((p, i) => {
    if (
      typeof p.text !== "string" ||
      p.text.length > 500 ||
      typeof p.name !== "string" ||
      p.name.length > 60
    )
      throw new Error("Use at most 500 characters per availability statement.");
    instant(plainDate(input.date), p.zone, "12:00");
    const times = timeCandidates(p.text);
    if (!times.length)
      throw new Error(
        "Include explicit times such as 9am and 5pm, or enter the windows manually.",
      );
    // Do not collapse disjoint source intervals into their outer bounds. The
    // supported shape is one positive window followed by at most one exclusion.
    // Other forms need manual windows rather than a semantic guess about scope.
    const segments = p.text.split(
      /\b(?:except|excluding|not|unavailable|busy)\b/i,
    );
    const allowedTimes = timeCandidates(segments[0]);
    const excludedTimes =
      segments.length === 2 ? timeCandidates(segments[1]) : [];
    if (
      segments.length > 2 ||
      allowedTimes.length > 2 ||
      excludedTimes.length > 2 ||
      (segments.length === 2 && (!allowedTimes.length || !excludedTimes.length))
    )
      throw new Error(
        "Multiple or unsupported availability windows: enter windows and exclusions manually.",
      );
    candidates.push(times);
    state.participants.push({
      name: p.name,
      zone: p.zone,
      text: p.text,
      candidates: times,
    });
    const options = (values) => ({
      ...Object.fromEntries(values.map((t) => [t, null])),
      none: "Not explicitly stated or ambiguous; ask the user.",
    });
    for (const [part, role] of Object.entries({
      start: "earliest permitted start (after/from), not an excluded time",
      end: "end of the permitted window (before/until), not an excluded time",
      excludeStart:
        "start of an explicitly forbidden interval; none if no exclusion",
      excludeEnd:
        "end of an explicitly forbidden interval; none if no exclusion",
    }))
      questions[`p${i}_${part}`] = {
        type: "choice",
        instructions: `For participant ${i + 1} only, select the ${role}. Do not invent working hours or fill omitted boundaries.`,
        criteria: options(
          part.startsWith("exclude") ? excludedTimes : allowedTimes,
        ),
      };
    questions[`p${i}_scope`] = {
      type: "choice",
      instructions: `Does participant ${i + 1}'s statement specify one allowed time window with at most one excluded interval applying to the selected exact date? Return review for multiple allowed windows, a different day, ambiguous timezone/date, contradictory or unsupported requirements.`,
      criteria: {
        supported:
          "One interpretable window on the selected date, possibly missing a boundary that must be manually supplied.",
        review:
          "Contradictory, different date, ambiguous or outside the supported scope.",
      },
    };
  });
  return {
    state,
    questions,
    decode(answers) {
      return {
        participants: input.participants.map((p, i) => ({
          name: p.name,
          zone: p.zone,
          ...Object.fromEntries(
            ["start", "end", "excludeStart", "excludeEnd"].map((k) => [
              k,
              answers[`p${i}_${k}`].choice === "none"
                ? ""
                : answers[`p${i}_${k}`].choice,
            ]),
          ),
          needsReview: true,
          scope: answers[`p${i}_scope`].choice,
        })),
        needsReview: true,
      };
    },
  };
}
