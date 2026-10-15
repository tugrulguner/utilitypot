import test from "node:test";
import assert from "node:assert/strict";
import { createEntitiesInterpretation, entityTokens } from "./entities.js";
test("custom entities are copied from validated source spans with offsets", () => {
  const text = "Ada works at Acme Labs.";
  const spec = createEntitiesInterpretation({
    text,
    definitions: "Person: a human name\nOrganization: an employer",
  });
  const a = Object.fromEntries(
    Object.keys(spec.questions).map((k) => [k, { choice: "none" }]),
  );
  a.t0_m0_start = { choice: "w0" };
  a.t0_m0_end = { choice: "w0" };
  a.t1_m0_start = { choice: "w3" };
  a.t1_m0_end = { choice: "w4" };
  const entities = spec.decode(a).entities;
  assert.deepEqual(
    entities.map((e) => e.text),
    ["Ada", "Acme Labs"],
  );
  for (const e of entities) assert.equal(text.slice(e.start, e.end), e.text);
  assert.equal(entityTokens("Élodie met Ada.")[0].text, "Élodie");
});
