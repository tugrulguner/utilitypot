import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const basic = await readFile(
  new URL("../components/UtilityApp.astro", import.meta.url),
  "utf8",
);
const extra = await readFile(
  new URL("../components/ExtraUtilityApp.astro", import.meta.url),
  "utf8",
);
for (const action of ["Create nested JSON", "Fix dates", "Find times"])
  test(`direct action: ${action}`, () => assert.ok(basic.includes(action)));
for (const action of [
  "Convert",
  "Extract entities",
  "Create flowchart",
  "Find answer",
])
  test(`direct action: ${action}`, () => assert.ok(extra.includes(action)));
test("consent is a disclosed action, no blanket confirmation", () =>
  assert.doesNotMatch(
    basic + extra,
    /id="(?:extra-consent|ai-consent|reviewed|extra-reviewed)"/,
  ));
test("readable entity and graph editors", () => {
  assert.match(extra, /id="entity-editor"/);
  assert.match(extra, /id="graph-editor"/);
});
test("webpage sources use keyboard-accessible tabs", () =>
  assert.match(extra, /role="tablist"/));

test("NER utility is named and explained consistently", async () => {
  const page = await readFile(
    new URL("../pages/tools/entity-extractor.astro", import.meta.url),
    "utf8",
  );
  const tools = await readFile(
    new URL("../data/tools.json", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../styles/entity-results.css", import.meta.url),
    "utf8",
  );
  assert.match(page, /Extract named entities/);
  assert.match(page, /Named Entity Recognition/);
  assert.match(tools, /Extract named entities/);
  assert.match(css, /data-category-slot="0"/);
  assert.match(css, /data-category-slot="3"/);
});
