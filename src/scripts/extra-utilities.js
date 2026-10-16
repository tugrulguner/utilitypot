import { resultDiscovery } from "../lib/discovery.js";
import {
  interpretationReview,
  appendInterpretationDetails,
} from "../lib/utilities/interpretation-feedback.js";
import { exampleReplacementGuard } from "../lib/utilities/example-replacement.js";
import Papa from "papaparse";
import {
  recordChoices,
  sequentialGraph,
  sourceMention,
} from "../lib/utilities/outcome.js";
import {
  jsonToCsv,
  validateJsonNumberPrecision,
} from "../lib/utilities/json-csv.js";
import { mermaidSource, graphRoleIssues } from "../lib/utilities/diagram.js";
import { createEntitiesInterpretation } from "../lib/utilities/entities.js";
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
  const complete = (attempt, outcome) => {
    capture("utility_action_completed", {
      tool: analyticsTool,
      action: attempt.action,
      attempt_id: attempt.id,
      outcome,
    });
    if (attempt.action === "read_page") return;
    discovery.complete(
      outcome,
      !$("extra-results").hidden && (tool !== "qa" || evidenceAnswered),
      attempt.discoveryRevision,
    );
  };
  const status = (s, error = false) => {
    $("extra-status").textContent = s;
    $("extra-status").classList.toggle("error", error);
  };
  function clear() {
    discovery.reset();
    revision++;
    output = "";
    $("extra-results").hidden = true;
  }
  root.addEventListener("input", (e) => {
    clear();
    if (tool === "jsonCsv") {
      if (e.target.id === "array-policy") manualArrayPolicy = e.target.value;
      // Keep an explicit policy while its visible control remains selected.
      // Editing or uploading source must not silently return authority to AI.
    }
    if (
      ["source-text", "instructions"].includes(e.target.id) &&
      $("review-plan")
    ) {
      $("review-plan").value = "";
      $(
        tool === "entities" ? "entity-editor" : "graph-editor",
      ).replaceChildren();
      if (tool === "diagram") $("graph-panel").hidden = true;
    }
    if (e.target.id === "source-text" && tool === "jsonCsv") {
      $("row-path").replaceChildren();
      $("array-options").hidden = true;
      if (e.target.value.trim()) {
        try {
          paths();
          status(
            "Choose the records to convert. Review any nested-array paths before converting.",
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
      const ai = $("diagram-mode").value === "jev";
      $("connection-description").hidden = !ai;
      $("create-diagram").textContent = ai
        ? "Create diagram with Jev"
        : "Create diagram";
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
  for (const id of ["custom-category", "diagram-mode", "source-mode"])
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
    const items = JSON.parse($("review-plan").value || "[]");
    const types = createEntitiesInterpretation({
      text: $("source-text").value,
      definitions: definitions(),
    }).state.types;
    $("entity-editor").replaceChildren();
    items.forEach((entity, i) => {
      const row = document.createElement("div");
      row.className = "mention-row";
      const update = (value) => {
        items[i] = value;
        $("review-plan").value = JSON.stringify(items);
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
        $("review-plan").value = JSON.stringify(items);
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
      if (!$("review-plan").value) return;
      try {
        editEntities();
      } catch (e) {
        status(e.message, true);
      }
    });
  $("add-mention")?.addEventListener("click", () => {
    try {
      const spec = createEntitiesInterpretation({
        text: $("source-text").value,
        definitions: definitions(),
      });
      const items = JSON.parse($("review-plan").value || "[]");
      if (items.length >= 12) throw Error("At most 12 mentions.");
      const token = spec.state.tokens[0];
      items.push({
        type: spec.state.types[0].name,
        text: token.text,
        start: token.start,
        end: token.end,
      });
      $("review-plan").value = JSON.stringify(items);
      clear();
      editEntities();
    } catch (e) {
      status(e.message, true);
    }
  });
  function editGraph() {
    const graph = JSON.parse($("review-plan").value);
    mermaidSource(graph);
    $("graph-panel").hidden = false;
    $("graph-editor").replaceChildren();
    const save = () => {
      $("review-plan").value = JSON.stringify(graph);
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
  $("create-diagram")?.addEventListener("click", () => {
    if ($("diagram-mode").value === "jev") return askJev();
    try {
      clear();
      if (!$("source-text").value.trim())
        throw new Error(
          "Add at least one step in the Steps field before creating a diagram.",
        );
      if (!$("review-plan").value.trim())
        $("review-plan").value = JSON.stringify(
          sequentialGraph($("source-text").value),
        );
      editGraph();
      runLocal();
    } catch (e) {
      status(e.message, true);
    }
  });
  $("import-plan")?.addEventListener("click", () => {
    try {
      clear();
      tool === "diagram" ? editGraph() : editEntities();
      runLocal();
    } catch (e) {
      status(e.message, true);
    }
  });
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
      results.scrollIntoView({ block: "start", behavior: "smooth" });
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
        label: "Single object — 1 row",
      });
    $("array-options").hidden = false;
    $("row-path").replaceChildren(
      new Option("Choose records", ""),
      ...choices.map(
        (v) =>
          new Option(
            v.label ||
              `${v.path === "$" ? "Top-level records" : v.path} — ${v.count} rows`,
            v.path,
          ),
      ),
    );
    $("row-path").value =
      selected ??
      (choices.length === 1 && choices[0].path !== "$object"
        ? choices[0].path
        : "");
    $("row-path").dispatchEvent(new Event("change", { bubbles: true }));
    if (!choices.length) throw Error("No supported array of objects found.");
  }
  function showNestedPaths() {
    const path = $("row-path").value;
    $("record-sample").textContent = "";
    $("record-sample-panel").hidden = true;
    if (!path) {
      $("nested-array-help").textContent =
        "Choose records to inspect nested arrays before conversion.";
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
    const recordText = JSON.stringify(records?.[0] ?? null, null, 2);
    $("record-sample").textContent =
      recordText.slice(0, 1000) +
      (recordText.length > 1000 ? "… (truncated)" : "");
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
    $("nested-array-help").textContent = found.size
      ? `Nested arrays found in selected records (${path}): ${[...found].join(", ")}. Choose “Keep as JSON text” to preserve them, “Omit” to explicitly remove those fields, or “Stop” to make no CSV. Omission is never automatic.`
      : "No nested arrays found in these records.";
  }
  $("row-path")?.addEventListener("change", showNestedPaths);
  $("array-policy")?.addEventListener("change", showNestedPaths);
  function sample(v, depth = 0) {
    if (depth > 6) throw new Error("Use a shallower sample.");
    if (Array.isArray(v)) return v.slice(0, 5).map((x) => sample(x, depth + 1));
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, sample(x, depth + 1)]),
      );
    return v;
  }
  $("extra-example").addEventListener("click", () => {
    if (!allowExampleReplacement()) return;
    clear();
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
      $("instructions").value =
        "One row per order. Do not silently drop other nested arrays.";
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
      $("review-plan").value = JSON.stringify(
        [
          { type: "Person", text: "Ada", start: 0, end: 3 },
          { type: "Organization", text: "Acme Labs", start: 13, end: 22 },
        ],
        null,
        2,
      );
    }
    if (tool === "diagram") {
      $("source-text").value =
        "Receive request\nApprove request?\nSend confirmation\nNotify rejection";
      $("instructions").value =
        "Receive a request, then decide approval. If yes send confirmation; if no notify rejection.";
      $("review-plan").value = JSON.stringify(
        {
          nodes: [
            { id: "n0", label: "Receive request", type: "process" },
            { id: "n1", label: "Approve request?", type: "decision" },
            { id: "n2", label: "Send confirmation", type: "terminal" },
            { id: "n3", label: "Notify rejection", type: "terminal" },
          ],
          edges: [
            { from: "n0", to: "n1", label: "" },
            { from: "n1", to: "n2", label: "yes" },
            { from: "n1", to: "n3", label: "no" },
          ],
        },
        null,
        2,
      );
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
    if (tool === "entities") editEntities();
    if (tool === "diagram") {
      $("diagram-mode").value = "local";
      syncModes();
      editGraph();
    }
    if (tool === "qa") {
      $("source-mode").value = "paste";
      syncModes();
    }
    status("Example loaded. This is sample data, not live AI output.");
  });
  $("prepare-extra")?.addEventListener("click", () => {
    try {
      clear();
      $("review-plan").value = JSON.stringify(
        sequentialGraph($("source-text").value),
      );
      editGraph();
      runLocal();
    } catch (e) {
      status(e.message, true);
    }
  });
  async function readPage(token) {
    const attempt = begin("read_page");
    try {
      status("Reading the public page…");
      const r = await fetch("/api/utilities/read-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: $("page-url").value }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json();
      if (token !== revision) {
        complete(attempt, "cancelled");
        return false;
      }
      if (!r.ok) throw Error(data.error || "Could not read the page.");
      $("source-text").value = data.text;
      fetchedUrl = data.url;
      fetchedMetadata = {
        truncated: data.truncated === true,
        ...(Array.isArray(data.redirects) ? { redirects: data.redirects } : {}),
      };
      $("source-inspection").hidden = false;
      $("fetched-source").textContent = data.text;
      $("source-coverage").textContent = data.truncated
        ? "Source truncated: only the first 10,000 characters / 100 paragraphs are searched. An absent answer may exist outside this coverage."
        : "Fetched source is within the 10,000 character / 100 paragraph limit. Inspect the source below.";
      complete(attempt, "success");
      return true;
    } catch (e) {
      complete(attempt, "rejected");
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
    const attempt = begin("ai_interpretation");
    let outcome = "unexpected_failure",
      responseStatus = 0;
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
      if (tool === "jsonCsv")
        input = {
          sample: JSON.stringify(sample(jsonData())),
          instructions: $("instructions").value,
        };
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
            ? "Finding a relevant passage…"
            : tool === "jsonCsv"
              ? "Choosing records and array handling…"
              : "Reading flowchart steps and connections…",
      );
      const r = await fetch("/api/utilities/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, input }),
        // Entity spans and diagram roles use two bounded 15-second stages.
        signal: AbortSignal.timeout(
          ["entities", "diagram"].includes(tool) ? 35000 : 20000,
        ),
      });
      responseStatus = r.status;
      const data = await r.json();
      if (token !== revision) {
        outcome = "cancelled";
        return;
      }
      if (!r.ok) throw new Error(data.error || "Jev is unavailable.");
      if (data.source !== "jev" || !data.plan)
        throw new Error("Unverified interpretation.");
      if (tool === "jsonCsv") {
        paths(data.plan.path);
        $("array-policy").value = manualArrayPolicy ?? data.plan.arrays;
      }
      if (tool === "entities") {
        $("review-plan").value = JSON.stringify(data.plan.entities, null, 2);
        editEntities();
      }
      if (tool === "diagram") {
        $("review-plan").value = JSON.stringify(data.plan.graph, null, 2);
        editGraph();
      }
      if (tool === "qa") {
        const result = data.plan;
        evidenceAnswered = result.status === "answered";
        if (!["answered", "partial", "not-answered"].includes(result.status))
          throw new Error("Invalid answer status.");
        for (const e of result.excerpts || [])
          if (
            !Number.isInteger(e.start) ||
            !Number.isInteger(e.end) ||
            $("source-text").value.slice(e.start, e.end) !== e.text
          )
            throw Error("Evidence does not match the source snapshot.");
        if (result.status !== "not-answered" && !result.excerpts?.length)
          throw Error("No supporting excerpt was returned.");
        show(
          JSON.stringify(
            {
              ...result,
              question: input.question,
              source: {
                kind:
                  fetchedUrl && $("source-mode").value === "url"
                    ? "fetched-url"
                    : "pasted-text",
                text: input.text,
                coverage: {
                  characters: input.text.length,
                  paragraphs: input.text
                    .split(/\n\s*\n/)
                    .filter((s) => s.trim()).length,
                  truncated:
                    $("source-mode").value === "url" &&
                    fetchedMetadata?.truncated === true,
                },
                ...(fetchedUrl && $("source-mode").value === "url"
                  ? {
                      url: fetchedUrl,
                      ...(Array.isArray(fetchedMetadata?.redirects)
                        ? {
                            retrieval: { redirects: fetchedMetadata.redirects },
                          }
                        : {}),
                    }
                  : {}),
              },
            },
            null,
            2,
          ),
          "utilitypot-evidence.json",
          "application/json",
        );
        $("extra-visual").textContent =
          result.status === "not-answered"
            ? "Not answered by the supplied source."
            : `${result.status === "partial" ? "Partial evidence" : "Selected source evidence"} — review the exact excerpt below. This is not independent fact verification.`;
      }
      if (tool === "qa") {
        for (const e of data.plan.excerpts) {
          const quote = document.createElement("blockquote");
          quote.textContent = e.text;
          $("extra-visual").append(quote);
        }
        if (fetchedUrl && $("source-mode").value === "url") {
          const link = document.createElement("a");
          link.href = fetchedUrl;
          link.textContent = `Source: ${fetchedUrl}`;
          link.rel = "noopener noreferrer";
          $("extra-visual").append(link);
        }
      } else if (!(await runLocal(false))) {
        outcome = token !== revision ? "cancelled" : "rejected";
        return;
      }
      if (tool === "qa") {
        const result = data.plan;
        const passageUncertain =
          result.status !== "not-answered" &&
          result.excerpts.length > 0 &&
          typeof data.confidence?.passage === "number" &&
          data.confidence.passage < 0.6;
        const answerUncertain =
          result.status === "answered" &&
          typeof data.confidence?.answerability === "number" &&
          data.confidence.answerability < 0.6;
        const outcome =
          result.status === "answered"
            ? answerUncertain
              ? "Possible answer found in the source."
              : "Answer found in the source."
            : result.status === "partial"
              ? "Partial evidence found in the source."
              : "No answer found in the supplied source.";
        status(
          `${outcome}${answerUncertain ? " The source may not fully answer your question; review the excerpt." : ""}${passageUncertain ? " Several passages may fit; review the selected excerpt." : ""}`,
        );
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
      outcome =
        e.name === "TimeoutError" ||
        (responseStatus >= 400 && responseStatus < 500)
          ? "rejected"
          : "unexpected_failure";
      if (token === revision) {
        if (tool === "entities") $("entity-review").open = true;
        if (tool === "diagram") {
          $("graph-panel").hidden = false;
          $("graph-panel").open = true;
        }
        status(
          e.name === "TimeoutError"
            ? "Jev timed out. No result was accepted."
            : e.message +
                (tool === "diagram"
                  ? " No AI graph was accepted. Start a private sequential diagram below, then edit types and destinations."
                  : tool === "entities"
                    ? " No AI matches were accepted. Shorten the text and try again, or use Add mention manually below to select exact source text and its occurrence."
                    : ""),
          true,
        );
      }
    } finally {
      complete(attempt, outcome);
      button.disabled = false;
    }
  }
  $("extra-ask")?.addEventListener("click", askJev);
  $("extra-run")?.addEventListener("click", () => runLocal());
  async function runLocal(emit = true) {
    const attempt = emit ? begin("manual_run") : null;
    let outcome = "rejected";
    try {
      const token = revision;
      if (tool === "jsonCsv") {
        if (!$("row-path").options.length) paths();
        const result = jsonToCsv(
          jsonData(),
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
        const items = JSON.parse($("review-plan").value),
          source = $("source-text").value;
        const spec = createEntitiesInterpretation({
          text: source,
          definitions: definitions(),
        });
        const types = spec.state.types.map((t) => t.name);
        if (!Array.isArray(items) || items.length > 12)
          throw new Error("Use at most 12 entity mentions.");
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
        for (const type of types)
          if (items.filter((e) => e.type === type).length > 3)
            throw new Error("At most three mentions per type.");
        outcome = "unexpected_failure";
        show(
          JSON.stringify(items, null, 2),
          "utilitypot-entities.json",
          "application/json",
        );
        const highlighted = document.createElement("p");
        let cursor = 0;
        for (const e of [...items].sort((a, b) => a.start - b.start)) {
          if (e.start < cursor) continue;
          highlighted.append(
            document.createTextNode(source.slice(cursor, e.start)),
          );
          const mark = document.createElement("mark");
          mark.textContent = e.text;
          mark.title = e.type;
          highlighted.append(mark);
          cursor = e.end;
        }
        highlighted.append(document.createTextNode(source.slice(cursor)));
        $("extra-visual").append(highlighted);
        const categoryCount = new Set(items.map((e) => e.type)).size;
        status(
          items.length
            ? `Found ${items.length} ${items.length === 1 ? "mention" : "mentions"} in ${categoryCount} ${categoryCount === 1 ? "category" : "categories"}. Review the highlights and categories.`
            : "No matching names or terms found for the selected categories.",
        );
      }
      if (tool === "diagram") {
        if (!$("source-text").value.trim())
          throw new Error(
            "Add at least one step in the Steps field before creating a diagram.",
          );
        const graph = JSON.parse($("review-plan").value);
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
        $("extra-visual").append(frame);
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
      outcome = "success";
      return true;
    } catch (e) {
      $("extra-results").hidden = true;
      output = "";
      status(e.message, true);
      return false;
    } finally {
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
      status("Source loaded. Review the record array before converting.");
    } catch (error) {
      status(error.message, true);
    }
  }
  window.dispatchEvent(new Event("utilitypot:ready"));
}
