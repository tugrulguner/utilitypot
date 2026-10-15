import { Temporal } from "@js-temporal/polyfill";
const conventions = ["auto", "day-first", "month-first"];
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
export function normalizeDates(text, convention = "auto") {
  if (
    typeof text !== "string" ||
    text.length > 200000 ||
    !conventions.includes(convention)
  )
    throw new Error("Use at most 200 KB and a supported date convention.");
  const lines = text.split(/\r?\n/);
  if (lines.length > 10000) throw new Error("Use at most 10,000 dates.");
  return lines.map((original, index) => {
    const s = original.trim();
    const row = {
      row: index + 1,
      original,
      normalized: "",
      status: "invalid",
      note: "Unsupported or invalid date. No value was inferred.",
    };
    if (!s) return { ...row, status: "empty", note: "Blank preserved." };
    let y, m, d;
    if (/^\d{4}$/.test(s) && +s >= 1)
      return {
        ...row,
        normalized: s,
        status: "partial",
        note: "Year only; no month/day invented.",
      };
    const partial = s.match(/^(\d{4})-(\d{2})$/);
    if (partial && +partial[1] >= 1 && +partial[2] >= 1 && +partial[2] <= 12)
      return {
        ...row,
        normalized: s,
        status: "partial",
        note: "Month precision preserved; no day invented.",
      };
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const numeric = s.match(/^(\d{1,2})([/.\-])(\d{1,2})\2(\d{4})$/);
    const named = s.match(
      /^(?:(\d{1,2})\s+([A-Za-z]+)|([A-Za-z]+)\s+(\d{1,2}),?)\s+(\d{4})$/,
    );
    if (iso) {
      [, y, m, d] = iso;
    } else if (numeric) {
      const a = +numeric[1],
        b = +numeric[3];
      y = numeric[4];
      if (convention === "auto" && a <= 12 && b <= 12 && a !== b)
        return {
          ...row,
          status: "review",
          note: "Day/month ambiguous. Confirm the source convention.",
        };
      if (convention === "day-first" || (convention === "auto" && a > 12)) {
        d = a;
        m = b;
      } else {
        m = a;
        d = b;
      }
    } else if (named) {
      d = named[1] || named[4];
      const name = (named[2] || named[3]).toLowerCase();
      m = months.findIndex((v) => v === name || v.slice(0, 3) === name) + 1;
      y = named[5];
    } else return row;
    try {
      if (+y < 1) return row;
      const date = Temporal.PlainDate.from(
        { year: +y, month: +m, day: +d },
        { overflow: "reject" },
      );
      return {
        ...row,
        normalized: date.toString(),
        status: "converted",
        note: "Calendar-valid under the selected interpretation.",
      };
    } catch {
      return row;
    }
  });
}
export function createDatesInterpretation(input) {
  if (
    !input ||
    typeof input.context !== "string" ||
    !input.context.trim() ||
    input.context.length > 1000 ||
    typeof input.sample !== "string" ||
    input.sample.length > 3000 ||
    input.sample.split(/\r?\n/).length > 20
  )
    throw new Error("Provide source context and at most 20 sample dates.");
  return {
    state: { sourceContext: input.context, sample: input.sample },
    questions: {
      convention: {
        type: "choice",
        instructions:
          "From explicitly stated source context, which numeric date convention is intended? Prefer unspecified when the context gives no reliable evidence or says the data mixes locales. Do not infer a convention only from plausible-looking date numbers.",
        criteria: {
          "day-first":
            "The stated source uses day then month (e.g. explicitly UK or DMY).",
          "month-first":
            "The stated source uses month then day (e.g. explicitly US or MDY).",
          unspecified:
            "No reliable single convention is stated, or locales are mixed.",
        },
      },
    },
    decode(answers) {
      return {
        convention:
          answers.convention.choice === "unspecified"
            ? "auto"
            : answers.convention.choice,
        needsReview: true,
      };
    },
  };
}
