// Claims and canonical project roots are supported by the publicReader samples
// in docs/public-usability-final-evidence.json (runtime cf82c14). These are
// sibling projects, not claims about UtilityPot's implementation dependencies.
export const projects = {
  dexpot: {
    name: "Dexpot",
    href: "https://dexpot.modepot.io/",
    description:
      "Synchronous Python HTTP APIs with adaptive execution for GIL and free-threaded CPython.",
    reason: "Exploring synchronous Python HTTP APIs?",
    accent: "#66D9FF",
    lightAccent: "#07617C",
  },
  lifepot: {
    name: "LifePot",
    href: "https://lifepot.modepot.io/learn",
    description:
      "Create and replay artificial-life worlds with validated simulation rules.",
    reason: "Curious about artificial-life simulations?",
    accent: "#77E5BD",
    lightAccent: "#16634B",
  },
  refpot: {
    name: "RefPot",
    reason: "Exploring Python storage for structured records?",
    accent: "#F4F2EA",
    lightAccent: "#303238",
    href: "https://refpot.modepot.io/",
    description:
      "An experimental embedded database for Python, with CRUD and explicit transactions. Qualification remains limited.",
  },
  intpot: {
    name: "Intpot",
    reason: "Building your own reusable Python tools?",
    accent: "#F2B84B",
    lightAccent: "#795711",
    href: "https://intpot.modepot.io/",
    description: "Define typed Python tools for CLI, HTTP and MCP interfaces.",
  },
  summonpot: {
    name: "Summonpot",
    reason: "Exploring bounded agent decisions in Python APIs?",
    accent: "#A987FF",
    lightAccent: "#6740AD",
    href: "https://summonpot.modepot.io/",
    description:
      "Contract-first Python APIs with bounded agent decisions and application-owned operations.",
  },
};
export const guides = {
  "redact-screenshot": {
    title: "Redact a screenshot — permanent black-box image redaction",
    description:
      "Paste or upload an image, cover selected regions with solid black pixels and download a flattened PNG. Browser-local manual redaction; review the entire image before sharing.",
    steps: [
      "Choose or paste one PNG, JPEG or WebP image, up to 10 MB and eight million pixels.",
      "Draw rectangles or enter pixel coordinates. Review every region; only selected areas are covered.",
      "Download a newly encoded PNG with opaque black redactions baked into its pixels. Keep the original image private.",
    ],
    example:
      "Cover a name or account number in a screenshot. Check the downloaded PNG, not only the preview: unselected sensitive information is still visible.",
    related: ["compare-spreadsheets", "json-to-csv"],
    project: "lifepot",
    reason: "Explore another browser-based project from the workshop.",
  },
  "compare-spreadsheets": {
    title: "Compare spreadsheets — CSV and XLSX row and cell differences",
    description:
      "Compare two CSV or XLSX tables by a chosen key. Review added, removed and changed rows and values, then download CSV or JSON. Files stay in your browser.",
    steps: [
      "Paste CSV or choose two CSV/XLSX files. Use the first row as headers and select a worksheet for each workbook.",
      "Choose a shared key column with nonblank unique values. Compare exact stored values, not visual cell formatting.",
      "Inspect added, removed and changed values. Download a formula-protected CSV report or literal JSON.",
    ],
    example:
      "Match inventory by SKU: 000123 stays distinct from 123. A reordered row is not a change; an updated quantity is. Formulas are compared as text and are never calculated.",
    related: ["csv-to-nested-json", "fix-excel-dates"],
    project: "refpot",
    reason:
      "Exploring storage for structured records after comparing your tables?",
  },
  "csv-to-nested-json": {
    title: "CSV to nested JSON converter — group rows locally",
    description:
      "Group CSV rows by a shared column, review nested JSON, then copy or download. Keeps string values and leading zeros; everything stays in your browser.",
    steps: [
      "Paste CSV text or upload a CSV, then choose the column that identifies each parent.",
      "Review which columns stay on the parent and name the child array. Build the JSON and inspect every group.",
      "Copy or download the result. Keep identifiers as strings when importing elsewhere.",
    ],
    example:
      "For Customer,SKU rows 001,A and 001,B, grouping by Customer gives one parent with two child rows. A second customer becomes a separate parent.",
    related: ["json-to-csv", "fix-excel-dates"],
    project: "refpot",
    reason: "Exploring Python storage after preparing records?",
  },
  "json-to-csv": {
    title: "JSON to CSV converter — spreadsheet rows in your browser",
    description:
      "Convert JSON to CSV in your browser. Preview sample rows and choose between lists only when needed before spreadsheet export.",
    steps: [
      "Paste JSON or load the example. A single object or list is selected for you; choose between lists only if there is more than one.",
      "If a row contains another list, choose whether to stop, leave that list out or keep it as JSON text in one cell.",
      "Convert, review the column preview, then copy or download the CSV.",
    ],
    example:
      'An order with customer: {name: "Ada"} produces a customer.name column. Quote long IDs in the source JSON to avoid numeric precision loss.',
    related: ["csv-to-nested-json", "fix-excel-dates"],
    project: "refpot",
    reason: "Exploring Python storage for structured records?",
  },
  "fix-excel-dates": {
    title: "Fix mixed spreadsheet dates — review ambiguity",
    description:
      "Normalize supported date text while preserving originals and flagging ambiguity. Paste text only; .xlsx files, serial numbers and timestamps are unsupported.",
    steps: [
      "Paste date text, one value per line. Choose a convention only when you know what the source intended.",
      "Fix dates and inspect each original value beside its normalized value and review status.",
      "Download the report and review your spreadsheet import settings before using the dates.",
    ],
    example:
      "2026-04 stays a month, 2026 stays a year, and 03/04/2026 needs a known day-first or month-first convention. No missing day is invented.",
    related: ["json-to-csv", "meeting-time-finder"],
    project: "intpot",
    reason: "Building your own repeatable Python data tools?",
  },
  "meeting-time-finder": {
    title: "Meeting time finder across time zones",
    description:
      "Compare one-off availability windows across time zones, review overlapping slots and download a calendar event. No calendar connection needed.",
    steps: [
      "Choose the local date, duration and each participant’s timezone and available window.",
      "Add an excluded interval if needed, then find times and compare the local times in the result.",
      "Select a slot and download a calendar event. Share it yourself; this tool does not invite participants.",
    ],
    example:
      "Load the London–Kolkata working-hours example to inspect 30-minute overlaps. Replace the sample hours with the participants’ actual availability.",
    related: ["fix-excel-dates", "text-to-mermaid"],
    project: "intpot",
    reason:
      "Interested in making your own Python tools available through several interfaces?",
  },
  "entity-extractor": {
    title: "Extract names from text",
    description:
      "Extract people, organizations or custom categories from text. Review exact source mentions, make corrections and export JSON.",
    steps: [
      "Paste text and choose people, companies or a custom category.",
      "Extract names, then review grouped names, categories and each exact source occurrence.",
      "Validate the reviewed mentions, then copy or download JSON with source offsets.",
    ],
    example:
      "In “Ada joined Acme Labs”, Ada can be a Person and Acme Labs an Organization. Review repeated names separately; extraction can miss names.",
    related: ["ask-a-webpage", "json-to-csv"],
    project: "summonpot",
    reason: "Exploring bounded agent decisions in your own Python APIs?",
  },
  "text-to-mermaid": {
    title: "Text to Mermaid flowchart and SVG",
    description:
      "Turn up to eight listed steps into a reviewable flowchart. Edit connections privately, render locally and download Mermaid or SVG.",
    steps: [
      "List up to eight steps and describe their connections, then create the flowchart.",
      "Review node types and destinations, especially both branches of each decision. Correct the graph before sharing.",
      "Render the reviewed graph and download Mermaid source or SVG.",
    ],
    example:
      "For Receive request → Review → Approve or Revise, use a decision with distinct Yes and No destinations. Check that the branches express your intended process.",
    related: ["meeting-time-finder", "entity-extractor"],
    project: "summonpot",
    reason:
      "Interested in application-owned operations and bounded agent choices?",
  },
  "cron-explainer": {
    title: "Cron expression explainer — run times & week previews",
    description:
      "Explain five-field cron expressions and preview the next five runs or a selected week across timezones, with dates and UTC offsets. Private browser-local calculation; no AI.",
    steps: [
      "Paste a five-field cron expression or load the weekday example.",
      "Choose the timezone used by your scheduler and the timezone where you want to see its runs.",
      "Read the explanation and run times, or choose a week to inspect clock changes. Copy or download the preview; nothing is scheduled.",
    ],
    example:
      "0 9 * * MON-FRI means weekdays at 09:00 in the schedule timezone. Display those same instants in another timezone to see the difference.",
    related: ["meeting-time-finder", "fix-excel-dates"],
    project: "intpot",
    reason: "Building your own reusable Python tools?",
  },
  "ask-a-webpage": {
    title: "Ask a page or text — source-backed answers",
    description:
      "Ask questions about a webpage or pasted text. Read a source-assembled answer with supporting details, steps, conditions and inspectable citations.",
    steps: [
      "Paste text or enter a public HTTP/HTTPS page URL, then ask your question.",
      "Request an answer assembled from the source. Use pasted text when a page is blocked or unsupported.",
      "Read the answer and supporting details, inspect citations and copy or download the answer.",
    ],
    example:
      "Ask “Does this text say whether inputs are stored?” about a privacy passage. An unrelated passage should be marked not answered, not treated as proof.",
    related: ["entity-extractor", "text-to-mermaid"],
    project: "summonpot",
    reason: "Exploring contract-first APIs with bounded agent choices?",
  },
};
