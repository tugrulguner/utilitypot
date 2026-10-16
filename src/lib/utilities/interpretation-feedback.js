const guidance = {
  csv: "Some column or grouping choices are uncertain. Review the mapping before using this JSON.",
  dates:
    "The date convention is uncertain. Check ambiguous dates against the source.",
  meeting:
    "Some availability choices are uncertain. Review each person's editable time windows.",
  jsonCsv:
    "The record or nested-array selection is uncertain. Review the selected records and array handling.",
  diagram:
    "Some flowchart choices are uncertain. Review the step types and destinations.",
};

export function interpretationReview(tool, confidence) {
  const uncertain = Object.values(confidence || {}).some(
    (value) => typeof value !== "number" || value < 0.6,
  );
  return uncertain ? guidance[tool] || "" : "";
}

export function appendInterpretationDetails(container, model) {
  const details = document.createElement("details");
  details.dataset.interpretationDetails = "";
  const summary = document.createElement("summary");
  summary.textContent = "AI processing details";
  const text = document.createElement("p");
  text.textContent = `Interpretation by Jev. Model: ${typeof model === "string" && model ? model : "not reported"}. Review the editable settings; calculations and transformations are performed by the application.`;
  details.append(summary, text);
  container.append(details);
}
