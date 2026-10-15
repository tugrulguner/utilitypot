import Papa from "papaparse";
import { parseCsv, templatePaths, transformCsv } from "../lib/utilities/csv.js";
import { normalizeDates } from "../lib/utilities/dates.js";
import { findSlots, calendarEvent } from "../lib/utilities/meeting.js";
const root = document.querySelector("[data-utility]");
if (root) {
  const tool = root.getAttribute("data-utility"),
    $ = (id) => root.querySelector(`#${id}`);
  let revision = 0,
    fields = [],
    rows = [],
    output = "",
    filename = "",
    mime = "text/plain",
    slots = [];
  const analyticsTool = {
    csv: "csv_to_nested_json",
    dates: "fix_excel_dates",
    meeting: "meeting_time_finder",
  }[tool];
  const capture = (event, properties = {}) => {
    try {
      globalThis.posthog?.capture(event, properties, { send_instantly: true });
    } catch {
      /* Analytics must never block the utility. */
    }
  };
  const attemptId = () =>
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const begin = (action) => {
    const id = attemptId();
    capture("utility_action_started", {
      tool: analyticsTool,
      action,
      attempt_id: id,
    });
    return { id, action };
  };
  const complete = (attempt, outcome) =>
    capture("utility_action_completed", {
      tool: analyticsTool,
      action: attempt.action,
      attempt_id: attempt.id,
      outcome,
    });
  const status = (text, error = false) => {
    $("utility-status").textContent = text;
    $("utility-status").classList.toggle("error", error);
  };
  const invalidate = () => {
    revision++;
    output = "";
    slots = [];
    $("results").hidden = true;
    const reviewed = $("reviewed");
    if (reviewed) reviewed.checked = false;
  };
  root.addEventListener("input", (e) => {
    if (e.target.id === "reviewed" || e.target.id === "ai-consent") return;
    invalidate();
    if (["csv-input", "json-example", "csv-intent"].includes(e.target.id)) {
      $("mapping-panel").hidden = true;
      fields = [];
    }
  });
  function download(text, name, type, action = "download_result") {
    capture("utility_output_download_requested", {
      tool: analyticsTool,
      action,
    });
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function show(text, name, type = "text/plain") {
    output = text;
    filename = name;
    mime = type;
    $("results").hidden = false;
    const pre = document.createElement("pre");
    pre.textContent =
      text.length > 50000
        ? text.slice(0, 50000) +
          "\n… preview truncated; download contains the full result."
        : text;
    $("result-view").replaceChildren(pre);
  }
  function buildMapping(plan) {
    rows = parseCsv($("csv-input").value);
    const paths = templatePaths(JSON.parse($("json-example").value));
    const headers = Object.keys(rows[0]);
    fields = paths.map((path) => ({
      path,
      column:
        plan?.fields?.find((f) => f.path === path)?.column ||
        headers.find((h) => h === path) ||
        "",
    }));
    const group = $("group-by");
    group.replaceChildren(
      new Option("No grouping", ""),
      ...headers.map((h) => new Option(h, h)),
    );
    group.value = plan?.groupBy || "";
    const container = $("mapping-fields");
    container.replaceChildren();
    fields.forEach((f, i) => {
      const row = document.createElement("div");
      row.className = "mapping";
      const label = document.createElement("label");
      label.htmlFor = `map-${i}`;
      label.textContent = f.path;
      const select = document.createElement("select");
      select.id = `map-${i}`;
      select.setAttribute("aria-label", `Source column for ${f.path}`);
      select.append(
        new Option("Choose source column", ""),
        ...headers.map((h) => new Option(h, h)),
      );
      select.value = f.column;
      select.addEventListener("change", () => {
        f.column = select.value;
      });
      row.append(label, select);
      container.append(row);
    });
    $("mapping-panel").hidden = false;
    $("reviewed").checked = false;
  }
  function participants() {
    return [...root.querySelectorAll(".participant")].map((p) =>
      Object.fromEntries(
        [...p.querySelectorAll("[data-field]")].map((e) => [
          e.dataset.field,
          e.value,
        ]),
      ),
    );
  }
  function setPeople(people) {
    [...root.querySelectorAll(".participant")].forEach((p, i) => {
      for (const e of p.querySelectorAll("[data-field]"))
        if (people[i] && Object.hasOwn(people[i], e.dataset.field))
          e.value = people[i][e.dataset.field];
    });
  }
  $("load-example").addEventListener("click", () => {
    invalidate();
    if (tool === "csv") {
      $("csv-input").value =
        "Customer,Name,SKU,Qty\n001,Ada,A01,2\n001,Ada,A02,3\n002,Lin,B01,1";
      $("json-example").value = JSON.stringify(
        { id: "001", name: "Ada", items: [{ sku: "A01", quantity: "2" }] },
        null,
        2,
      );
      $("csv-intent").value =
        "One customer per Customer ID. Collect each row as an item. Name identifies the customer, SKU the item, Qty the quantity.";
      buildMapping({
        groupBy: "Customer",
        fields: [
          { path: "id", column: "Customer" },
          { path: "name", column: "Name" },
          { path: "items[].sku", column: "SKU" },
          { path: "items[].quantity", column: "Qty" },
        ],
      });
    }
    if (tool === "dates") {
      $("dates-input").value =
        "25/03/2026\n03/04/2026\n2026-02\n2025-02-29\nMarch 15, 2026";
      $("date-context").value =
        "This export is from a UK office and uses day-first numeric dates.";
      $("date-convention").value = "auto";
    }
    if (tool === "meeting") {
      $("meeting-date").value = "2026-06-15";
      $("duration").value = "30";
      while (root.querySelectorAll(".participant").length > 2)
        root.querySelector(".participant:last-child").remove();
      setPeople([
        {
          name: "London",
          zone: "Europe/London",
          text: "Available from 9am until noon.",
          start: "09:00",
          end: "12:00",
          excludeStart: "",
          excludeEnd: "",
        },
        {
          name: "India",
          zone: "Asia/Kolkata",
          text: "Available from 2pm until 4pm.",
          start: "14:00",
          end: "16:00",
          excludeStart: "",
          excludeEnd: "",
        },
      ]);
    }
    status(
      "Example loaded. Review the settings before running; AI has not been called.",
    );
  });
  $("prepare")?.addEventListener("click", () => {
    try {
      invalidate();
      buildMapping();
      status(
        "Choose a source column for every output path and review grouping.",
      );
    } catch (e) {
      status(e.message, true);
    }
  });
  $("add-person")?.addEventListener("click", () => {
    const n = root.querySelectorAll(".participant").length;
    if (n >= 4) {
      status("At most four participants are supported.", true);
      return;
    }
    invalidate();
    const p = root.querySelector(".participant").cloneNode(true);
    p.dataset.index = String(n);
    p.querySelector("h2").textContent = `Participant ${n + 1}`;
    for (const e of p.querySelectorAll("[data-field]")) {
      e.id = `p${n}-${e.dataset.field}`;
      if (
        ["name", "text", "excludeStart", "excludeEnd"].includes(e.dataset.field)
      )
        e.value = "";
    }
    for (const l of p.querySelectorAll("label")) {
      l.htmlFor = l.htmlFor.replace(/^p\d+/, `p${n}`);
      l.textContent = l.textContent.replace(/\d/, String(n + 1));
    }
    $("participants").append(p);
  });
  $("remove-person")?.addEventListener("click", () => {
    if (root.querySelectorAll(".participant").length > 1) {
      invalidate();
      root.querySelector(".participant:last-child").remove();
    }
  });
  $("ask-jev").addEventListener("click", async () => {
    if (!$("ai-consent").checked) {
      status("Please confirm consent before sending context to Jev.", true);
      return;
    }
    const button = $("ask-jev");
    const attempt = begin("ai_interpretation");
    let outcome = "unexpected_failure",
      responseStatus = 0;
    let input;
    try {
      if (tool === "csv") {
        const r = parseCsv($("csv-input").value);
        input = {
          csv: Papa.unparse(r.slice(0, 5)),
          example: $("json-example").value,
          instructions: $("csv-intent").value,
        };
      }
      if (tool === "dates")
        input = {
          sample: $("dates-input").value.split(/\r?\n/).slice(0, 20).join("\n"),
          context: $("date-context").value,
        };
      if (tool === "meeting")
        input = {
          date: $("meeting-date").value,
          duration: Number($("duration").value),
          participants: participants().map(({ name, zone, text }) => ({
            name,
            zone,
            text,
          })),
        };
      invalidate();
      const token = revision;
      button.disabled = true;
      status("Asking Jev for a proposed interpretation…");
      const r = await fetch("/api/utilities/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, input }),
        signal: AbortSignal.timeout(20000),
      });
      responseStatus = r.status;
      const data = await r.json();
      if (token !== revision) {
        outcome = "cancelled";
        return;
      }
      if (!r.ok)
        throw new Error(
          data.error || "AI is unavailable. Use manual controls.",
        );
      if (data.source !== "jev" || !data.plan)
        throw new Error("The AI response could not be verified.");
      if (tool === "csv") buildMapping(data.plan);
      if (tool === "dates") {
        $("date-convention").value = data.plan.convention;
      }
      if (tool === "meeting") {
        setPeople(data.plan.participants);
        if (data.plan.participants.some((p) => p.scope !== "supported")) {
          status(
            "Jev flagged unsupported or ambiguous availability. Correct the editable windows manually before reviewing.",
            true,
          );
          outcome = "rejected";
          return;
        }
      }
      const weak = Object.values(data.confidence || {}).some(
        (v) => typeof v !== "number" || v < 0.6,
      );
      status(
        `Jev proposed settings${weak ? " with uncertain selections" : ""}. Review every setting before running. Model: ${data.model}.`,
        weak,
      );
      outcome = "success";
    } catch (e) {
      outcome =
        e.name === "TimeoutError" ||
        (responseStatus >= 400 && responseStatus < 500)
          ? "rejected"
          : "unexpected_failure";
      status(
        e.name === "TimeoutError"
          ? "AI timed out. Manual controls still work."
          : e.message,
        true,
      );
    } finally {
      complete(attempt, outcome);
      button.disabled = false;
    }
  });
  $("run").addEventListener("click", () => {
    const attempt = begin("manual_run");
    let outcome = "rejected";
    try {
      if (tool === "csv") {
        if (!$("reviewed").checked) {
          outcome = "rejected";
          throw new Error("Review and confirm the mapping first.");
        }
        rows = parseCsv($("csv-input").value);
        const result = transformCsv(rows, {
          groupBy: $("group-by").value,
          fields,
        });
        outcome = "unexpected_failure";
        show(
          JSON.stringify(result, null, 2),
          "modepot-data.json",
          "application/json",
        );
        status(
          `Converted ${rows.length} source rows to ${result.length} parent records locally. Values were preserved as strings.`,
        );
      }
      if (tool === "dates") {
        const result = normalizeDates(
          $("dates-input").value,
          $("date-convention").value,
        );
        outcome = "unexpected_failure";
        show(
          Papa.unparse(result, { escapeFormulae: true }),
          "modepot-dates.csv",
          "text/csv",
        );
        const table = document.createElement("table");
        const head = document.createElement("thead");
        const tr = document.createElement("tr");
        for (const name of ["Original", "Normalized", "Status", "Note"]) {
          const th = document.createElement("th");
          th.textContent = name;
          tr.append(th);
        }
        head.append(tr);
        table.append(head);
        const body = document.createElement("tbody");
        for (const r of result.slice(0, 100)) {
          const tr = document.createElement("tr");
          for (const k of ["original", "normalized", "status", "note"]) {
            const td = document.createElement("td");
            td.textContent = r[k];
            tr.append(td);
          }
          body.append(tr);
        }
        table.append(body);
        const wrapper = document.createElement("div");
        wrapper.className = "table-scroll";
        wrapper.append(table);
        $("result-view").replaceChildren(wrapper);
        status(
          `Processed ${result.length} rows locally. ${result.filter((r) => r.status === "review").length} need review; ${result.filter((r) => r.status === "invalid").length} are invalid. Preview shows at most 100 rows; download includes every row.`,
        );
      }
      if (tool === "meeting") {
        if (!$("reviewed").checked) {
          outcome = "rejected";
          throw new Error("Review and confirm all participant windows first.");
        }
        const duration = Number($("duration").value);
        slots = findSlots($("meeting-date").value, duration, participants());
        const lines = slots.map(
          (s, i) =>
            `${i + 1}. ${s.start} — ${s.end}\n${s.local.map((p) => `${p.name || "Participant"}: ${p.start} → ${p.end}`).join("\n")}`,
        );
        outcome = "unexpected_failure";
        show(
          lines.join("\n\n") ||
            "No overlapping time satisfies these windows. Change the constraints explicitly to try alternatives.",
          "modepot-meeting-options.txt",
        );
        status(
          `Found ${slots.length} feasible slots. Times are computed locally, not by AI.`,
        );
        if (slots.length) {
          const label = document.createElement("label");
          label.htmlFor = "slot-choice";
          label.textContent = "Choose a slot for calendar download";
          const select = document.createElement("select");
          select.id = "slot-choice";
          slots.forEach((s, i) =>
            select.append(new Option(`${i + 1}. ${s.start}`, String(i))),
          );
          const b = document.createElement("button");
          b.textContent = "Download calendar event";
          b.addEventListener("click", () =>
            download(
              calendarEvent(slots[Number(select.value)], duration),
              "modepot-meeting.ics",
              "text/calendar",
              "calendar_download",
            ),
          );
          $("result-view").append(label, select, b);
        }
      }
      outcome = "success";
    } catch (e) {
      output = "";
      $("results").hidden = true;
      status(e.message, true);
    } finally {
      complete(attempt, outcome);
    }
  });
  $("download").addEventListener("click", () => {
    if (output) {
      download(output, filename, mime);
    }
  });
  $("copy").addEventListener("click", async () => {
    try {
      if (output) {
        await navigator.clipboard.writeText(output);
        capture("utility_output_copy_succeeded", {
          tool: analyticsTool,
          action: "copy_result",
        });
        status("Result copied.");
      }
    } catch {
      status("Clipboard is unavailable. Use Download result instead.", true);
    }
  });
}
