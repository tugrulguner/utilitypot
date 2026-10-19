import { CronExpressionParser } from "cron-parser";

const MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");
const DAYS = "SUN MON TUE WED THU FRI SAT".split(" ");
const FIELD_META = [
  ["Minute", 0, 59, null],
  ["Hour", 0, 23, null],
  ["Day of month", 1, 31, null],
  ["Month", 1, 12, MONTHS],
  ["Day of week", 0, 7, DAYS],
];
const MAX_HORIZON_YEARS = 32;

function validZone(zone, name) {
  if (
    typeof zone !== "string" ||
    !zone.trim() ||
    /^[+-]\d{2}:?\d{2}$/.test(zone)
  ) {
    throw new Error(`${name} must be a valid named timezone.`);
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(0);
  } catch {
    throw new Error(`${name} must be a valid named timezone.`);
  }
  return zone;
}

function validateField(field, index) {
  const [label, min, max, names] = FIELD_META[index];
  const normalized = field.toUpperCase().replace(/[A-Z]{3}/g, (word) => {
    if (names?.includes(word))
      return String(names.indexOf(word) + (index === 3 ? 1 : 0));
    return word;
  });
  const allowed = new Set(names ?? []);
  const parts = normalized.split(",");
  if (
    !parts.length ||
    parts.some((part) => {
      if (!part) return true;
      const [base, step, ...extra] = part.split("/");
      if (
        extra.length ||
        (step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1))
      )
        return true;
      if (base === "*") return false;
      const range = base.split("-");
      if (range.length > 2) return true;
      const number = (v) => (/^\d+$/.test(v) ? Number(v) : NaN);
      if (range.length === 2) {
        const a = number(range[0]);
        const b = number(range[1]);
        return (
          !Number.isInteger(a) ||
          !Number.isInteger(b) ||
          a < min ||
          a > max ||
          b < min ||
          b > max ||
          a > b
        );
      }
      const n = number(base);
      return (
        !(Number.isInteger(n) && n >= min && n <= max) && !allowed.has(base)
      );
    })
  )
    throw new Error(
      `${label} field is invalid; use values ${min}–${max}, lists, ranges, or steps.`,
    );
  return normalized;
}

const MONTH_NAMES =
  "January February March April May June July August September October November December".split(
    " ",
  );
const DAY_NAMES =
  "Sunday Monday Tuesday Wednesday Thursday Friday Saturday".split(" ");
const FIELD_KEYS = ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"];
function wordList(values, index) {
  const label = (n) =>
    index === 3 ? MONTH_NAMES[n - 1] : index === 4 ? DAY_NAMES[n] : String(n);
  if (
    values.length > 2 &&
    values.every((v, i) => !i || v === values[i - 1] + 1)
  )
    return `${label(values[0])} through ${label(values.at(-1))}`;
  const words = values.map(label);
  return words.length < 2
    ? words[0]
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}
function describeField(field, index, values) {
  const full = [60, 24, 31, 12, 7][index];
  const every = [
    "Every minute.",
    "Every hour.",
    "Every day of the month.",
    "Every month.",
    "Every day of the week.",
  ];
  const prefix = ["At minutes", "At hours", "On days of the month", "In", "On"];
  return {
    label: FIELD_META[index][0],
    value: field,
    description:
      values.length === full
        ? every[index]
        : `${prefix[index]} ${wordList(values, index)}.`,
  };
}
function explainSchedule(fields, values, domWildcard, dowWildcard) {
  const pad = (n) => String(n).padStart(2, "0"),
    minutes = values[0],
    hours = values[1];
  let clock;
  if (minutes.length === 60 && hours.length === 24) clock = "Every minute";
  else if (hours.length === 24 && /^\*\/\d+$/.test(fields[0]))
    clock = `Every ${Number(fields[0].split("/")[1])} minutes, starting at minute 0 of each hour`;
  else if (minutes.length === 1 && hours.length === 1)
    clock = `At ${pad(hours[0])}:${pad(minutes[0])}`;
  else
    clock = `At minute${minutes.length === 1 ? "" : "s"} ${wordList(minutes, 0)} ${hours.length === 24 ? "of every hour" : `past hour${hours.length === 1 ? "" : "s"} ${wordList(hours, 1)}`}`;
  const calendar =
    !domWildcard && !dowWildcard
      ? `when either the day of the month is ${wordList(values[2], 2)} or the weekday is ${wordList(values[4], 4)}`
      : !domWildcard
        ? `on day${values[2].length === 1 ? "" : "s"} ${wordList(values[2], 2)} of the month`
        : !dowWildcard
          ? `on ${wordList(values[4], 4)}`
          : "every day";
  return `${clock}, ${calendar}${values[3].length === 12 ? "" : `, in ${wordList(values[3], 3)}`}.`;
}

function offsetAt(date, zone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  return (
    parts.find((p) => p.type === "timeZoneName")?.value.replace("GMT", "UTC") ??
    "UTC+00:00"
  );
}

export function formatRun(date, displayZone) {
  const display = new Intl.DateTimeFormat("en-US", {
    timeZone: displayZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return {
    iso: date.toISOString(),
    display: `${display} (${offsetAt(date, displayZone)})`,
    schedule: null,
  };
}

export function explainCron({
  expression,
  scheduleZone,
  displayZone,
  now = new Date(),
} = {}) {
  if (typeof expression !== "string" || !expression.trim())
    throw new Error("Enter a five-field cron expression.");
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5)
    throw new Error("Only standard five-field cron expressions are supported.");
  scheduleZone = validZone(scheduleZone, "Schedule timezone");
  displayZone = validZone(displayZone, "Display timezone");
  const instant = now instanceof Date ? new Date(now) : new Date(now);
  if (!Number.isFinite(instant.getTime()))
    throw new Error("Reference time must be a valid date or ISO timestamp.");
  const normalized = fields.map(validateField);
  let interval;
  try {
    interval = CronExpressionParser.parse(normalized.join(" "), {
      currentDate: instant,
      tz: scheduleZone,
      strict: false,
      endDate: new Date(
        Date.UTC(
          instant.getUTCFullYear() + MAX_HORIZON_YEARS,
          instant.getUTCMonth(),
          instant.getUTCDate(),
          instant.getUTCHours(),
          instant.getUTCMinutes(),
          instant.getUTCSeconds(),
        ),
      ),
    });
  } catch {
    throw new Error(
      "Cron expression is invalid or cannot provide five runs within 32 years.",
    );
  }
  const runs = [];
  try {
    while (runs.length < 5) {
      const date = interval.next().toDate();
      if (date <= instant || runs.some((run) => run.iso === date.toISOString()))
        continue;
      const run = formatRun(date, displayZone);
      run.schedule = formatRun(date, scheduleZone).display;
      runs.push(run);
    }
  } catch {
    throw new Error(
      "Cannot find five runs within 32 years of the reference time. Check the calendar fields.",
    );
  }
  const restrictedDom = !interval.fields.dayOfMonth.isWildcard;
  const restrictedDow = !interval.fields.dayOfWeek.isWildcard;
  const notes = [];
  if (restrictedDom && restrictedDow)
    notes.push(
      "Standard cron uses OR semantics when both day-of-month and day-of-week are restricted.",
    );
  notes.push(
    "Clock changes can shift or skip a missing time, or repeat a wall time, depending on the timezone and expression. This preview follows cron-parser 5.10.2; your scheduler may behave differently. Compare the dates and UTC offsets.",
  );
  notes.push(
    "Wildcard and stepped-wildcard fields (for example * versus */1) retain cron-parser’s standard matching semantics; day-field OR handling follows that parser rather than treating every full-range field as a literal asterisk.",
  );
  const values = FIELD_KEYS.map((key, i) =>
    [
      ...new Set(interval.fields[key].values.map((v) => (i === 4 ? v % 7 : v))),
    ].sort((a, b) => a - b),
  );
  const descriptions = fields.map((field, i) =>
    describeField(field, i, values[i]),
  );
  return {
    expression: expression.trim(),
    explanation: explainSchedule(
      normalized,
      values,
      !restrictedDom,
      !restrictedDow,
    ),
    fields: descriptions,
    runs,
    scheduleZone,
    displayZone,
    notes,
  };
}
