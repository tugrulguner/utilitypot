import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createEntitiesInterpretation, entityTokens } from "./entities.js";
test("endpoint choices show complete exact source spans instead of isolated surname tokens", () => {
  const input = {
    text: "Alex Rivera joined Pine Studio. Morgan Lee met Alex Rivera.",
    definitions:
      "Person: a named human\nOrganization: a named company or employer",
  };
  const spec = createEntitiesInterpretation(input),
    tokens = spec.state.tokens;
  const starts = Object.fromEntries(
    Object.keys(spec.questions).map((k) => [k, { choice: "none" }]),
  );
  const people = tokens.filter((t) => ["Alex", "Morgan"].includes(t.text));
  people.forEach((t, i) => (starts[`t0_m${i}_start`] = { choice: t.id }));
  starts.t1_m0_start = { choice: tokens.find((t) => t.text === "Pine").id };
  const next = spec.followup(starts),
    ends = {};
  for (const [i, start] of people.entries()) {
    const end = tokens[tokens.indexOf(start) + 1];
    assert.deepEqual(next.questions[`t0_m${i}_end`].criteria[end.id], {
      text: input.text.slice(start.start, end.end),
      endToken: end.id,
    });
    assert.equal(
      next.questions[`t0_m${i}_end`].criteria[start.id].text,
      start.text,
    );
    ends[`t0_m${i}_end`] = { choice: end.id };
  }
  const studio = tokens.find((t) => t.text === "Studio");
  ends.t1_m0_end = { choice: studio.id };
  assert.equal(
    next.questions.t1_m0_end.criteria[studio.id].text,
    "Pine Studio",
  );
  assert.equal(
    Object.keys(spec.questions).length + Object.keys(next.questions).length,
    10,
  );
  const plan = next.decode(ends);
  assert.deepEqual(
    plan.entities.map((e) => e.text),
    ["Alex Rivera", "Morgan Lee", "Alex Rivera", "Pine Studio"],
  );
  for (const e of plan.entities)
    assert.equal(input.text.slice(e.start, e.end), e.text);
});
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
  assert.throws(
    () => followup.decode({ ...ends, t0_m1_end: { choice: "none" } }),
    /Inconsistent entity boundaries/,
  );
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

test("captured duplicate start winners compose into distinct source-ordered mentions", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/entities-duplicate-starts-jev-1.13.0.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const spec = createEntitiesInterpretation(captured.input);
  const followup = spec.followup(captured.provider.answers);
  assert.deepEqual(
    followup.state.confirmedMentions.map((m) => m.start.id),
    ["w0", "w5", "w11", "w3", "w9"],
  );
  const plan = followup.decode(
    Object.fromEntries(
      Object.entries({
        t0_m0_end: "w1",
        t0_m1_end: "w6",
        t0_m2_end: "w12",
        t1_m0_end: "w4",
        t1_m1_end: "w10",
      }).map(([key, choice]) => [key, { choice }]),
    ),
  );
  assert.deepEqual(
    plan.entities.map((e) => e.text),
    ["Mina Patel", "Noah Chen", "Mina Patel", "Orion Labs", "Cedar Systems"],
  );
  for (const e of plan.entities)
    assert.equal(captured.input.text.slice(e.start, e.end), e.text);
  assert.equal(
    captured.provider.answers.t0_m1_start.choice,
    "w11",
    "Never rewrite the raw provider answers",
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
