import test from "node:test";
import assert from "node:assert/strict";
import {
  groupCsv,
  recordChoices,
  sequentialGraph,
  sourceMention,
} from "./outcome.js";
test("default grouping preserves literal header meaning and every string", () => {
  assert.deepEqual(
    groupCsv("Client ID,a.b,items\n001,02,x\n001,03,y", "Client ID"),
    [
      {
        "Client ID": "001",
        rows: [
          { "a.b": "02", items: "x" },
          { "a.b": "03", items: "y" },
        ],
      },
    ],
  );
});
test("grouping rejects missing keys and conflicting parent choices", () => {
  assert.throws(
    () => groupCsv("id,name\n1,A\n1,B", "id", ["name"]),
    /Conflicting/,
  );
  assert.throws(() => groupCsv("id,name\n1,A", "missing"), /group/);
  assert.throws(() => groupCsv("rows,id\nx,1", "rows"), /child/);
});
test("array choices report counts, never guess between arrays", () => {
  assert.deepEqual(
    recordChoices({ a: [{ id: 1 }], b: [{ id: 2 }, { id: 3 }] }),
    [
      { path: "a", count: 1 },
      { path: "b", count: 2 },
    ],
  );
});
test("manual graph is bounded and does not infer branches", () => {
  assert.equal(sequentialGraph("Start\nEnd").edges[0].to, "n1");
  assert.throws(() => sequentialGraph(Array(9).fill("step").join("\n")), /1–8/);
});
test("mention correction selects an exact occurrence without offset arithmetic", () => {
  assert.deepEqual(sourceMention("Ada met Ada", "Person", "Ada", 1), {
    type: "Person",
    text: "Ada",
    start: 8,
    end: 11,
  });
  assert.throws(() => sourceMention("Ada", "Person", "Invented", 0), /source/);
});
test("default grouping keeps blank-group and unsafe-key failure boundaries", () => {
  assert.throws(() => groupCsv("id,name\n ,Ada", "id"), /Blank grouping/);
  assert.throws(
    () => groupCsv("id,name\n1,Ada", "id", [], "__proto__"),
    /child/,
  );
});
