import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createEntitiesInterpretation, entityTokens } from "./entities.js";
test("repeated-mention ends are conditioned on confirmed starts and bounded before the next mention", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL("./fixtures/entities-repeated-jev-1.13.0.json", import.meta.url),
      "utf8",
    ),
  );
  const spec = createEntitiesInterpretation(captured.input);
  assert.ok(Object.keys(spec.questions).every((k) => k.endsWith("_start")));
  const starts = Object.fromEntries(
    Object.keys(spec.questions).map((k) => [k, captured.provider.answers[k]]),
  );
  const followup = spec.followup(starts);
  assert.ok(!Object.hasOwn(followup.questions.t0_m1_end.criteria, "w16"));
  assert.ok(Object.hasOwn(followup.questions.t0_m1_end.criteria, "w6"));
  const ends = {
    t0_m0_end: { choice: "w1" },
    t0_m1_end: { choice: "w6" },
    t0_m2_end: { choice: "w12" },
    t1_m0_end: { choice: "w4" },
    t1_m1_end: { choice: "w10" },
  };
  const plan = followup.decode(ends);
  assert.deepEqual(
    plan.entities.map((e) => e.text),
    ["Mina Patel", "Noah Chen", "Mina Patel", "Orion Labs", "Cedar Systems"],
  );
  for (const e of plan.entities)
    assert.equal(captured.input.text.slice(e.start, e.end), e.text);
  assert.throws(
    () => spec.decode(captured.provider.answers),
    /Invalid or overlapping entity span/,
  );
});

test("custom entities are copied from validated source spans with offsets", () => {
  const text = "Ada works at Acme Labs.";
  const spec = createEntitiesInterpretation({
    text,
    definitions: "Person: a human name\nOrganization: an employer",
  });
  const a = {};
  for (let i = 0; i < 2; i++)
    for (let n = 0; n < 3; n++)
      for (const boundary of ["start", "end"])
        a[`t${i}_m${n}_${boundary}`] = { choice: "none" };
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
