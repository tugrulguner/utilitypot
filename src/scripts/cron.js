import { explainCron } from "../lib/utilities/cron.js";
import { resultDiscovery } from "../lib/discovery.js";
import { failureProperties } from "../lib/utilities/analytics-failure.js";
const root = document.querySelector('[data-utility="cron"]');
if (root) {
  const $ = (id) => root.querySelector(`#${id}`),
    result = $("results"),
    discovery = resultDiscovery(root.querySelector("[data-result-discovery]"));
  let output = "";
  const capture = (event, properties) => {
    try {
      globalThis.posthog?.capture(
        event,
        { tool: "cron_explainer", ...properties },
        { send_instantly: true },
      );
    } catch {
      /* Optional analytics never controls calculation. */
    }
  };
  const status = (text, error = false) => {
    $("utility-status").textContent = text;
    $("utility-status").classList.toggle("error", error);
  };
  const invalidate = () => {
    output = "";
    result.hidden = true;
    $("copy").disabled = true;
    $("download").disabled = true;
    discovery.reset();
  };
  const element = (tag, text) => {
    const n = document.createElement(tag);
    n.textContent = text;
    return n;
  };
  for (const input of root.querySelectorAll("input"))
    input.addEventListener("input", () => {
      invalidate();
      input.removeAttribute("aria-invalid");
      status("Schedule changed. Show the next five runs to recalculate.");
    });
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  for (const id of ["cron-schedule-zone", "cron-display-zone"])
    if (!$(id).value) $(id).value = detected;
  let zones = [
    "UTC",
    detected,
    "America/New_York",
    "Europe/London",
    "Asia/Kolkata",
  ];
  try {
    zones.push(...Intl.supportedValuesOf("timeZone"));
  } catch {
    /* Known IANA values and free input still work. */
  }
  $("cron-zones").replaceChildren(
    ...[...new Set(zones)].sort().map((zone) => new Option(zone, zone)),
  );
  $("load-example").addEventListener("click", () => {
    invalidate();
    $("cron-expression").value = "0 9 * * MON-FRI";
    $("cron-schedule-zone").value = "UTC";
    status(
      "Example: weekdays at 09:00 UTC. Choose the timezone your own scheduler uses.",
    );
  });
  $("cron-form").addEventListener("submit", (event) => {
    event.preventDefault();
    invalidate();
    const attempt =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const revision = discovery.reset();
    capture("utility_action_started", {
      action: "manual_run",
      attempt_id: attempt,
    });
    let outcome = "rejected",
      category = "validation";
    try {
      const now = new Date();
      const plan = explainCron({
        expression: $("cron-expression").value,
        scheduleZone: $("cron-schedule-zone").value,
        displayZone: $("cron-display-zone").value,
        now,
      });
      category = "presentation";
      outcome = "unexpected_failure";
      $("cron-explanation").textContent = plan.explanation;
      $("cron-result-zones").textContent =
        `Scheduled in ${plan.scheduleZone} · Showing ${plan.displayZone}`;
      $("cron-runs").replaceChildren(
        ...plan.runs.map((run) => {
          const li = document.createElement("li"),
            time = element("time", run.display);
          time.dateTime = run.iso;
          li.append(time);
          if (plan.scheduleZone !== plan.displayZone)
            li.append(element("span", `In schedule timezone: ${run.schedule}`));
          return li;
        }),
      );
      $("cron-fields").replaceChildren(
        ...plan.fields.map((field) => {
          const row = document.createElement("div");
          row.append(
            element("dt", `${field.label} · ${field.value}`),
            element("dd", field.description),
          );
          return row;
        }),
      );
      $("cron-notes").replaceChildren(
        ...plan.notes.map((note) => element("p", note)),
      );
      $("cron-reference").textContent =
        `Calculated strictly after ${now.toISOString()}. Preview only; this tool does not create a job.`;
      output = [
        `Cron: ${plan.expression}`,
        `Schedule timezone: ${plan.scheduleZone}`,
        `Display timezone: ${plan.displayZone}`,
        `Starting after: ${now.toISOString()}`,
        "",
        plan.explanation,
        "",
        ...plan.runs.map(
          (run, i) =>
            `${i + 1}. ${run.display}\n   Schedule: ${run.schedule}\n   UTC: ${run.iso}`,
        ),
        "",
        ...plan.notes,
      ].join("\n");
      result.hidden = false;
      $("copy").disabled = false;
      $("download").disabled = false;
      status("Five upcoming runs calculated locally. No job was created.");
      result.focus({ preventScroll: true });
      result.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
      outcome = "success";
    } catch (error) {
      invalidate();
      status(
        category === "validation"
          ? error.message
          : "The result could not be displayed. Try again or reload this page.",
        true,
      );
    } finally {
      capture("utility_action_completed", {
        action: "manual_run",
        attempt_id: attempt,
        outcome,
        ...failureProperties(outcome, category),
      });
      discovery.complete(outcome, !result.hidden, revision);
    }
  });
  $("copy").addEventListener("click", async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      capture("utility_output_copy_succeeded", { action: "copy_result" });
      status("Run times copied.");
    } catch {
      status("Clipboard is unavailable. Download the run times instead.", true);
    }
  });
  $("download").addEventListener("click", () => {
    if (!output) return;
    capture("utility_output_download_requested", { action: "download_result" });
    const url = URL.createObjectURL(
      new Blob([output], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "cron-run-times.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("run").disabled = false;
  $("load-example").disabled = false;
  document.querySelector("#cron-startup").hidden = true;
}
