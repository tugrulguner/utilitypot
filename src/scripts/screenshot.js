import {
  recognizeScreenshot,
  validateScreenshot,
} from "../lib/utilities/screenshot-ocr.js";
import {
  reconstructTable,
  tableTSV,
  tableCSV,
  tableXLSX,
} from "../lib/utilities/screenshot-table.js";
import { resultDiscovery } from "../lib/discovery.js";
const root = document.querySelector("#screenshot-app");
if (root) {
  const $ = (s) => root.querySelector(s);
  const file = $("#screenshot-file"),
    run = $("#screenshot-run"),
    cancel = $("#screenshot-cancel"),
    results = $("#screenshot-results"),
    preview = $("#screenshot-preview"),
    overlay = $("#screenshot-overlay"),
    crop = $("#screenshot-cell-crop");
  const discovery = resultDiscovery(
    document.querySelector("[data-result-discovery]"),
  );
  let image = null,
    url = null,
    revision = 0,
    controller = null,
    table = null,
    reviewAnchor = null;
  const edited = new Set();
  const actions = [
    $("#screenshot-copy"),
    $("#screenshot-csv"),
    $("#screenshot-xlsx"),
  ];
  function status(text, error = false) {
    $("#screenshot-status").textContent = text;
    $("#screenshot-status").classList.toggle("error", error);
    $("#screenshot-error-feedback").hidden = !error;
  }
  function controls() {
    run.disabled = !image || Boolean(controller);
    cancel.disabled = !controller;
    for (const b of actions) b.disabled = !table;
  }
  function invalidate() {
    revision++;
    controller?.abort();
    controller = null;
    table = null;
    edited.clear();
    reviewAnchor = null;
    $("#screenshot-review-next").hidden = true;
    $("#screenshot-review-next").disabled = true;
    results.hidden = true;
    $("#screenshot-table").replaceChildren();
    overlay.replaceChildren();
    crop.hidden = true;
    discovery.reset();
    controls();
    return revision;
  }
  function discardImage() {
    image = null;
    preview.removeAttribute("src");
    $("#screenshot-source-panel").hidden = true;
    overlay.replaceChildren();
    if (url) URL.revokeObjectURL(url);
    url = null;
    controls();
  }
  async function accept(blob) {
    const token = invalidate();
    discardImage();
    let candidate;
    try {
      validateScreenshot(blob);
      candidate = URL.createObjectURL(blob);
      const decoded = new Image();
      decoded.src = candidate;
      await decoded.decode();
      if (decoded.naturalWidth * decoded.naturalHeight > 8000000)
        throw new Error("Choose an image no larger than 8 million pixels.");
      if (token !== revision) {
        URL.revokeObjectURL(candidate);
        return;
      }
      image = blob;
      url = candidate;
      preview.src = url;
      $("#screenshot-source-panel").hidden = false;
      status("Screenshot ready. Extract the table, then review every value.");
    } catch (error) {
      if (candidate) URL.revokeObjectURL(candidate);
      if (token !== revision) return;
      status(
        error instanceof Error && error.message.startsWith("Choose")
          ? error.message
          : "This image could not be decoded. Choose another screenshot.",
        true,
      );
    }
    controls();
  }
  file.addEventListener("change", () => accept(file.files?.[0]));
  root.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) =>
      i.type.startsWith("image/"),
    );
    if (item) {
      e.preventDefault();
      accept(item.getAsFile());
    }
  });
  root.addEventListener("dragover", (e) => {
    if ([...(e.dataTransfer?.types || [])].includes("Files"))
      e.preventDefault();
  });
  root.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.length) {
      e.preventDefault();
      accept(e.dataTransfer.files[0]);
    }
  });
  $("#screenshot-clear").addEventListener("click", () => {
    invalidate();
    discardImage();
    file.value = "";
    status("Choose or paste a screenshot to begin.");
  });
  cancel.addEventListener("click", () => {
    invalidate();
    status("Extraction cancelled.");
  });
  $("#screenshot-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!image || controller) return;
    const token = invalidate(),
      owned = new AbortController();
    controller = owned;
    controls();
    status("Loading local recognition…");
    try {
      const ocr = await recognizeScreenshot(image, {
        signal: owned.signal,
        onProgress: (p) => {
          if (token === revision) status(p.status);
        },
      });
      if (token !== revision) return;
      table = reconstructTable(ocr.words, {
        width: ocr.width,
        height: ocr.height,
      });
      overlay.setAttribute("viewBox", `0 0 ${ocr.width} ${ocr.height}`);
      render();
      status("Table ready.");
      results.hidden = false;
      controls();
      discovery.complete("success", true);
      results.focus({ preventScroll: true });
      results.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    } catch (error) {
      if (token !== revision) return;
      table = null;
      status(
        error?.name === "AbortError"
          ? "Extraction cancelled."
          : error.message || "Could not extract a table. Try a clearer image.",
        true,
      );
    } finally {
      if (token === revision) {
        controller = null;
        controls();
      }
    }
  });
  function summary() {
    const low = table.confidences.reduce(
      (n, row, r) =>
        n + row.filter((c, col) => c < 80 && !edited.has(`${r},${col}`)).length,
      0,
    );
    $("#screenshot-summary").textContent =
      `${table.rows.length} rows · ${table.rows[0].length} columns · ${low} ${low === 1 ? "cell" : "cells"} flagged for review. Check every value.`;
    const next = $("#screenshot-review-next");
    next.hidden = low === 0;
    next.disabled = low === 0;
    next.textContent =
      low === 1 ? "Review flagged cell" : "Review next flagged cell";
  }
  $("#screenshot-review-next").addEventListener("click", () => {
    const flags = [
      ...root.querySelectorAll("#screenshot-table input.needs-review"),
    ];
    if (!table || !flags.length) return;
    const next = flags[(flags.indexOf(reviewAnchor) + 1) % flags.length];
    next.focus({ preventScroll: true });
    // Keep nested table and document scrolling atomic for keyboard review.
    next.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    });
  });
  function render() {
    const element = document.createElement("table");
    element.setAttribute("aria-label", "Editable extracted table");
    const body = document.createElement("tbody");
    table.rows.forEach((row, r) => {
      const tr = document.createElement("tr");
      row.forEach((value, c) => {
        const td = document.createElement("td"),
          input = document.createElement("input");
        input.type = "text";
        input.value = value;
        input.maxLength = 32767;
        input.dataset.row = String(r);
        input.dataset.column = String(c);
        input.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}`);
        if (table.confidences[r][c] < 80) {
          input.classList.add("needs-review");
          input.title =
            "Low OCR confidence: check this value against the image.";
        }
        td.append(input);
        if (table.confidences[r][c] < 80) {
          const cue = document.createElement("span");
          cue.className = "screenshot-review-cue";
          cue.id = `screenshot-review-${r}-${c}`;
          cue.textContent = "Review";
          input.setAttribute("aria-describedby", cue.id);
          td.append(cue);
        }
        tr.append(td);
      });
      body.append(tr);
    });
    element.append(body);
    $("#screenshot-table").style.setProperty(
      "--screenshot-columns",
      String(table.rows[0].length),
    );
    $("#screenshot-table").replaceChildren(element);
    $("#screenshot-warnings").textContent = table.warnings.join(" ");
    summary();
  }
  $("#screenshot-table").addEventListener("input", (e) => {
    const input = e.target;
    if (!input.matches("input[data-row]") || !table) return;
    const r = Number(input.dataset.row),
      c = Number(input.dataset.column);
    table.rows[r][c] = input.value;
    edited.add(`${r},${c}`);
    input.classList.remove("needs-review");
    input.removeAttribute("aria-describedby");
    input.removeAttribute("title");
    input.parentElement.querySelector(".screenshot-review-cue")?.remove();
    summary();
  });
  $("#screenshot-table").addEventListener("focusin", (e) => {
    const input = e.target;
    if (!input.matches("input[data-row]") || !table) return;
    reviewAnchor = input;
    const r = Number(input.dataset.row),
      c = Number(input.dataset.column),
      box = table.boxes[r][c];
    overlay.replaceChildren();
    crop.hidden = true;
    $("#screenshot-cell-label").textContent =
      `Original image for row ${r + 1}, column ${c + 1}. Edits change the spreadsheet, not this source.`;
    if (!box) return;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    for (const [k, v] of Object.entries({
      x: box.x0,
      y: box.y0,
      width: box.x1 - box.x0,
      height: box.y1 - box.y0,
    }))
      rect.setAttribute(k, String(v));
    overlay.append(rect);
    const x = Math.max(0, box.x0 - 4),
      y = Math.max(0, box.y0 - 4),
      w = Math.min(preview.naturalWidth - x, box.x1 - box.x0 + 8),
      h = Math.min(preview.naturalHeight - y, box.y1 - box.y0 + 8);
    crop.width = Math.max(1, Math.ceil(w * 2));
    crop.height = Math.max(1, Math.ceil(h * 2));
    crop
      .getContext("2d")
      .drawImage(preview, x, y, w, h, 0, 0, crop.width, crop.height);
    crop.hidden = false;
  });
  const options = () => ({ protectFormulas: $("#screenshot-protect").checked });
  $("#screenshot-copy").addEventListener("click", async () => {
    if (!table) return;
    try {
      await navigator.clipboard.writeText(tableTSV(table.rows, options()));
      status("Table copied. Paste it into your spreadsheet.");
    } catch (error) {
      status(
        error instanceof Error && error.message.startsWith("Clipboard cells")
          ? error.message
          : "Could not copy the table. Use Download XLSX or CSV instead.",
        true,
      );
      $("#screenshot-status").parentElement.scrollIntoView({
        block: "center",
        behavior: "instant",
      });
    }
  });
  function download(data, name, type) {
    const object = URL.createObjectURL(new Blob([data], { type })),
      a = document.createElement("a");
    a.href = object;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(object), 1000);
  }
  $("#screenshot-csv").addEventListener("click", () => {
    if (!table) return;
    try {
      download(
        tableCSV(table.rows, options()),
        "table.csv",
        "text/csv;charset=utf-8",
      );
    } catch (error) {
      status(error.message, true);
    }
  });
  $("#screenshot-xlsx").addEventListener("click", () => {
    if (!table) return;
    try {
      download(
        tableXLSX(table.rows),
        "table.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    } catch (error) {
      status(error.message, true);
    }
  });
  root.dataset.ready = "true";
  controls();
  if (file.files?.[0]) accept(file.files[0]);
}
