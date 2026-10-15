import test from "node:test";
import assert from "node:assert/strict";
import { createEntitiesInterpretation } from "./entities.js";

const input = {
  text: "Ada Ben Cal Dan Eve Fox",
  definitions: "Person: a named human",
};
function answer(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(
    weights.map((w, i) => [`w${i}`, w / total]),
  );
  probabilities.none = 0;
  const choice = Object.keys(probabilities).reduce((a, b) =>
    probabilities[b] >= probabilities[a] ? b : a,
  );
  return { choice, probabilities };
}

test("ordered composition matches exhaustive maximum-product assignments", () => {
  let seed = 8137;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let trial = 0; trial < 250; trial++) {
    const rows = Array.from({ length: 3 }, () => {
      const a = Array.from({ length: 6 }, () => random() % 5);
      if (!a.some(Boolean)) a[0] = 1;
      return answer(a);
    });
    const starts = Object.fromEntries(
      rows.map((a, i) => [`t0_m${i}_start`, a]),
    );
    const before = structuredClone(starts);
    let expected = -Infinity;
    for (let a = 0; a < 4; a++)
      for (let b = a + 1; b < 5; b++)
        for (let c = b + 1; c < 6; c++) {
          const p =
            rows[0].probabilities[`w${a}`] *
            rows[1].probabilities[`w${b}`] *
            rows[2].probabilities[`w${c}`];
          if (p > 0) expected = Math.max(expected, Math.log(p));
        }
    const spec = createEntitiesInterpretation(input);
    if (expected === -Infinity)
      assert.throws(() => spec.followup(starts), /Inconsistent entity starts/);
    else {
      const mentions = spec.followup(starts).state.confirmedMentions;
      const indices = mentions.map((m) => Number(m.start.id.slice(1)));
      assert.ok(indices[0] < indices[1] && indices[1] < indices[2]);
      const actual = mentions.reduce(
        (score, m, i) => score + Math.log(rows[i].probabilities[m.start.id]),
        0,
      );
      assert.ok(
        Math.abs(actual - expected) < 1e-12,
        JSON.stringify({ trial, actual, expected }),
      );
    }
    assert.deepEqual(
      starts,
      before,
      "Raw provider answers must stay unchanged",
    );
  }
});

test("zero-mass alternatives cannot fabricate a feasible ordered assignment", () => {
  const starts = Object.fromEntries(
    [0, 1, 2].map((n) => [`t0_m${n}_start`, answer([1, 0, 0, 0, 0, 0])]),
  );
  assert.throws(
    () => createEntitiesInterpretation(input).followup(starts),
    /Inconsistent entity starts/,
  );
});

test("composition preserves absent slots and rejects gaps", () => {
  const spec = createEntitiesInterpretation(input),
    none = { choice: "none", probabilities: { none: 1 } };
  const starts = {
    t0_m0_start: answer([1, 0, 0, 0, 0, 0]),
    t0_m1_start: none,
    t0_m2_start: none,
  };
  const followup = spec.followup(starts);
  assert.equal(followup.state.confirmedMentions.length, 1);
  assert.deepEqual(Object.keys(followup.questions), ["t0_m0_end"]);
  assert.throws(
    () => spec.followup({ ...starts, t0_m2_start: answer([0, 0, 1, 0, 0, 0]) }),
    /Inconsistent entity starts/,
  );
  assert.throws(
    () =>
      spec.followup({
        ...starts,
        t0_m0_start: { choice: "w999", probabilities: { w999: 1 } },
      }),
    /Inconsistent entity starts/,
  );
});
