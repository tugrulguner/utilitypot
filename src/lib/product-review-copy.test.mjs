import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("task directory tells visitors which tools are local or use AI", async () => {
  const tools = JSON.parse(
    await readFile(new URL("../data/tools.json", import.meta.url), "utf8"),
  );
  assert.equal(tools.length, 11);
  assert.equal(
    tools.filter((tool) => tool.processing === "In your browser").length,
    8,
  );
  assert.equal(
    tools.find((tool) => tool.slug === "cron-explainer")?.processing,
    "In your browser",
  );
  for (const tool of tools)
    assert.equal(
      tool.processing,
      ["entities", "diagram", "qa"].includes(tool.tool)
        ? "Uses AI"
        : "In your browser",
    );
  const home = await readFile(
    new URL("../pages/index.astro", import.meta.url),
    "utf8",
  );
  assert.match(home, /class="coordinate tool-processing">\{processing\}/);
  assert.match(home, /Add your input\. Preview the result\./);
  assert.match(home, /bounded\s+AI\s+only\s+after\s+you\s+ask/);
  assert.match(home, /utilitypot-lockup-v2\.png\?v=local-tools-11/);
  assert.match(home, /Created by/);
});
test("date limitations appear before the input rather than only inside hidden help", async () => {
  const page = await readFile(
    new URL("../pages/tools/fix-excel-dates.astro", import.meta.url),
    "utf8",
  ).then((text) => text.replace(/\s+/g, " "));
  assert.ok(
    page.indexOf("Excel serial numbers, timestamps and spreadsheet files") <
      page.indexOf('<UtilityApp tool="dates"'),
  );
  assert.ok(page.includes("For date text only."));
});
