// Explicit synthetic UI fixtures, never evidence of hosted Jev semantics.
import { fulfillEntityDocumentFixture } from "./helpers/entity-document-fixture.mjs";
export const exampleEntities = [
  { type: "Person", text: "Ada", start: 0, end: 3 },
  { type: "Organization", text: "Acme Labs", start: 13, end: 22 },
];
export const approvalGraph = {
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
};
export async function fixturePlan(page, plan, confidence = {}) {
  await page.route("**/api/utilities/interpret", (route) =>
    fulfillEntityDocumentFixture(
      route,
      { json: { source: "jev", model: "fixture", plan, confidence } },
      () => page.locator("#source-text").inputValue(),
    ),
  );
}
export async function exampleInterpretation(page, slug) {
  if (slug === "entity-extractor") {
    await fixturePlan(page, { entities: exampleEntities });
    await page.locator("#extra-ask").click();
  } else if (slug === "text-to-mermaid") {
    await fixturePlan(page, { graph: approvalGraph });
    await page.locator("#create-diagram").click();
  }
}
export const answeredSource = (text) => ({
  status: "answered",
  excerpts: [{ id: "p0", text, start: 0, end: text.length }],
});
