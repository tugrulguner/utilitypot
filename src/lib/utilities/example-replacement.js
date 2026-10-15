// Compare all controls, including auxiliary settings and files, before any mutation.
export function exampleReplacementGuard(root) {
  const snapshot = (defaults = false) =>
    JSON.stringify(
      [...root.querySelectorAll("input, textarea, select")].map((el) => [
        el.id,
        defaults
          ? el.tagName === "SELECT"
            ? (
                [...el.options].find((option) => option.defaultSelected) ||
                el.options[0]
              )?.value || ""
            : ["checkbox", "radio"].includes(el.type)
              ? (el.getAttribute("value") ?? "on")
              : el.defaultValue
          : el.value,
        defaults ? el.defaultChecked : el.checked,
        defaults ? 0 : el.files?.length || 0,
      ]),
    );
  const initial = snapshot(true);
  return () =>
    snapshot() === initial ||
    window.confirm(
      "Replace your current inputs and results with sample data? Pending work will be discarded.",
    );
}
