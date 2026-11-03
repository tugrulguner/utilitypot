const zones = Intl.supportedValuesOf("timeZone");
const city = (zone) => zone.split("/").at(-1).replaceAll("_", " ");
const alias = new Map();
for (const zone of zones) {
  const key = city(zone).toLocaleLowerCase("en");
  const found = alias.get(key) || [];
  found.push(zone);
  alias.set(key, found);
}
// Reviewed local aliases; no geocoding or inference of arbitrary places.
const curatedCities = [
  { value: "Boston", zone: "America/New_York" },
  { value: "Kolkata", zone: "Asia/Kolkata" },
];
export const meetingCities = [
  ...curatedCities,
  ...zones.map((zone) => ({
    value:
      alias.get(city(zone).toLocaleLowerCase("en")).length === 1
        ? city(zone)
        : zone,
    zone,
  })),
].sort((a, b) => a.value.localeCompare(b.value, "en"));
export function resolveMeetingZone(input) {
  const value = String(input ?? "").trim();
  const curated = curatedCities.find(
    (c) => c.value.toLowerCase() === value.toLowerCase(),
  );
  if (curated) return { zone: curated.zone, label: curated.value };
  if (value.toLowerCase() === "springfield")
    throw new Error(
      "“Springfield” is ambiguous; specify the state and choose its timezone from Supported cities. No location was guessed.",
    );
  try {
    const canonical = new Intl.DateTimeFormat("en", {
      timeZone: value,
    }).resolvedOptions().timeZone;
    // Keep explicit area/city IDs; expand supported aliases for the scheduler.
    const zone = value.includes("/")
      ? value
      : canonical === "UTC"
        ? "Etc/UTC"
        : canonical;
    if (zone.includes("/")) return { zone, label: city(zone) };
  } catch {
    /* Resolve only supported IANA IDs or listed cities. */
  }
  const matches = alias.get(value.toLocaleLowerCase("en")) || [];
  if (matches.length > 1)
    throw new Error(
      `“${value}” is ambiguous; choose a listed city or IANA timezone from Supported cities. If your city is absent, choose a known timezone for that location.`,
    );
  if (matches.length === 1)
    return { zone: matches[0], label: city(matches[0]) };
  throw new Error(
    `Unknown city or timezone “${value}”; choose a listed city or IANA timezone from Supported cities. If your city is absent, choose a known timezone for that location.`,
  );
}
export function compactMeetingSlot(slot, baseDate, locale) {
  return slot.local
    .map((person) => {
      const resolved = resolveMeetingZone(person.zone),
        instant = new Date(person.start.split("[")[0]);
      const time = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: resolved.zone,
      }).format(instant);
      const day =
        person.start.slice(0, 10) === baseDate
          ? ""
          : new Intl.DateTimeFormat(locale, {
              month: "short",
              day: "numeric",
              timeZone: resolved.zone,
            }).format(instant) + " ";
      return `${person.cityLabel || resolved.label} ${day}${time}`;
    })
    .join(" · ");
}
export function presentMeetingSlot(slot, locale, { hourCycle } = {}) {
  return slot.local.map((person) => {
    const resolved = resolveMeetingZone(person.zone);
    const label = person.name.trim() || person.cityLabel || resolved.label;
    const formatter = (value) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        ...(hourCycle ? { hourCycle } : {}),
        timeZone: resolved.zone,
      }).format(new Date(value.split("[")[0]));
    return {
      label,
      city: person.cityLabel || resolved.label,
      zone: resolved.zone,
      start: formatter(person.start),
      end: formatter(person.end),
    };
  });
}

// Display only: scheduling instants and complete calendar/text exports stay intact.
export function conciseMeetingSlot(slot, locale) {
  const full = presentMeetingSlot(slot, locale, { hourCycle: "h23" });
  const days = slot.local.flatMap((person) => [
    person.start.slice(0, 10),
    person.end.slice(0, 10),
  ]);
  const shared = days.every((day) => day === days[0]);
  const instant = (value) => new Date(value.split("[")[0]);
  const date = shared
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: full[0].zone,
      }).format(instant(slot.local[0].start))
    : null;
  const people = full.map((person, i) => {
    const source = slot.local[i];
    const time = (value) =>
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: person.zone,
      }).format(instant(value));
    const offset = (value) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: person.zone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(instant(value))
        .find((part) => part.type === "timeZoneName")
        .value.replace("GMT", "UTC")
        .replace(/^UTC[+-]0$/, "UTC");
    const a = offset(source.start),
      b = offset(source.end);
    const start = shared ? time(source.start) : person.start;
    const end = shared ? time(source.end) : person.end;
    const range =
      a === b ? `${start} – ${end} ${a}` : `${start} ${a} – ${end} ${b}`;
    return { ...person, range };
  });
  return { date, people };
}
