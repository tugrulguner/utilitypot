const zones = Intl.supportedValuesOf("timeZone");
const city = (zone) => zone.split("/").at(-1).replaceAll("_", " ");
const alias = new Map();
for (const zone of zones) {
  const key = city(zone).toLocaleLowerCase("en");
  const found = alias.get(key) || [];
  found.push(zone);
  alias.set(key, found);
}
export function resolveMeetingZone(input) {
  const value = String(input ?? "").trim();
  if (value.includes("/")) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return { zone: value, label: city(value) };
    } catch {
      /* Resolve only supported IANA IDs or listed cities. */
    }
  }
  const matches = alias.get(value.toLocaleLowerCase("en")) || [];
  if (matches.length > 1)
    throw new Error(
      `“${value}” is ambiguous; choose a listed city or IANA timezone.`,
    );
  if (matches.length === 1)
    return { zone: matches[0], label: city(matches[0]) };
  throw new Error(
    `Unknown city or timezone “${value}”; choose a listed city or IANA timezone.`,
  );
}
export function presentMeetingSlot(slot, locale) {
  return slot.local.map((person) => {
    const resolved = resolveMeetingZone(person.zone);
    const label = person.name.trim() || resolved.label;
    const formatter = (value) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: resolved.zone,
      }).format(new Date(value.split("[")[0]));
    return {
      label,
      city: resolved.label,
      zone: resolved.zone,
      start: formatter(person.start),
      end: formatter(person.end),
    };
  });
}
