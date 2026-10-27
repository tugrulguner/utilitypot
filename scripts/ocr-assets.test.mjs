import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../public/ocr/", import.meta.url);
test("self-hosted recognition assets match pinned manifest and static-asset size limits", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("MANIFEST.json", root), "utf8"),
  );
  assert.equal(manifest.tesseract, "7.0.0");
  assert.equal(manifest.core, "7.0.0");
  assert.equal(Object.keys(manifest.assets).length, 5);
  for (const [name, expected] of Object.entries(manifest.assets)) {
    const bytes = await readFile(new URL(name, root));
    assert.equal(bytes.length, expected.bytes, name);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      expected.sha256,
      name,
    );
    assert.ok(
      bytes.length <= 25 * 1024 * 1024,
      name + " must fit a Cloudflare asset",
    );
  }
  for (const name of ["TESSERACT-LICENSE.txt", "CORE-LICENSE.txt"])
    assert.match(await readFile(new URL(name, root), "utf8"), /Apache License/);
});
