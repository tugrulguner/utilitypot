import "../styles/entity-results.css";
import "../styles/page-evidence.css";
import { resultDiscovery } from "../lib/discovery.js";
import {
  failureCategory,
  failureError,
  failureOutcome,
  failureProperties,
  requestUtility,
} from "../lib/utilities/analytics-failure.js";
import {
  interpretationReview,
  appendInterpretationDetails,
} from "../lib/utilities/interpretation-feedback.js";
import { exampleReplacementGuard } from "../lib/utilities/example-replacement.js";
import Papa from "papaparse";
import { recordChoices, sourceMention } from "../lib/utilities/outcome.js";
import {
  jsonToCsv,
  validateJsonNumberPrecision,
} from "../lib/utilities/json-csv.js";
import { mermaidSource, graphRoleIssues } from "../lib/utilities/diagram.js";
import { entityTypes } from "../lib/utilities/entities.js";
import { extractEntityDocument } from "../lib/utilities/entity-document.js";
import { answerSourceDocument } from "../lib/utilities/source-answer.js";
import {
  createSourceAnswerView,
  sourceAnswerMarkdown,
} from "../lib/utilities/source-answer-view.js";
import "../styles/source-answer.css";
const root = document.querySelector("[data-extra-utility]");
if (root) {
  const discovery = resultDiscovery(
    root.querySelector("[data-result-discovery]"),
  );
  let evidenceAnswered = false;
  const allowExampleReplacement = exampleReplacementGuard(root);
  const tool = root.getAttribute("data-extra-utility"),
    $ = (id) => root.querySelector(`#${id}`);
  let manualArrayPolicy = null;
  let reviewPlan = "";
  let documentController = null;
  let entityProcessing = null;
  let revision = 0,
    output = "",
    filename = "",
    mime = "text/plain";
  const analyticsTool = {
    jsonCsv: "json_to_csv",
    entities: "entity_extractor",
    diagram: "text_to_mermaid",
    qa: "ask_a_webpage",
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
    const discoveryRevision =
      action === "read_page" ? undefined : discovery.reset();
    const id = attemptId();
    capture("utility_action_started", {
      tool: analyticsTool,
      action,
      attempt_id: id,
    });
    return { id, action, discoveryRevision };
  };
  const complete = (attempt, outcome, category) => {
    capture("utility_action_completed", {
      tool: analyticsTool,
      action: attempt.action,
      attempt_id: attempt.id,
      outcome,
      ...failureProperties(outcome, category),
    });
    if (attempt.action === "read_page") return;
    discovery.complete(
      outcome,
      !$("extra-results").hidden && (tool !== "qa" || evidenceAnswered),
      attempt.discoveryRevision,
    );
  };
  const status = (s, error = false) => {
    $("extra-status").hidden = false;
    $("extra-status").textContent = s;
    $("extra-status").classList.toggle("error", error);
    if (tool === "qa" && $("extra-report-problem")) {
      $("extra-report-problem").hidden = !error;
      if (error)
        $("extra-report-problem").scrollIntoView({
          block: "center",
          behavior: "instant",
        });
    }
  };
  function clear() {
    discovery.reset();
    revision++;
    documentController?.abort();
    documentController = null;
    output = "";
    $("extra-status").hidden = false;
    $("extra-results").hidden = true;
    if (["entities", "qa"].includes(tool)) {
      $("extra-visual").replaceChildren();
      $("extra-output").textContent = "";
    }
  }
  function forgetInterpretation() {
    reviewPlan = "";
    entityProcessing = null;
    for (const id of ["entity-review", "graph-panel"])
      if ($(id)) $(id).hidden = true;
    for (const id of ["entity-editor", "graph-editor"])
      $(id)?.replaceChildren();
  }
  root.addEventListener("input", (e) => {
    clear();
    if (!e.target.closest("#entity-review, #graph-panel"))
      forgetInterpretation();
    if (tool === "jsonCsv") {
      if (e.target.id === "array-policy") manualArrayPolicy = e.target.value;
      // Keep an explicit policy while its visible control remains selected.
      // Editing or uploading source must not silently return authority to AI.
    }
    if (e.target.id === "source-text" && tool === "jsonCsv") {
      $("row-path").replaceChildren();
      $("array-options").hidden = true;
      if (e.target.value.trim()) {
        try {
          paths();
          status(
            "Each selected item becomes one spreadsheet row. Review the sample and nested-array handling, then convert.",
          );
        } catch {
          /* Incomplete JSON is reported when the user converts. */
        }
      }
    }
    if (
      tool === "qa" &&
      ["source-text", "page-url", "source-mode"].includes(e.target.id)
    ) {
      fetchedUrl = "";
      fetchedMetadata = null;
      $("source-coverage").textContent = "";
      $("source-inspection").hidden = true;
    }
  });
  let fetchedUrl = "";
  let fetchedMetadata = null;
  function definitions() {
    if (tool !== "entities") return $("instructions").value;
    return [
      $("people-category").checked ? "Person: a named human" : "",
      $("companies-category").checked
        ? "Organization: a named company or employer"
        : "",
      $("custom-category").checked ? $("instructions").value : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  function syncModes() {
    if (tool === "entities")
      $("custom-definitions").hidden = !$("custom-category").checked;
    if (tool === "diagram") {
      $("create-diagram").textContent = "Create flowchart";
    }
    if (tool === "qa") {
      const url = $("source-mode").value === "url";
      $("url-panel").hidden = !url;
      $("source-panel").hidden = url;
      root.querySelectorAll("[data-source-mode]").forEach((tab) => {
        const selected = tab.dataset.sourceMode === $("source-mode").value;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
    }
  }
  for (const id of ["custom-category", "source-mode"])
    $(id)?.addEventListener("change", syncModes);
  const sourceTabs = [...root.querySelectorAll("[data-source-mode]")];
  sourceTabs.forEach((tab, i) => {
    tab.addEventListener("click", () => {
      $("source-mode").value = tab.dataset.sourceMode;
      $("source-mode").dispatchEvent(new Event("input", { bubbles: true }));
      syncModes();
    });
    tab.addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? sourceTabs.length - 1
              : (i + 1) % sourceTabs.length;
        sourceTabs[next].click();
        sourceTabs[next].focus();
      }
    });
  });
  $("source-file")?.addEventListener("change", async (e) => {
    clear();
    const token = revision,
      file = e.target.files[0];
    if (!file) return;
    if (file.size > 2000000) {
      status("JSON exceeds 2 MB.", true);
      return;
    }
    const text = await file.text();
    if (token !== revision) return;
    $("source-text").value = text;
    $("row-path").replaceChildren();
    $("array-options").hidden = true;
  });
  function control(label, value, options, change) {
    const wrap = document.createElement("label");
    wrap.append(document.createTextNode(label));
    const input = document.createElement(options ? "select" : "input");
    if (options)
      for (const [value, text] of options)
        input.append(new Option(text, value));
    input.value = value;
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => change(input.value));
    wrap.append(input);
    return wrap;
  }
  function editEntities() {
    const items = JSON.parse(reviewPlan || "[]");
    const types = entityTypes(definitions());
    $("entity-editor").replaceChildren();
    items.forEach((entity, i) => {
      const row = document.createElement("div");
      row.className = "mention-row";
      const update = (value) => {
        items[i] = value;
        reviewPlan = JSON.stringify(items);
        clear();
      };
      row.append(
        control(`Mention ${i + 1}`, entity.text, null, (text) => {
          try {
            update(sourceMention($("source-text").value, items[i].type, text));
            editEntities();
          } catch (e) {
            update({ ...items[i], text });
            status(e.message, true);
          }
        }),
      );
      const occurrences = [];
      let pos = -1;
      while (
        entity.text &&
        (pos = $("source-text").value.indexOf(entity.text, pos + 1)) >= 0
      )
        occurrences.push([
          String(occurrences.length),
          `Occurrence ${occurrences.length + 1}: …${$("source-text").value.slice(Math.max(0, pos - 15), pos + entity.text.length + 15)}…`,
        ]);
      let selected = 0,
        idx = -1;
      for (let n = 0; n < occurrences.length; n++) {
        idx = $("source-text").value.indexOf(entity.text, idx + 1);
        if (idx === entity.start) selected = n;
      }
      row.append(
        control(
          `Source occurrence ${i + 1}`,
          String(selected),
          occurrences,
          (n) => {
            try {
              update(
                sourceMention(
                  $("source-text").value,
                  items[i].type,
                  items[i].text,
                  Number(n),
                ),
              );
            } catch (e) {
              status(e.message, true);
            }
          },
        ),
      );
      row.append(
        control(
          `Category ${i + 1}`,
          entity.type,
          types.map((t) => [t.name, t.name]),
          (type) => update({ ...items[i], type }),
        ),
      );
      const remove = document.createElement("button");
      remove.textContent = `Remove mention ${i + 1}`;
      remove.addEventListener("click", () => {
        items.splice(i, 1);
        reviewPlan = JSON.stringify(items);
        clear();
        editEntities();
        runLocal();
      });
      row.append(remove);
      $("entity-editor").append(row);
    });
  }
  for (const id of ["people-category", "companies-category", "custom-category"])
    $(id)?.addEventListener("change", () => {
      if (!reviewPlan) return;
      try {
        editEntities();
      } catch (e) {
        status(e.message, true);
      }
    });
  function editGraph() {
    const graph = JSON.parse(reviewPlan);
    mermaidSource(graph);
    $("graph-panel").hidden = false;
    $("graph-editor").replaceChildren();
    const save = () => {
      reviewPlan = JSON.stringify(graph);
      clear();
    };
    graph.nodes.forEach((node, i) => {
      const row = document.createElement("div");
      row.className = "panel";
      row.append(
        control(`Step ${i + 1} label`, node.label, null, (label) => {
          node.label = label;
          save();
        }),
      );
      row.append(
        control(
          `Step ${i + 1} type`,
          node.type,
          [
            ["process", "Action"],
            ["decision", "Decision"],
            ["terminal", "Start / end"],
          ],
          (type) => {
            node.type = type;
            graph.edges = graph.edges.filter((e) => e.from !== node.id);
            save();
            editGraph();
          },
        ),
      );
      for (const label of node.type === "decision" ? ["yes", "no"] : [""]) {
        const edge = graph.edges.find(
          (e) => e.from === node.id && (e.label || "") === label,
        );
        row.append(
          control(
            `Step ${i + 1} ${label || "next"} destination`,
            edge?.to || "",
            [
              ["", "No destination"],
              ...graph.nodes.map((n) => [n.id, n.label]),
            ],
            (to) => {
              graph.edges = graph.edges.filter(
                (e) => !(e.from === node.id && (e.label || "") === label),
              );
              if (to) graph.edges.push({ from: node.id, to, label });
              save();
            },
          ),
        );
      }
      $("graph-editor").append(row);
    });
  }
  $("create-diagram")?.addEventListener("click", askJev);
  function show(text, name, type = "text/plain") {
    output = text;
    filename = name;
    mime = type;
    $("extra-output").textContent =
      text.slice(0, 50000) +
      (text.length > 50000 ? "\n… download contains the full result." : "");
    $("extra-visual").replaceChildren();
    $("extra-results").hidden = false;
    const results = $("extra-results");
    const rect = results.getBoundingClientRect();
    results.focus({ preventScroll: true });
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      results.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    }
  }
  function download() {
    if (!output) return;
    const url = URL.createObjectURL(new Blob([output], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function jsonData() {
    const s = $("source-text").value;
    if (s.length > 2000000) throw new Error("JSON exceeds 2 MB.");
    if (!s.trim()) throw new Error("Enter a JSON document before converting.");
    validateJsonNumberPrecision(s);
    try {
      return JSON.parse(s);
    } catch {
      throw new Error(
        "Check the JSON document: add matching braces and brackets, commas, and double quotes.",
      );
    }
  }
  function paths(selected) {
    $("record-sample").replaceChildren();
    $("record-sample-panel").hidden = true;
    $("row-summary").textContent = "";
    $("row-choice-control").hidden = true;
    $("nested-list-options").hidden = true;
    const data = jsonData();
    const choices = recordChoices(data);
    if (
      !choices.length &&
      data &&
      typeof data === "object" &&
      !Array.isArray(data)
    )
      choices.push({
        path: "$object",
        count: 1,
        label: "The whole object — 1 spreadsheet row",
      });
    $("array-options").hidden = false;
    root.querySelector(".row-choice-control").hidden = choices.length <= 1;
    const describe = (choice) => {
      const rows =
        choice.path === "$object"
          ? [data]
          : choice.path === "$"
            ? data
            : choice.path.split(".").reduce((value, key) => value[key], data);
      const first = rows?.[0];
      const fields =
        first && typeof first === "object"
          ? Object.keys(first).slice(0, 4)
          : [];
      const name =
        choice.path === "$object"
          ? "The whole object"
          : choice.path === "$"
            ? "The top-level list"
            : `“${choice.path.split(".").at(-1)}”${choice.path.includes(".") ? ` inside “${choice.path.split(".").slice(0, -1).join(" → ")}”` : ""}`;
      return `${name} · ${choice.count} ${choice.count === 1 ? "row" : "rows"}${fields.length ? ` · fields: ${fields.join(", ")}` : ""}`;
    };
    $("row-path").replaceChildren(
      new Option(
        choices.length > 1
          ? "Choose which data becomes rows"
          : "Rows to convert",
        "",
      ),
      ...choices.map((choice) => new Option(describe(choice), choice.path)),
    );
    $("row-path").value =
      selected ?? (choices.length === 1 ? choices[0].path : "");
    $("row-path").dispatchEvent(new Event("change", { bubbles: true }));
    if (!choices.length) {
      $("row-summary").textContent =
        "Add a JSON object or a list of objects to make rows.";
      throw Error(
        "Use a JSON object or a list of objects, each containing named fields.",
      );
    }
  }
  function showNestedPaths() {
    const path = $("row-path").value;
    $("record-sample").textContent = "";
    $("record-sample-panel").hidden = true;
    if (!path) {
      $("row-summary").textContent = "Choose a list above to see its rows.";
      $("nested-list-options").hidden = true;
      $("nested-array-help").textContent =
        "Choose a list above to inspect its data before conversion.";
      return;
    }
    const data = jsonData();
    const records =
      path === "$object"
        ? [data]
        : path === "$"
          ? data
          : path.split(".").reduce((v, k) => v[k], data);
    $("record-sample-panel").hidden = !records?.length;
    const count = records?.length ?? 0;
    $("row-summary").textContent =
      `${count} spreadsheet ${count === 1 ? "row" : "rows"}${path === "$object" ? " from this object" : path === "$" ? " from your list" : ` from “${path.split(".").at(-1)}”`}.`;
    const examples = records.slice(0, 2);
    const keys = [
      ...new Set(examples.flatMap((row) => Object.keys(row))),
    ].slice(0, 4);
    const table = document.createElement("table");
    const head = document.createElement("tr");
    for (const key of keys) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = key;
      head.append(th);
    }
    table.append(head);
    for (const row of examples) {
      const tr = document.createElement("tr");
      for (const key of keys) {
        const td = document.createElement("td");
        const value = row[key];
        const text =
          value == null
            ? ""
            : typeof value === "object"
              ? JSON.stringify(value)
              : String(value);
        td.textContent = text.length > 160 ? text.slice(0, 160) + "…" : text;
        td.title = text;
        tr.append(td);
      }
      table.append(tr);
    }
    $("record-sample").append(table);
    const found = new Set();
    const walk = (value, prefix = "", depth = 0) => {
      if (depth > 6)
        throw Error(`Nesting at ${prefix || "record"} exceeds six levels.`);
      if (Array.isArray(value)) {
        if (prefix) found.add(prefix);
        return;
      }
      if (value && typeof value === "object")
        for (const [key, child] of Object.entries(value))
          walk(child, prefix ? `${prefix}.${key}` : key, depth + 1);
    };
    for (const row of records || []) walk(row);
    $("nested-list-options").hidden = !found.size;
    $("nested-array-help").textContent = found.size
      ? `Lists found inside these rows (${path}): ${[...found].join(", ")}. Choose “Keep as JSON text” to preserve them, “Omit” to explicitly remove those fields, or “Stop” to make no CSV. Omission is never automatic.`
      : "No lists inside these rows.";
  }
  $("row-path")?.addEventListener("change", showNestedPaths);
  $("array-policy")?.addEventListener("change", showNestedPaths);
  $("extra-example").addEventListener("click", () => {
    if (!allowExampleReplacement()) return;
    clear();
    forgetInterpretation();
    manualArrayPolicy = null;
    if ($("source-file")) $("source-file").value = "";
    if (tool === "jsonCsv") {
      $("source-text").value = JSON.stringify(
        {
          orders: [
            { id: "001", customer: { name: "Ada" }, total: 12 },
            { id: "002", customer: { name: "Lin" }, total: 25 },
          ],
        },
        null,
        2,
      );
      paths("orders");
      $("array-policy").value = "reject";
    }
    if (tool === "entities") {
      $("people-category").checked = true;
      $("companies-category").checked = true;
      $("custom-category").checked = false;
      syncModes();
      $("source-text").value = "Ada works at Acme Labs. Lin joined Acme Labs.";
      $("instructions").value = "";
      reviewPlan = "";
    }
    if (tool === "diagram") {
      $("source-text").value =
        "Receive request\nApprove request?\nSend confirmation\nNotify rejection";
      $("instructions").value =
        "Receive a request, then decide approval. If yes send confirmation; if no notify rejection.";
      reviewPlan = "";
    }
    if (tool === "qa") {
      fetchedUrl = "";
      fetchedMetadata = null;
      $("source-coverage").textContent = "";
      $("fetched-source").textContent = "";
      $("source-inspection").hidden = true;
      $("source-text").value =
        "UtilityPot is a collection of focused utilities in the ModePot family.\n\nJev proposes typed interpretations. Deterministic code performs calculations and transformations.\n\nThe application does not store submitted text or require an account.";
      $("instructions").value = "Does the application store my submitted text?";
      $("page-url").value = "";
    }
    if (tool === "diagram") syncModes();
    if (tool === "qa") {
      $("source-mode").value = "paste";
      syncModes();
    }
    status("Example loaded. Review the sample inputs before continuing.");
  });
  async function readPage(token) {
    const attempt = begin("read_page");
    try {
      status("Reading the public page…");
      const data = await requestUtility(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: $("page-url").value }),
          signal: AbortSignal.timeout(12000),
        },
        "Could not read the page.",
        "/api/utilities/read-page",
      );
      if (token !== revision) {
        complete(attempt, "cancelled");
        return false;
      }
      if (
        typeof data.text !== "string" ||
        !data.text.trim() ||
        typeof data.url !== "string"
      )
        throw failureError("Could not read the page.", "invalid_response");
      $("source-text").value = data.text;
      fetchedUrl = data.url;
      fetchedMetadata = {
        truncated: data.truncated === true,
        ...(Array.isArray(data.redirects) ? { redirects: data.redirects } : {}),
      };
      $("source-inspection").hidden = false;
      $("fetched-source").textContent = data.text;
      $("source-coverage").textContent = data.truncated
        ? "Only part of this source was retrieved. The answer may miss material outside that coverage."
        : "The full readable page is ready. All source sections will be considered for your question.";
      complete(attempt, "success");
      return true;
    } catch (e) {
      const category =
        token !== revision ? "cancelled" : failureCategory(e, "presentation");
      complete(attempt, failureOutcome(category), category);
      throw e;
    }
  }
  function missingField(id, message) {
    clear();
    status(message, true);
    $(id).focus();
    return false;
  }
  function requiredAiFields() {
    if (tool === "entities") {
      if (!$("source-text").value.trim())
        return missingField("source-text", "Paste text to extract from.");
      if (
        new TextEncoder().encode($("source-text").value).byteLength >
        2 * 1024 * 1024
      )
        return missingField(
          "source-text",
          "Source text must be no larger than 2 MiB.",
        );
      if (!definitions().trim())
        return missingField(
          $("custom-category").checked ? "instructions" : "people-category",
          "Choose at least one entity type or enter a custom definition.",
        );
      if ($("custom-category").checked && !$("instructions").value.trim())
        return missingField(
          "instructions",
          "Enter a custom entity definition or turn off Custom types.",
        );
    }
    if (tool === "qa") {
      const urlMode = $("source-mode").value === "url";
      if (urlMode && !$("page-url").value.trim())
        return missingField(
          "page-url",
          "Enter a public webpage URL, or switch to pasted text.",
        );
      if (!urlMode && !$("source-text").value.trim())
        return missingField("source-text", "Paste webpage text to search.");
      if (!$("instructions").value.trim())
        return missingField(
          "instructions",
          "Enter a question about the source.",
        );
    }
    return true;
  }
  async function askJev() {
    if (!requiredAiFields()) return;
    if (tool === "diagram" && !$("source-text").value.trim()) {
      status(
        "Add at least one step in the Steps field before creating a diagram.",
        true,
      );
      return;
    }
    clear();
    forgetInterpretation();
    let attempt = null;
    let outcome = "unexpected_failure",
      category = "validation";
    const token = revision,
      button = $("extra-ask") || $("create-diagram");
    button.disabled = true;
    try {
      if (
        tool === "qa" &&
        $("source-mode").value === "url" &&
        !(await readPage(token))
      )
        return;
      let input;
      if (tool === "entities")
        input = {
          text: $("source-text").value,
          definitions: definitions(),
        };
      if (tool === "diagram")
        input = {
          text: $("source-text").value,
          instructions: $("instructions").value,
        };
      if (tool === "qa")
        input = {
          text: $("source-text").value,
          question: $("instructions").value,
        };
      status(
        tool === "entities"
          ? "Finding names and categories…"
          : tool === "qa"
            ? "Reading your source and organizing an answer…"
            : tool === "jsonCsv"
              ? "Choosing records and array handling…"
              : "Reading flowchart steps and connections…",
      );
      attempt = begin("ai_interpretation");
      let data;
      if (["entities", "qa"].includes(tool)) {
        const controller = new AbortController();
        documentController = controller;
        let lastRequest = 0;
        const interpretDocument =
          tool === "qa" ? answerSourceDocument : extractEntityDocument;
        data = await interpretDocument(
          input,
          async (payload, { signal }) => {
            // Respect the existing six-request/minute guard; do not retry a denial.
            const delay = Math.max(0, lastRequest + 13500 - Date.now());
            if (delay)
              await new Promise((resolve, reject) => {
                const cancel = () => {
                  clearTimeout(timer);
                  signal.removeEventListener("abort", cancel);
                  reject(signal.reason);
                };
                const timer = setTimeout(() => {
                  signal.removeEventListener("abort", cancel);
                  resolve();
                }, delay);
                signal.addEventListener("abort", cancel, { once: true });
                if (signal.aborted) cancel();
              });
            signal.throwIfAborted();
            lastRequest = Date.now();
            const body = await requestUtility(
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tool, input: payload }),
                signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
              },
              tool === "qa"
                ? "Could not prepare a source-backed answer."
                : "Could not extract names.",
            );
            category = "invalid_response";
            return body;
          },
          {
            signal: controller.signal,
            onProgress: ({ completed, total }) => {
              if (token === revision)
                status(
                  `${tool === "qa" ? "Reading source" : "Extracting names"} · ${completed} of ${total} sections complete…`,
                );
            },
          },
        );
        if (token !== revision) {
          outcome = "cancelled";
          return;
        }
        if (tool === "entities") {
          entityProcessing = data;
          reviewPlan = JSON.stringify(data.plan.entities, null, 2);
          editEntities();
        }
      } else {
        data = await requestUtility(
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool, input }),
            signal: AbortSignal.timeout(tool === "diagram" ? 35000 : 20000),
          },
          "Jev is unavailable.",
        );
      }
      if (token !== revision) {
        outcome = "cancelled";
        return;
      }
      if (data.source !== "jev" || !data.plan)
        throw failureError("Unverified interpretation.", "invalid_response");
      category = "presentation";
      if (tool === "jsonCsv") {
        paths(data.plan.path);
        $("array-policy").value = manualArrayPolicy ?? data.plan.arrays;
      }

      if (tool === "diagram") {
        reviewPlan = JSON.stringify(data.plan.graph, null, 2);
        editGraph();
      }
      if (tool === "qa") {
        evidenceAnswered =
          data.plan.status !== "not-answered" && data.plan.excerpts.length > 0;
        const sourceUrl =
          fetchedUrl && $("source-mode").value === "url" ? fetchedUrl : "";
        show(
          sourceAnswerMarkdown(data.plan, {
            question: input.question,
            sourceLabel: sourceUrl || "Pasted text",
          }),
          "utilitypot-answer.md",
          "text/markdown",
        );
        $("extra-visual").append(
          createSourceAnswerView(data, {
            question: input.question,
            text: input.text,
            url: sourceUrl,
            truncated: fetchedMetadata?.truncated === true,
            retrieval: sourceUrl
              ? { redirects: fetchedMetadata?.redirects ?? [] }
              : undefined,
            onChangeQuestion: () => {
              $("instructions").focus();
              $("instructions").scrollIntoView({ block: "center" });
            },
          }),
        );
      }
      if (tool === "qa") {
        // The source-answer renderer owns the visible reading workspace; raw
        // evidence and processing metadata remain in its secondary JSON export.
      } else if (
        !(await runLocal(false, (localOutcome) => {
          outcome = localOutcome;
          category = failureProperties(localOutcome).failure_category;
        }))
      ) {
        if (token !== revision) outcome = "cancelled";
        return;
      }
      if (tool === "qa") {
        $("extra-status").textContent = "";
        $("extra-status").hidden = true;
        $("extra-report-problem").hidden = true;
      } else if (tool !== "entities") {
        const review = interpretationReview(tool, data.confidence);
        if (review) status(`${$("extra-status").textContent} ${review}`);
        appendInterpretationDetails($("extra-visual"), data.model);
      }
      outcome = "success";
    } catch (e) {
      if (token !== revision) {
        outcome = "cancelled";
        return;
      }
      category = failureCategory(e, category);
      outcome = failureOutcome(category);
      if (token === revision) {
        if (tool === "entities" && reviewPlan) $("entity-review").open = true;
        if (tool === "diagram" && reviewPlan) {
          $("graph-panel").hidden = false;
          $("graph-panel").open = true;
        }
        status(
          e.name === "TimeoutError"
            ? "Jev timed out. No result was accepted."
            : e.message +
                (tool === "diagram"
                  ? " No AI graph was accepted. Review the input and try again."
                  : tool === "entities"
                    ? " No matches were accepted. Check the text and try again."
                    : ""),
          true,
        );
      }
    } finally {
      if (attempt)
        complete(
          attempt,
          outcome,
          outcome === "cancelled" ? "cancelled" : category,
        );
      button.disabled = false;
      if (["entities", "qa"].includes(tool) && token === revision)
        documentController = null;
    }
  }
  $("extra-ask")?.addEventListener("click", askJev);
  $("extra-run")?.addEventListener("click", () => runLocal());
  async function runLocal(emit = true, onFailure) {
    const attempt = emit ? begin("manual_run") : null;
    let outcome = "rejected";
    try {
      const token = revision;
      if (tool === "jsonCsv") {
        if (!$("row-path").options.length) paths();
        const data = jsonData();
        if (!$("row-path").value)
          throw Error(
            recordChoices(data).length > 1
              ? "Choose which list should become spreadsheet rows."
              : "Use a JSON object or a list of objects containing named fields.",
          );
        const result = jsonToCsv(
          data,
          $("row-path").value,
          $("array-policy").value,
        );
        outcome = "unexpected_failure";
        show(result, "utilitypot-data.csv", "text/csv");
        const parsed = Papa.parse(result).data;
        const table = document.createElement("table");
        for (const [index, row] of parsed.slice(0, 101).entries()) {
          const tr = document.createElement("tr");
          for (const value of row) {
            const td = document.createElement(index === 0 ? "th" : "td");
            if (index === 0) td.scope = "col";
            td.textContent = value;
            tr.append(td);
          }
          table.append(tr);
        }
        const wrap = document.createElement("div");
        wrap.className = "table-scroll csv-preview";
        wrap.tabIndex = 0;
        wrap.setAttribute("role", "region");
        wrap.setAttribute(
          "aria-label",
          "CSV preview — scroll horizontally for all columns",
        );
        const hint = document.createElement("p");
        hint.className = "notice";
        hint.textContent =
          "Scroll horizontally to review all columns. Values are shown without splitting.";
        $("extra-visual").append(hint);
        wrap.append(table);
        $("extra-visual").append(wrap);
        status(
          "CSV computed locally. Preview shows up to 100 rows; download includes every row. Formula-like cells are escaped for spreadsheet safety.",
        );
      }
      if (tool === "entities") {
        const items = JSON.parse(reviewPlan),
          source = $("source-text").value;
        if (new TextEncoder().encode(source).byteLength > 2 * 1024 * 1024)
          throw Error("Source text must be no larger than 2 MiB.");
        const types = entityTypes(definitions()).map((t) => t.name);
        if (!Array.isArray(items)) throw new Error("Invalid entity mentions.");
        for (const e of items) {
          if (
            !types.includes(e.type) ||
            !Number.isInteger(e.start) ||
            !Number.isInteger(e.end) ||
            e.start < 0 ||
            e.end <= e.start ||
            e.end > source.length ||
            source.slice(e.start, e.end) !== e.text
          )
            throw new Error(
              "Every entity must exactly match its source offsets and a defined type.",
            );
        }
        const byType = new Map();
        for (const e of items) {
          if (!byType.has(e.type)) byType.set(e.type, []);
          byType.get(e.type).push(e);
        }
        for (const spans of byType.values()) {
          spans.sort((a, b) => a.start - b.start || a.end - b.end);
          for (let i = 1; i < spans.length; i++)
            if (spans[i].start < spans[i - 1].end)
              throw Error("Overlapping mentions of the same type.");
        }
        outcome = "unexpected_failure";
        show(
          JSON.stringify(items, null, 2),
          "utilitypot-entities.json",
          "application/json",
        );
        const workspace = document.createElement("section");
        workspace.className = "entity-workspace";
        workspace.setAttribute("aria-label", "Entity results and source text");
        const index = document.createElement("nav");
        index.className = "entity-index";
        index.setAttribute("aria-label", "Found entities and occurrences");
        index.tabIndex = -1;
        index.hidden = !items.length;
        let returnToOccurrence = null;
        workspace.classList.toggle("is-empty", !items.length);
        const guidance = document.createElement("p");
        guidance.className = "notice";
        guidance.textContent =
          "Review each name and its exact source occurrences.";
        index.append(guidance);
        const documentView = document.createElement("div");
        documentView.className = "entity-document";
        documentView.setAttribute(
          "aria-label",
          "Full source with highlighted matches",
        );
        // Default category identities remain stable when another category is disabled.
        const categorySlots = new Map();
        if (types.includes("Person")) categorySlots.set("Person", 0);
        if (types.includes("Organization"))
          categorySlots.set("Organization", 1);
        const availableSlots = [2, 3, 0, 1].filter(
          (slot) => ![...categorySlots.values()].includes(slot),
        );
        for (const type of types)
          if (!categorySlots.has(type))
            categorySlots.set(type, availableSlots.shift());
        const legend = document.createElement("div");
        legend.className = "entity-legend";
        legend.setAttribute("aria-label", "Entity category legend");
        const selection = document.createElement("p");
        selection.className = "entity-selection";
        selection.textContent =
          "Choose a numbered mention to inspect its category and exact position in the source.";
        const occurrenceButtons = [];
        const marks = new Map();
        const ordered = [...items].sort((a, b) => a.start - b.start);
        ordered.forEach((_, n) => marks.set(n, []));
        // Split only at validated source offsets. Shared/overlapping categories
        // point to the same text segments without duplicating or dropping text.
        const boundaries = [
          ...new Set([
            0,
            source.length,
            ...ordered.flatMap((e) => [e.start, e.end]),
          ]),
        ].sort((a, b) => a - b);
        const startsAt = new Map(),
          endsAt = new Map(),
          current = new Set();
        ordered.forEach((e, n) => {
          if (!startsAt.has(e.start)) startsAt.set(e.start, []);
          if (!endsAt.has(e.end)) endsAt.set(e.end, []);
          startsAt.get(e.start).push(n);
          endsAt.get(e.end).push(n);
        });
        for (let i = 1; i < boundaries.length; i++) {
          const start = boundaries[i - 1],
            end = boundaries[i];
          for (const n of endsAt.get(start) || []) current.delete(n);
          for (const n of startsAt.get(start) || []) current.add(n);
          const active = [...current].sort((a, b) => a - b);
          const text = source.slice(start, end);
          if (!active.length) {
            documentView.append(document.createTextNode(text));
            continue;
          }
          const mark = document.createElement("mark");
          mark.textContent = text;
          mark.tabIndex = -1;
          mark.title = active.map((n) => ordered[n].type).join(", ");
          mark.dataset.entityOccurrence = active.join(" ");
          const slots = [
            ...new Set(active.map((n) => categorySlots.get(ordered[n].type))),
          ];
          mark.dataset.categorySlot = slots[0];
          if (slots.length > 1) {
            mark.classList.add("is-shared");
            mark.style.backgroundImage = `linear-gradient(135deg, ${slots.map((slot, i) => `var(--entity-tint-${slot}) ${(i * 100) / slots.length}% ${((i + 1) * 100) / slots.length}%`).join(", ")})`;
          }
          documentView.append(mark);
          active.forEach((n) => marks.get(n).push(mark));
        }
        const groups = new Map();
        ordered.forEach((e, n) => {
          if (!groups.has(e.type)) groups.set(e.type, new Map());
          const entities = groups.get(e.type);
          if (!entities.has(e.text)) entities.set(e.text, []);
          entities.get(e.text).push(n);
        });
        for (const [category, entities] of groups) {
          const group = document.createElement("section");
          group.className = "entity-category";
          group.dataset.entityCategory = category;
          group.dataset.categorySlot = categorySlots.get(category);
          const chip = document.createElement("span");
          chip.className = "entity-category-chip";
          chip.dataset.categorySlot = categorySlots.get(category);
          chip.textContent = `${category} · ${[...entities.values()].reduce((sum, ns) => sum + ns.length, 0)}`;
          legend.append(chip);
          const heading = document.createElement("h3");
          heading.textContent = `${category} (${[...entities.values()].reduce((sum, ns) => sum + ns.length, 0)})`;
          group.append(heading);
          for (const [name, occurrences] of entities) {
            const item = document.createElement("div");
            item.className = "entity-index-item";
            const label = document.createElement("strong");
            label.textContent = `${name} (${occurrences.length})`;
            item.append(label);
            const controls = document.createElement("div");
            controls.className = "entity-occurrences";
            item.append(controls);
            occurrences.forEach((n, occurrence) => {
              const button = document.createElement("button");
              button.type = "button";
              button.className = "entity-occurrence";
              button.textContent = `${occurrence + 1}`;
              button.title = source.slice(
                Math.max(0, ordered[n].start - 30),
                Math.min(source.length, ordered[n].end + 30),
              );
              button.setAttribute("aria-pressed", "false");
              occurrenceButtons.push(button);
              button.setAttribute(
                "aria-label",
                `${category} ${name}, occurrence ${occurrence + 1}`,
              );
              button.addEventListener("click", () => {
                returnToOccurrence = button;
                for (const control of occurrenceButtons)
                  control.setAttribute(
                    "aria-pressed",
                    String(control === button),
                  );
                for (const row of index.querySelectorAll(".entity-index-item"))
                  row.classList.toggle("is-selected", row === item);
                selection.dataset.categorySlot = categorySlots.get(category);
                selection.textContent = `${category}: ${name} · mention ${occurrence + 1} of ${occurrences.length} · characters ${ordered[n].start + 1}–${ordered[n].end}.`;
                for (const nodes of marks.values())
                  for (const mark of nodes) mark.classList.remove("is-current");
                const selected = marks.get(n);
                for (const mark of selected) {
                  mark.classList.add("is-current");
                  mark.style.setProperty(
                    "--selected-color",
                    `var(--entity-color-${categorySlots.get(category)})`,
                  );
                }
                const first = selected[0];
                first.setAttribute(
                  "aria-label",
                  `${category}: ${name}, occurrence ${occurrence + 1}`,
                );
                first.focus({ preventScroll: true });
                first.scrollIntoView({
                  block: "center",
                  behavior: matchMedia("(prefers-reduced-motion: reduce)")
                    .matches
                    ? "auto"
                    : "smooth",
                });
              });
              controls.append(button);
            });
            group.append(item);
          }
          index.append(group);
        }
        const sourcePanel = document.createElement("section");
        sourcePanel.className = "entity-source-panel";
        const toolbar = document.createElement("div");
        toolbar.className = "entity-source-toolbar";
        const sourceHeading = document.createElement("h3");
        sourceHeading.textContent = "Source in context";
        toolbar.append(sourceHeading);
        if (items.length) {
          const back = document.createElement("button");
          back.type = "button";
          back.textContent = "Back to matches";
          back.addEventListener("click", () => {
            const target = returnToOccurrence || index;
            target.focus({ preventScroll: true });
            target.scrollIntoView({
              block: returnToOccurrence ? "center" : "start",
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "auto"
                : "smooth",
            });
          });
          toolbar.append(back);
        }
        sourcePanel.append(toolbar, legend, selection, documentView);
        if (!items.length) {
          legend.hidden = true;
          selection.hidden = true;
        }
        workspace.append(index, sourcePanel);
        $("extra-visual").append(workspace);
        if (entityProcessing) {
          appendInterpretationDetails(
            $("extra-visual"),
            entityProcessing.model,
          );
          const detail = $("extra-visual").querySelector(
            "[data-interpretation-details]",
          );
          const coverage = document.createElement("p");
          coverage.textContent = `Complete source processed: ${entityProcessing.plan.coverage.sourceLength} characters, ${entityProcessing.plan.coverage.windows} sections. Review edits are validated locally, not re-inferred.`;
          const scores = document.createElement("pre");
          scores.textContent = JSON.stringify(
            entityProcessing.confidence,
            null,
            2,
          );
          detail.append(coverage, scores);
        }
        const uniqueCount = new Set(
          items.map((e) => `${e.type}\u0000${e.text}`),
        ).size;
        const categoryCount = new Set(items.map((e) => e.type)).size;
        status(
          items.length
            ? `${uniqueCount} unique ${uniqueCount === 1 ? "entity" : "entities"}; ${items.length} ${items.length === 1 ? "mention" : "mentions"} across ${categoryCount} ${categoryCount === 1 ? "category" : "categories"}. Review each exact source occurrence.`
            : "No matching names or terms found for the selected categories.",
        );
      }
      if (tool === "diagram") {
        if (!$("source-text").value.trim())
          throw new Error(
            "Add at least one step in the Steps field before creating a diagram.",
          );
        const graph = JSON.parse(reviewPlan);
        const code = mermaidSource(graph);
        outcome = "unexpected_failure";
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          htmlLabels: false,
          theme: "dark",
          flowchart: { htmlLabels: false },
        });
        const { svg } = await mermaid.render(`diagram-${Date.now()}`, code);
        if (token !== revision) {
          outcome = "cancelled";
          return;
        }
        show(code, "utilitypot-flowchart.mmd", "text/plain");
        const frame = document.createElement("iframe");
        frame.title = "Rendered Mermaid flowchart";
        frame.setAttribute("sandbox", "");
        frame.srcdoc = `<!doctype html><html><head><style>svg{display:block}</style></head><body style="margin:0;background:#0b101b;color:white">${svg}</body></html>`;
        frame.style.cssText = "display:block;width:100%;height:480px;border:0";
        const viewBox = new DOMParser()
          .parseFromString(svg, "image/svg+xml")
          .documentElement.getAttribute("viewBox")
          ?.trim()
          .split(/[\s,]+/)
          .map(Number);
        if (
          viewBox?.length === 4 &&
          viewBox.every(Number.isFinite) &&
          viewBox[2] > 0 &&
          viewBox[3] > 0
        ) {
          // Preserve readable native SVG size on desktop, shrink responsively
          // on mobile, and let the page scroll through the entire diagram.
          frame.style.maxWidth = `${viewBox[2]}px`;
          frame.style.aspectRatio = `${viewBox[2]} / ${viewBox[3]}`;
          frame.style.height = "auto";
        }
        const viewport = document.createElement("div");
        viewport.className = "diagram-viewport";
        viewport.tabIndex = 0;
        viewport.setAttribute("role", "region");
        viewport.setAttribute(
          "aria-label",
          "Flowchart inspection — scroll horizontally at actual size",
        );
        viewport.append(frame);
        if (
          viewBox?.length === 4 &&
          viewBox.every(Number.isFinite) &&
          viewBox[2] > 0 &&
          viewBox[3] > 0
        ) {
          frame.dataset.intrinsicWidth = String(viewBox[2]);
          const controls = document.createElement("div");
          controls.className = "investigation-controls";
          const fit = document.createElement("button"),
            actual = document.createElement("button");
          fit.type = actual.type = "button";
          fit.textContent = "Fit width";
          actual.textContent = "Actual size";
          const resize = (natural) => {
            frame.style.width = natural ? `${viewBox[2]}px` : "100%";
            frame.style.maxWidth = natural ? "none" : `${viewBox[2]}px`;
            fit.setAttribute("aria-pressed", String(!natural));
            actual.setAttribute("aria-pressed", String(natural));
          };
          fit.addEventListener("click", () => resize(false));
          actual.addEventListener("click", () => resize(true));
          resize(false);
          controls.append(fit, actual);
          $("extra-visual").append(controls);
        }
        $("extra-visual").append(viewport);
        const b = document.createElement("button");
        b.textContent = "Download SVG";
        b.addEventListener("click", () => {
          capture("utility_output_download_requested", {
            tool: analyticsTool,
            action: "svg_download",
          });
          const url = URL.createObjectURL(
            new Blob([svg], { type: "image/svg+xml" }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = "utilitypot-flowchart.svg";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        $("extra-visual").append(b);
        const issues = graphRoleIssues(graph);
        if (issues.length) {
          const warning = document.createElement("p");
          warning.className = "notice error";
          warning.textContent = `Review shapes before sharing: ${issues.join(" ")}`;
          $("extra-visual").prepend(warning);
          $("graph-panel").open = true;
          status(warning.textContent, true);
          outcome = "rejected";
          return false;
        }
        status("Flowchart created. Review the step types and connections.");
      }
      if (tool === "entities") $("entity-review").hidden = false;
      outcome = "success";
      return true;
    } catch (e) {
      $("extra-results").hidden = true;
      output = "";
      status(e.message, true);
      return false;
    } finally {
      if (outcome !== "success") onFailure?.(outcome);
      if (attempt) complete(attempt, outcome);
    }
  }
  $("extra-download").addEventListener("click", () => {
    if (output) {
      capture("utility_output_download_requested", {
        tool: analyticsTool,
        action: "download_result",
      });
      download();
    }
  });
  $("extra-copy").addEventListener("click", async () => {
    try {
      if (output) {
        await navigator.clipboard.writeText(output);
        capture("utility_output_copy_succeeded", {
          tool: analyticsTool,
          action: "copy_result",
        });
        status("Copied.");
      }
    } catch {
      status("Clipboard unavailable; use download.", true);
    }
  });
  if (tool === "jsonCsv" && $("source-text").value.trim()) {
    try {
      paths();
      status("Source loaded. Review the sample rows before converting.");
    } catch (error) {
      status(error.message, true);
    }
  }
  window.dispatchEvent(new Event("utilitypot:ready"));
}
