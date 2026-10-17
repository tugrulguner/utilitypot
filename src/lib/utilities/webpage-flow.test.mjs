import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPageText } from "./webpage.js";
test("flow-level card links preserve rows and field boundaries without splitting nested wordmarks", () => {
  const html =
    '<main><a href="#dexpot"><span>Build a Python API.</span><strong><span>dex</span><span>pot</span></strong></a><a href="#intpot"><span>Expose typed tools.</span><strong><span>int</span><span>pot</span></strong></a></main>';
  assert.equal(
    extractPageText(html),
    "Build a Python API.\ndexpot\n\nExpose typed tools.\nintpot",
  );
});
test("ordinary inline links retain paragraph flow and exact joined wordmark text", () => {
  assert.equal(
    extractPageText(
      '<main><p>The <a href="https://modepot.io"><strong><span>Mode</span><span>pot</span></strong></a> family works.</p></main>',
    ),
    "The Modepot family works.",
  );
});
test("adjacent same-tag wordmark parts in a standalone link are not fabricated separate words", () => {
  assert.equal(
    extractPageText(
      '<main><a href="#modepot"><span>mode</span><span>pot</span></a></main>',
    ),
    "modepot",
  );
});
