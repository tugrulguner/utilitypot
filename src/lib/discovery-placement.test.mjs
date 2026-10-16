import test from "node:test";
import assert from "node:assert/strict";
import { discoveryProperties } from "./discovery.js";
test("existing header/footer discovery destinations reuse portfolio intent events", () => {
  for (const surface of ["header", "footer"]) {
    assert.deepEqual(discoveryProperties("modepot", surface), {
      event: "modepot_clicked",
      properties: {
        destination: "https://modepot.io/",
        surface: `utility_${surface}`,
      },
    });
    assert.deepEqual(discoveryProperties("creator", surface), {
      event: "creator_profile_clicked",
      properties: {
        destination: "https://tugrul.modepot.io/",
        surface: `utility_${surface}`,
      },
    });
  }
  assert.equal(discoveryProperties("creator", "visitor_input"), null);
});
