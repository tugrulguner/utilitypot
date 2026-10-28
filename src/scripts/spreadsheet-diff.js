import { runDiffTask } from "../lib/utilities/spreadsheet-diff-client.js";
import { exportCsv, reportRows } from "../lib/utilities/spreadsheet-diff.js";
import { resultDiscovery } from "../lib/discovery.js";
const root = document.querySelector("#spreadsheet-diff-app");
if (root) {
  const $ = (s) => root.querySelector(s),
    key = $("#diff-key"),
    run = $("#diff-run"),
    resultPanel = $("#diff-result");
  const discovery = resultDiscovery(
    root.querySelector("[data-result-discovery]"),
  );
  const sources = Object.fromEntries(
    ["before", "after"].map((name) => [
      name,
      { sheets: [], selected: null, controller: null, version: 0, timer: null },
    ]),
  );
  let revision = 0,
    comparison = null,
    result = null,
    flat = [],
    page = 0,
    keyPreference = "";
  const model = (name) => sources[name].selected?.table;
  function controls() {
    const busy =
      comparison || Object.values(sources).some((s) => s.controller || s.timer);
    run.disabled =
      Boolean(busy) || !model("before") || !model("after") || !key.value;
    $("#diff-cancel").disabled = !busy;
    $("#diff-csv").disabled = $("#diff-json").disabled = !result;
  }
  function clearError() {
    $("#diff-error").hidden = true;
    $("#diff-feedback-error").hidden = true;
  }
  function error(message, reveal = false) {
    $("#diff-status").textContent =
      "Input needs attention. No current comparison.";
    $("#diff-error").textContent = message;
    $("#diff-error").hidden = false;
    $("#diff-feedback-error").hidden = false;
    if (reveal) {
      $("#diff-error").focus({ preventScroll: true });
      $("#diff-error").parentElement.scrollIntoView({
        block: "center",
        behavior: "instant",
      });
    }
  }
  function invalidate() {
    $("#diff-status").textContent =
      "Inputs changed. Read both sources and compare again.";
    revision++;
    comparison?.abort();
    comparison = null;
    result = null;
    flat = [];
    resultPanel.hidden = true;
    discovery.reset();
    clearError();
    controls();
  }
  function resetSource(name) {
    const s = sources[name];
    s.version++;
    s.controller?.abort();
    s.controller = null;
    clearTimeout(s.timer);
    s.timer = null;
    s.sheets = [];
    s.selected = null;
    $(`#diff-${name}-sheet-label`).hidden = true;
    $(`#diff-${name}-info`).textContent = "";
    return s.version;
  }
  function updateKeys() {
    const a = model("before"),
      b = model("after");
    const common = a && b ? a.headers.filter((h) => b.headers.includes(h)) : [];
    key.replaceChildren(
      new Option("Choose a key column", ""),
      ...common.map((h) => new Option(h, h)),
    );
    if (common.includes(keyPreference)) key.value = keyPreference;
    key.disabled = !common.length;
    controls();
  }
  function selectSheet(name, index) {
    const s = sources[name];
    s.selected = s.sheets[index] || null;
    const current = s.selected;
    if (current?.error) {
      s.selected = null;
      error(current.error);
    } else if (current) {
      $(`#diff-${name}-info`).textContent =
        `${current.table.rows.length} data rows · ${current.table.headers.length} columns`;
    }
    updateKeys();
  }
  async function parse(name, task, token, isWorkbook) {
    const s = sources[name],
      owned = new AbortController();
    s.controller = owned;
    controls();
    $("#diff-status").textContent = `Reading ${name} data locally…`;
    try {
      const parsed = await runDiffTask(task, { signal: owned.signal });
      if (token !== s.version) return;
      s.sheets = parsed.sheets;
      if (typeof parsed.text === "string")
        $(`#diff-${name}`).value = parsed.text;
      const select = $(`#diff-${name}-sheet`);
      select.replaceChildren(
        new Option("Choose a worksheet", ""),
        ...s.sheets.map((sheet, i) => new Option(sheet.name, String(i))),
      );
      $(`#diff-${name}-sheet-label`).hidden = !isWorkbook;
      if (s.sheets.length === 1) {
        select.value = "0";
        selectSheet(name, 0);
      } else {
        $(`#diff-${name}-info`).textContent = "Choose a worksheet to compare.";
      }
      $("#diff-status").textContent = $("#diff-error").hidden
        ? "Read both sources and choose a shared unique key, then Compare."
        : "Input needs attention. No current comparison.";
    } catch (e) {
      if (token === s.version && e.name !== "AbortError")
        error(e.message, isWorkbook);
    } finally {
      if (token === s.version) {
        s.controller = null;
        updateKeys();
      }
    }
  }
  function changedText(name) {
    invalidate();
    const token = resetSource(name);
    $(`#diff-${name}-file`).value = "";
    updateKeys();
    const text = $(`#diff-${name}`).value;
    if (!text.trim()) return;
    const s = sources[name];
    s.timer = setTimeout(() => {
      s.timer = null;
      parse(name, { kind: "csv", text }, token, false);
    }, 180);
    controls();
  }
  async function loadFile(name, file) {
    invalidate();
    const token = resetSource(name);
    $(`#diff-${name}`).value = "";
    updateKeys();
    if (!file) return;
    const workbook = /\.xlsx$/i.test(file.name),
      csv = /\.csv$/i.test(file.name);
    if (!workbook && !csv) {
      error("Choose a UTF-8 CSV or XLSX file.", true);
      return;
    }
    if (file.size > (workbook ? 5 : 2) * 1024 * 1024) {
      error(workbook ? "Workbook exceeds 5 MiB." : "CSV exceeds 2 MiB.", true);
      return;
    }
    await parse(
      name,
      { kind: "file", format: workbook ? "xlsx" : "csv", file },
      token,
      workbook,
    );
  }
  for (const name of ["before", "after"]) {
    $(`#diff-${name}`).addEventListener("input", () => changedText(name));
    $(`#diff-${name}-file`).addEventListener("change", (e) =>
      loadFile(name, e.target.files?.[0]),
    );
    $(`#diff-${name}-sheet`).addEventListener("change", (e) => {
      invalidate();
      selectSheet(name, e.target.value === "" ? -1 : Number(e.target.value));
    });
  }
  key.addEventListener("change", () => {
    keyPreference = key.value;
    invalidate();
    controls();
  });
  run.addEventListener("click", async () => {
    if (run.disabled) return;
    invalidate();
    const token = revision,
      owned = new AbortController();
    comparison = owned;
    controls();
    $("#diff-status").textContent = "Comparing exact values locally…";
    try {
      const value = await runDiffTask(
        {
          kind: "compare",
          before: model("before"),
          after: model("after"),
          key: key.value,
        },
        { signal: owned.signal },
      );
      if (token !== revision) return;
      result = value;
      flat = reportRows(result);
      page = 0;
      $("#diff-filter").value = "all";
      render();
      resultPanel.hidden = false;
      discovery.complete("success", true);
      $("#diff-status").textContent =
        "Comparison ready. Review changes before using the report.";
      resultPanel.focus({ preventScroll: true });
      resultPanel.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    } catch (e) {
      if (token === revision && e.name !== "AbortError") error(e.message, true);
    } finally {
      if (token === revision) {
        comparison = null;
        controls();
      }
    }
  });
  function render() {
    const c = result.counts;
    $("#diff-counts").textContent =
      `${c.added} added · ${c.removed} removed · ${c.changed} changed · ${c.unchanged} unchanged rows`;
    $("#diff-columns").textContent =
      `Added columns: ${result.columns.added.join(", ") || "none"} · Removed columns: ${result.columns.removed.join(", ") || "none"}`;
    renderPage();
    controls();
  }
  function renderPage() {
    const filter = $("#diff-filter").value,
      rows = filter === "all" ? flat : flat.filter((r) => r[0] === filter),
      pages = Math.max(1, Math.ceil(rows.length / 100));
    page = Math.min(page, pages - 1);
    const body = $("#diff-rows");
    body.replaceChildren();
    for (const row of rows.slice(page * 100, page * 100 + 100)) {
      const tr = document.createElement("tr");
      tr.dataset.status = row[0];
      for (const value of row.slice(0, 5)) {
        const td = document.createElement("td");
        td.textContent =
          value === null
            ? "∅ (missing)"
            : value === ""
              ? "(blank)"
              : String(value);
        tr.append(td);
      }
      body.append(tr);
    }
    $("#diff-page").textContent =
      `Page ${page + 1} of ${pages} · ${rows.length} report entries`;
    $("#diff-previous").disabled = page === 0;
    $("#diff-next").disabled = page >= pages - 1;
  }
  $("#diff-filter").addEventListener("change", () => {
    if (result) {
      page = 0;
      renderPage();
    }
  });
  $("#diff-previous").addEventListener("click", () => {
    if (result && page) {
      page--;
      renderPage();
    }
  });
  $("#diff-next").addEventListener("click", () => {
    if (result) {
      page++;
      renderPage();
    }
  });
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("#diff-csv").addEventListener("click", () => {
    if (result)
      download(
        "spreadsheet-diff.csv",
        exportCsv(result),
        "text/csv;charset=utf-8",
      );
  });
  $("#diff-json").addEventListener("click", () => {
    if (result)
      download(
        "spreadsheet-diff.json",
        JSON.stringify(result, null, 2),
        "application/json",
      );
  });
  $("#diff-cancel").addEventListener("click", () => {
    invalidate();
    for (const name of ["before", "after"]) {
      const s = sources[name];
      if (s.controller || s.timer) {
        resetSource(name);
        $(`#diff-${name}-file`).value = "";
      }
    }
    updateKeys();
    $("#diff-status").textContent =
      "Processing cancelled. Choose the file again or edit CSV to retry.";
  });
  $("#diff-clear").addEventListener("click", () => {
    invalidate();
    for (const name of ["before", "after"]) {
      resetSource(name);
      $(`#diff-${name}`).value = "";
      $(`#diff-${name}-file`).value = "";
    }
    keyPreference = "";
    updateKeys();
    $("#diff-status").textContent = "Choose two files or paste CSV to begin.";
  });
  $("#diff-example").addEventListener("click", () => {
    if (
      (Object.values(sources).some((s) => s.sheets.length) ||
        $("#diff-before").value ||
        $("#diff-after").value) &&
      !confirm("Replace current inputs with the example?")
    )
      return;
    $("#diff-before").value =
      "SKU,Product,Quantity\n000123,Notebook,12\n000456,Desk lamp,3";
    $("#diff-after").value =
      "SKU,Product,Quantity\n000123,Notebook,13\n000789,USB cable,25";
    keyPreference = "SKU";
    changedText("before");
    changedText("after");
  });
  root.dataset.ready = "true";
  $("#diff-feedback-error").hidden = true;
  for (const name of ["before", "after"]) {
    if ($(`#diff-${name}-file`).files?.[0])
      loadFile(name, $(`#diff-${name}-file`).files[0]);
    else if ($(`#diff-${name}`).value.trim()) changedText(name);
  }
  controls();
}
