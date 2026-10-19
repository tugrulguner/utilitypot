function localTime(iso, zone) {
  const instant = new Date(iso);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(instant);
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: "longOffset",
  })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")
    .value.replace("GMT", "UTC");
  return { date, clock, offset: offset === "UTC" ? "UTC+00:00" : offset };
}
export function presentCronRun(iso, displayZone, scheduleZone) {
  const local = localTime(iso, displayZone);
  const scheduled = localTime(iso, scheduleZone);
  return {
    ...local,
    schedule:
      displayZone === scheduleZone
        ? null
        : `${scheduled.date === local.date ? "" : scheduled.date + " · "}${scheduled.clock} ${scheduled.offset}`,
  };
}
