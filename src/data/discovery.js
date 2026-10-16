// Claims and canonical project roots are supported by the publicReader samples
// in docs/public-usability-final-evidence.json (runtime cf82c14). These are
// sibling projects, not claims about UtilityPot's implementation dependencies.
export const projects = {
  refpot: {
    name: "RefPot",
    href: "https://refpot.modepot.io/",
    description:
      "An experimental embedded database for Python, with CRUD and explicit transactions. Qualification remains limited.",
  },
  intpot: {
    name: "Intpot",
    href: "https://intpot.modepot.io/",
    description: "Define typed Python tools for CLI, HTTP and MCP interfaces.",
  },
  summonpot: {
    name: "Summonpot",
    href: "https://summonpot.modepot.io/",
    description:
      "Contract-first Python APIs with bounded agent decisions and application-owned operations.",
  },
};
export const guides = {
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
    title: "JSON to CSV converter — flatten records locally",
    description:
      "Convert JSON records to CSV in your browser. Select an array, flatten nested objects and review array handling before spreadsheet export.",
    steps: [
      "Paste JSON or load the orders example. Select the record array to export.",
      "Choose how to handle other arrays: reject, omit or keep as JSON text in one cell.",
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
    title: "Entity extractor — people, companies and custom types",
    description:
      "Find people, companies or custom categories in short text. Review exact source spans, correct mentions manually and export JSON. Bounded AI extraction.",
    steps: [
      "Paste short text and choose people, companies or a custom category.",
      "Find matches, then investigate each category, exact source occurrence and label.",
      "Validate the reviewed mentions, then copy or download JSON with source offsets.",
    ],
    example:
      "In “Ada joined Acme Labs”, Ada can be a Person and Acme Labs an Organization. Repeated names need separate occurrence review; extraction is not exhaustive.",
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
  "ask-a-webpage": {
    title: "Ask a webpage — find exact supporting passages",
    description:
      "Ask a question about pasted text or a public webpage. Review exact source passages and answer-presence labels; no generated essays or fact verification.",
    steps: [
      "Paste source text or enter a public HTTP/HTTPS page URL, then ask a focused question.",
      "Read the disclosure and request evidence. Use pasted text when a page is blocked or unsupported.",
      "Review answer presence, exact passages and source coverage before downloading the evidence.",
    ],
    example:
      "Ask “Does this text say whether inputs are stored?” about a privacy passage. An unrelated passage should be marked not answered, not treated as proof.",
    related: ["entity-extractor", "text-to-mermaid"],
    project: "summonpot",
    reason: "Exploring contract-first APIs with bounded agent choices?",
  },
};
