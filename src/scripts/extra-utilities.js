import { arrayPaths, jsonToCsv } from "../lib/utilities/json-csv.js";
import { mermaidSource } from "../lib/utilities/diagram.js";
import { createEntitiesInterpretation } from "../lib/utilities/entities.js";
const root = document.querySelector("[data-extra-utility]");
if (root) {
  const tool = root.getAttribute("data-extra-utility"),
    $ = (id) => root.querySelector(`#${id}`);
  let revision = 0,
    output = "",
    filename = "",
    mime = "text/plain";
  const status = (s, error = false) => {
    $("extra-status").textContent = s;
    $("extra-status").classList.toggle("error", error);
  };
  function clear() {
    revision++;
    output = "";
    $("extra-results").hidden = true;
    if ($("extra-reviewed")) $("extra-reviewed").checked = false;
  }
  root.addEventListener("input", (e) => {
    if (["extra-consent", "extra-reviewed"].includes(e.target.id)) return;
    clear();
    if (
      ["source-text", "instructions"].includes(e.target.id) &&
      $("review-plan")
    )
      $("review-plan").value = "";
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
    return JSON.parse(s);
  }
  function paths(selected) {
    const p = arrayPaths(jsonData());
    $("row-path").replaceChildren(
      new Option("Choose the row array", ""),
      ...p.map((v) => new Option(v, v)),
    );
    if (selected) $("row-path").value = selected;
  }
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
    clear();
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
      $("source-text").value = "Ada works at Acme Labs. Lin joined Acme Labs.";
      $("instructions").value =
        "Person: a named human\nOrganization: a named employer";
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
      $("source-text").value =
        "UtilityPot is a collection of focused utilities in the ModePot family.\n\nJev proposes typed interpretations. Deterministic code performs calculations and transformations.\n\nThe application does not store submitted text or require an account.";
      $("instructions").value = "Does the application store my submitted text?";
      $("page-url").value = "";
    }
    status("Example loaded. This is sample data, not live AI output.");
  });
  $("prepare-extra")?.addEventListener("click", () => {
    try {
      clear();
      if (tool === "jsonCsv") {
        paths();
        status("Choose a record array and confirm the nested-array policy.");
      } else {
        const labels = $("source-text")
          .value.split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!labels.length || labels.length > 8)
          throw new Error("Use 1–8 short steps.");
        const graph = {
          nodes: labels.map((label, i) => ({
            id: `n${i}`,
            label,
            type: "process",
          })),
          edges: labels
            .slice(1)
            .map((_, i) => ({ from: `n${i}`, to: `n${i + 1}`, label: "" })),
        };
        mermaidSource(graph);
        $("review-plan").value = JSON.stringify(graph, null, 2);
        status(
          "Sequential manual draft prepared. This does not infer branching; review or ask Jev.",
        );
      }
    } catch (e) {
      status(e.message, true);
    }
  });
  $("read-page")?.addEventListener("click", async () => {
    clear();
    const token = revision,
      button = $("read-page");
    button.disabled = true;
    try {
      status("Reading the approved public page…");
      const r = await fetch("/api/utilities/read-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: $("page-url").value }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json();
      if (token !== revision) return;
      if (!r.ok) throw new Error(data.error || "Could not read the page.");
      $("source-text").value = data.text;
      $("page-url").value = data.url;
      status(
        data.truncated
          ? "Page read, truncated to the character or paragraph limit. Inspect it before asking Jev."
          : "Page read. Review the extracted text before asking Jev.",
      );
    } catch (e) {
      if (token === revision) status(e.message, true);
    } finally {
      button.disabled = false;
    }
  });
  $("extra-ask").addEventListener("click", async () => {
    if (!$("extra-consent").checked) {
      status("Confirm consent before sending context to Jev.", true);
      return;
    }
    clear();
    const token = revision,
      button = $("extra-ask");
    button.disabled = true;
    try {
      let input;
      if (tool === "jsonCsv")
        input = {
          sample: JSON.stringify(sample(jsonData())),
          instructions: $("instructions").value,
        };
      if (tool === "entities")
        input = {
          text: $("source-text").value,
          definitions: $("instructions").value,
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
      status("Asking Jev for a source-grounded proposal…");
      const r = await fetch("/api/utilities/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, input }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await r.json();
      if (token !== revision) return;
      if (!r.ok) throw new Error(data.error || "Jev is unavailable.");
      if (data.source !== "jev" || !data.plan)
        throw new Error("Unverified interpretation.");
      if (tool === "jsonCsv") {
        paths(data.plan.path);
        $("array-policy").value = data.plan.arrays;
      }
      if (tool === "entities")
        $("review-plan").value = JSON.stringify(data.plan.entities, null, 2);
      if (tool === "diagram")
        $("review-plan").value = JSON.stringify(data.plan.graph, null, 2);
      if (tool === "qa") {
        const result = data.plan;
        if (!["answered", "partial", "not-answered"].includes(result.status))
          throw new Error("Invalid answer status.");
        show(
          JSON.stringify(result, null, 2),
          "utilitypot-evidence.json",
          "application/json",
        );
        $("extra-visual").textContent =
          result.status === "not-answered"
            ? "Not answered by the supplied source."
            : `${result.status === "partial" ? "Partial evidence" : "Selected source evidence"} — review the exact excerpt below. This is not independent fact verification.`;
      }
      const weak = Object.values(data.confidence || {}).some(
        (c) => typeof c !== "number" || c < 0.6,
      );
      status(
        `Jev ${data.model}: ${tool === "qa" ? "evidence selected" : "proposal ready for review"}${weak ? "; uncertain selections require care" : ""}.`,
        weak,
      );
    } catch (e) {
      if (token === revision)
        status(
          e.name === "TimeoutError"
            ? "Jev timed out. No result was accepted."
            : e.message,
          true,
        );
    } finally {
      button.disabled = false;
    }
  });
  $("extra-run")?.addEventListener("click", async () => {
    try {
      if (!$("extra-reviewed").checked)
        throw new Error("Review and confirm the proposal first.");
      const token = revision;
      if (tool === "jsonCsv") {
        const result = jsonToCsv(
          jsonData(),
          $("row-path").value,
          $("array-policy").value,
        );
        show(result, "utilitypot-data.csv", "text/csv");
        status(
          "CSV computed locally. Formula-like cells are escaped for spreadsheet safety.",
        );
      }
      if (tool === "entities") {
        const items = JSON.parse($("review-plan").value),
          source = $("source-text").value;
        const spec = createEntitiesInterpretation({
          text: source,
          definitions: $("instructions").value,
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
        status(
          "Source offsets validated locally. Entity classifications still require your review.",
        );
      }
      if (tool === "diagram") {
        const code = mermaidSource(JSON.parse($("review-plan").value));
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          htmlLabels: false,
          theme: "dark",
          flowchart: { htmlLabels: false },
        });
        const { svg } = await mermaid.render(`diagram-${Date.now()}`, code);
        if (token !== revision) return;
        show(code, "utilitypot-flowchart.mmd", "text/plain");
        const frame = document.createElement("iframe");
        frame.title = "Rendered Mermaid flowchart";
        frame.setAttribute("sandbox", "");
        frame.srcdoc = `<!doctype html><html><body style="margin:0;background:#0b101b;color:white">${svg}</body></html>`;
        frame.style.cssText = "width:100%;height:480px;border:0";
        $("extra-visual").append(frame);
        const b = document.createElement("button");
        b.textContent = "Download SVG";
        b.addEventListener("click", () => {
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
        status("Validated graph rendered locally in a sandboxed frame.");
      }
    } catch (e) {
      $("extra-results").hidden = true;
      output = "";
      status(e.message, true);
    }
  });
  $("extra-download").addEventListener("click", download);
  $("extra-copy").addEventListener("click", async () => {
    try {
      if (output) {
        await navigator.clipboard.writeText(output);
        status("Copied.");
      }
    } catch {
      status("Clipboard unavailable; use download.", true);
    }
  });
}
