import { resultDiscovery } from "../lib/discovery.js";
import { exampleReplacementGuard } from "../lib/utilities/example-replacement.js";
import { groupCsv } from "../lib/utilities/outcome.js";
import Papa from "papaparse";
import { parseCsv, templatePaths, transformCsv } from "../lib/utilities/csv.js";
import { normalizeDates } from "../lib/utilities/dates.js";
import { findSlots, calendarEvent } from "../lib/utilities/meeting.js";
import {
  resolveMeetingZone,
  presentMeetingSlot,
  compactMeetingSlot,
} from "../lib/utilities/meeting-presentation.js";
const root = document.querySelector("[data-utility]");
if (root) {
  const discovery = resultDiscovery(
    root.querySelector("[data-result-discovery]"),
  );
  const allowExampleReplacement = exampleReplacementGuard(root);
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
    const discoveryRevision = discovery.reset();
    const id = attemptId();
    capture("utility_action_started", {
      tool: analyticsTool,
      action,
      attempt_id: id,
    });
    return { id, action, discoveryRevision };
  };
  const complete = (attempt, outcome) => {
    capture("utility_action_completed", {
      tool: analyticsTool,
      action: attempt.action,
      attempt_id: attempt.id,
      outcome,
    });
    discovery.complete(
      outcome,
      !$("results").hidden,
      attempt.discoveryRevision,
    );
  };
  const status = (text, error = false) => {
    $("utility-status").textContent = text;
    $("utility-status").classList.toggle("error", error);
  };
  const invalidate = () => {
    discovery.reset();
    revision++;
    output = "";
    slots = [];
    $("results").hidden = true;
  };
  root.addEventListener("input", (e) => {
    if (e.target.id === "slot-choice") return;
    if (e.target.dataset.field === "zone") {
      e.target.setCustomValidity("");
      e.target.removeAttribute("aria-invalid");
    }
    invalidate();
    if (["csv-input", "json-example", "csv-intent"].includes(e.target.id)) {
      $("mapping-panel").hidden = true;
      fields = [];
      if (e.target.id === "csv-input") syncCsv();
    }
  });
  function syncCsv() {
    try {
      const headers = Object.keys(parseCsv($("csv-input").value)[0]);
      const selected = $("group-by").value;
      $("group-by").replaceChildren(...headers.map((h) => new Option(h, h)));
      if (headers.includes(selected)) $("group-by").value = selected;
      $("parent-fields").replaceChildren(
        ...headers.map((h) => {
          const l = document.createElement("label");
          l.className = "check";
          const c = document.createElement("input");
          c.type = "checkbox";
          c.dataset.parent = "";
          c.value = h;
          l.append(c, `Keep ${h} on parent (must agree in each group)`);
          return l;
        }),
      );
    } catch (e) {
      $("group-by").replaceChildren(
        new Option("Paste valid CSV to choose a field", ""),
      );
      status(e.message, true);
    }
  }
  function syncAvailability() {
    const ai = $("availability-mode").value === "jev";
    root
      .querySelectorAll("[data-availability]")
      .forEach((e) => (e.hidden = (e.dataset.availability === "jev") !== ai));
    $("meeting-consent").hidden = !ai;
    $("run").textContent = ai ? "Find times with Jev" : "Find times";
  }
  $("availability-mode")?.addEventListener("change", syncAvailability);
  $("source-file")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    invalidate();
    const token = revision;
    if (file.size > 2000000) {
      status("CSV exceeds 2 MB.", true);
      return;
    }
    const text = await file.text();
    if (token !== revision) return;
    $("csv-input").value = text;
    invalidate();
    syncCsv();
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
      column: plan
        ? plan.fields?.find((f) => f.path === path)?.column || ""
        : headers.find((h) => h === path) || "",
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
  }
  $("city-search")?.addEventListener("input", (event) => {
    const query = event.target.value.trim().toLocaleLowerCase("en");
    for (const item of $("city-matches").children)
      item.hidden = !item.textContent.toLocaleLowerCase("en").includes(query);
  });
  function participants() {
    return [...root.querySelectorAll(".participant")].map((p, index) => {
      const person = Object.fromEntries(
        [...p.querySelectorAll("[data-field]")].map((e) => [
          e.dataset.field,
          e.value,
        ]),
      );
      const field = p.querySelector('[data-field="zone"]');
      try {
        const resolved = resolveMeetingZone(person.zone);
        person.zone = resolved.zone;
        person.cityLabel = resolved.label;
        field.setCustomValidity("");
        field.removeAttribute("aria-invalid");
      } catch (e) {
        field.setCustomValidity(e.message);
        field.setAttribute("aria-invalid", "true");
        field.reportValidity();
        throw new Error(`Participant ${index + 1}: ${e.message}`);
      }
      return person;
    });
  }
  function setPeople(people, preserveIdentity = false) {
    [...root.querySelectorAll(".participant")].forEach((p, i) => {
      for (const e of p.querySelectorAll("[data-field]"))
        if (
          people[i] &&
          Object.hasOwn(people[i], e.dataset.field) &&
          !(preserveIdentity && ["zone", "name"].includes(e.dataset.field))
        )
          e.value = people[i][e.dataset.field];
    });
  }
  $("load-example").addEventListener("click", () => {
    if (!allowExampleReplacement()) return;
    invalidate();
    if ($("source-file")) $("source-file").value = "";
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
      const today = new Date();
      $("meeting-date").value =
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      $("availability-mode").value = "local";
      syncAvailability();
      while (root.querySelectorAll(".participant").length < 2)
        $("add-person").click();
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
    if (tool === "csv") {
      $("custom-schema").checked = false;
      $("child-name").value = "rows";
      syncCsv();
      $("mapping-panel").hidden = true;
    }
    status(
      "Example loaded. Review the settings before running; AI has not been called.",
    );
  });
  $("prepare")?.addEventListener("click", () => {
    try {
      invalidate();
      $("custom-schema").checked = true;
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
    p.querySelectorAll("details").forEach((detail) => (detail.open = false));
    p.querySelector("h2").textContent = `Participant ${n + 1}`;
    for (const e of p.querySelectorAll("[data-field]")) {
      e.id = `p${n}-${e.dataset.field}`;
      if (
        [
          "name",
          "zone",
          "text",
          "start",
          "end",
          "excludeStart",
          "excludeEnd",
        ].includes(e.dataset.field)
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
  function requiredFields() {
    let field, message;
    if (tool === "csv" && !$("csv-input").value.trim()) {
      field = $("csv-input");
      message = "Paste CSV data with a header row and at least one data row.";
    }
    if (tool === "meeting") {
      if (!$("meeting-date").value) {
        field = $("meeting-date");
        message = "Choose a meeting date.";
      } else {
        const empty = [
          ...root.querySelectorAll('.participant [data-field="zone"]'),
        ].findIndex((e) => !e.value.trim());
        if (empty >= 0) {
          field = $(`p${empty}-zone`);
          message = `Enter a city or timezone for participant ${empty + 1}. Search Supported cities below.`;
        }
      }
    }
    if (!field) return true;
    invalidate();
    status(message, true);
    field.focus();
    return false;
  }
  async function askJev() {
    if (!requiredFields()) return;
    const button = $("ask-jev") || $("run");
    let outcome = "unexpected_failure",
      responseStatus = 0;
    let input;
    invalidate();
    const attempt = begin("ai_interpretation");
    const token = revision;
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
      if (tool === "csv") {
        $("custom-schema").checked = true;
        buildMapping(data.plan);
      }
      if (tool === "dates") {
        $("date-convention").value = data.plan.convention;
      }
      if (tool === "meeting") {
        setPeople(data.plan.participants, true);
        $("availability-mode").value = "local";
        syncAvailability();
        if (data.plan.participants.some((p) => p.scope !== "supported")) {
          status(
            "Jev flagged unsupported or ambiguous availability. Correct the editable windows manually before reviewing.",
            true,
          );
          outcome = "rejected";
          return;
        }
      }
      if (!runLocal(false)) {
        outcome = "rejected";
        return;
      }
      const weak = Object.values(data.confidence || {}).some(
        (v) => typeof v !== "number" || v < 0.6,
      );
      status(
        `Jev proposed settings${weak ? " with uncertain selections" : ""}. Review the editable preview. Model: ${data.model}.`,
        weak,
      );
      outcome = "success";
    } catch (e) {
      if (token !== revision) {
        outcome = "cancelled";
        return;
      }
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
  }
  $("ask-jev")?.addEventListener("click", askJev);
  $("run").addEventListener("click", () => {
    if (tool === "meeting" && $("availability-mode").value === "jev")
      return askJev();
    runLocal();
  });
  function runLocal(emit = true) {
    if (!requiredFields()) return false;
    const attempt = emit ? begin("manual_run") : null;
    let outcome = "rejected";
    try {
      if (tool === "csv") {
        rows = parseCsv($("csv-input").value);
        const result = $("custom-schema").checked
          ? transformCsv(rows, { groupBy: $("group-by").value, fields })
          : groupCsv(
              $("csv-input").value,
              $("group-by").value,
              [...root.querySelectorAll("[data-parent]:checked")].map(
                (e) => e.value,
              ),
              $("child-name").value,
            );
        outcome = "unexpected_failure";
        show(
          JSON.stringify(result, null, 2),
          "modepot-data.json",
          "application/json",
        );
        const tree = document.createElement("div");
        for (const parent of result.slice(0, 100)) {
          const item = document.createElement("details");
          const title = document.createElement("summary");
          const childCount = Object.values(parent)
            .filter(Array.isArray)
            .reduce((sum, list) => sum + list.length, 0);
          item.open = tree.childElementCount === 0 && childCount <= 5;
          title.textContent =
            "Group · " +
            (Object.entries(parent)
              .filter(([, v]) => !Array.isArray(v))
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ") || "Parent record") +
            ` · ${childCount} items`;
          item.append(title);
          for (const [key, value] of Object.entries(parent)) {
            if (Array.isArray(value)) {
              const caption = document.createElement("p");
              caption.textContent = `${key}: ${value.length} items`;
              item.append(caption);
              const table = document.createElement("table");
              const headers = [...new Set(value.flatMap(Object.keys))];
              const head = document.createElement("tr");
              for (const k of headers) {
                const th = document.createElement("th");
                th.textContent = k;
                head.append(th);
              }
              table.append(head);
              for (const row of value.slice(0, 100)) {
                const tr = document.createElement("tr");
                for (const k of headers) {
                  const td = document.createElement("td");
                  td.textContent =
                    typeof row[k] === "object"
                      ? JSON.stringify(row[k])
                      : (row[k] ?? "");
                  tr.append(td);
                }
                table.append(tr);
              }
              const wrap = document.createElement("div");
              wrap.className = "table-scroll";
              wrap.append(table);
              item.append(wrap);
            }
          }
          tree.append(item);
        }
        const code = document.createElement("details");
        const label = document.createElement("summary");
        label.textContent = "JSON code view";
        code.append(label, ...$("result-view").childNodes);
        $("result-view").replaceChildren(tree, code);
        status(
          `Converted ${rows.length} source rows to ${result.length} parent records locally. Values were preserved as strings. Preview shows up to 100 parents and children per group; download includes all rows.`,
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
        $("convention-panel").hidden =
          !result.some((row) => row.status === "review") &&
          $("date-convention").value === "auto";
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
        const cards = document.createElement("div");
        cards.className = "date-records";
        const labels = {
          original: "Original",
          normalized: "Normalized",
          status: "Status",
          note: "Note",
        };
        for (const row of result.slice(0, 100)) {
          const card = document.createElement("dl");
          card.className = "date-record";
          for (const [key, label] of Object.entries(labels)) {
            const term = document.createElement("dt"),
              value = document.createElement("dd");
            term.textContent = label;
            value.textContent = row[key] || "—";
            card.append(term, value);
          }
          cards.append(card);
        }
        const wrapper = document.createElement("div");
        wrapper.className = "table-scroll";
        wrapper.append(table);
        $("result-view").replaceChildren(wrapper, cards);
        status(
          `Processed ${result.length} rows locally. ${result.filter((r) => r.status === "review").length} need review; ${result.filter((r) => r.status === "invalid").length} are invalid. Preview shows at most 100 rows; download includes every row.`,
        );
      }
      if (tool === "meeting") {
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
          const technical = document.createElement("details");
          const summary = document.createElement("summary");
          summary.textContent = "Technical times and all options";
          technical.append(summary, ...$("result-view").childNodes);
          const label = document.createElement("label");
          label.htmlFor = "slot-choice";
          label.textContent = `Choose a meeting time · ${$("meeting-date").value} · local times (24-hour)`;
          const select = document.createElement("select");
          select.id = "slot-choice";
          const choices = slots.map((s) =>
            compactMeetingSlot(s, $("meeting-date").value),
          );
          slots.forEach((s, i) => {
            // Repeated DST wall times must remain distinguishable choices.
            const duplicate =
              choices.indexOf(choices[i]) !== choices.lastIndexOf(choices[i]);
            const utc = duplicate
              ? new Intl.DateTimeFormat(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h23",
                  timeZone: "UTC",
                }).format(new Date(s.start)) + " UTC · "
              : "";
            select.append(
              new Option(`${i + 1}. ${utc}${choices[i]}`, String(i)),
            );
          });
          const comparison = document.createElement("section");
          comparison.className = "meeting-comparison";
          comparison.setAttribute("aria-live", "polite");
          comparison.setAttribute("aria-label", "Selected meeting time");
          const renderChoice = () => {
            const title = document.createElement("h3");
            title.textContent = `Selected meeting time · ${duration} minutes`;
            const list = document.createElement("ul");
            for (const person of presentMeetingSlot(
              slots[Number(select.value)],
            )) {
              const row = document.createElement("li"),
                who = document.createElement("strong"),
                time = document.createElement("span");
              who.textContent =
                person.label === person.city
                  ? person.city
                  : `${person.label} · ${person.city}`;
              time.textContent = `${person.start} – ${person.end}`;
              row.append(who, time);
              list.append(row);
            }
            comparison.replaceChildren(title, list);
          };
          select.addEventListener("change", renderChoice);
          renderChoice();
          const b = document.createElement("button");
          b.textContent = "Add to calendar";
          b.addEventListener("click", () =>
            download(
              calendarEvent(slots[Number(select.value)], duration),
              "modepot-meeting.ics",
              "text/calendar",
              "calendar_download",
            ),
          );
          $("result-view").replaceChildren(
            label,
            select,
            comparison,
            b,
            technical,
          );
        }
      }
      outcome = "success";
      return true;
    } catch (e) {
      output = "";
      $("results").hidden = true;
      status(e.message, true);
      return false;
    } finally {
      if (attempt) complete(attempt, outcome);
    }
  }
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
  // Preserve text entered or restored before the module attached its listeners.
  if (tool === "csv" && $("csv-input").value.trim()) syncCsv();
  window.dispatchEvent(new Event("utilitypot:ready"));
}
