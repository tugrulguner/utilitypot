import test from "node:test";
import assert from "node:assert/strict";
import { validateRelease, verifyChecksums } from "./release.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

test("release gates require exact tag/version and a dated nonempty changelog section", () => {
  const notes =
    "# Changelog\n\n## [Unreleased]\nFuture work.\n\n## [0.1.0] - 2026-10-15\n\n### Added\n- Seven reviewed utilities.\n\n## [0.0.1] - 2026-10-01\nOlder.\n";
  assert.equal(
    validateRelease("v0.1.0", "0.1.0", notes, "2026-10-15"),
    "### Added\n- Seven reviewed utilities.",
  );
  for (const [tag, version, text, day] of [
    ["v0.2.0", "0.1.0", notes, "2026-10-15"],
    ["0.1.0", "0.1.0", notes, "2026-10-15"],
    ["v0.1.0", "0.1.0", "# Changelog\n## [Unreleased]\nNew.", "2026-10-15"],
    ["v0.1.0", "0.1.0", notes, "2026-10-16"],
    ["v0.1.0", "0.1.0", "## [0.1.0] - 2026-10-15\n\n", "2026-10-15"],
    ["v0.1.0", "0.1.0", notes + notes, "2026-10-15"],
  ])
    assert.throws(() => validateRelease(tag, version, text, day));
});
test("release checksum verification rejects missing, modified and escaping artifacts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "utilitypot-release-"));
  try {
    await writeFile(join(dir, "site.tar.gz"), "real artifact");
    const hash = createHash("sha256").update("real artifact").digest("hex");
    await writeFile(join(dir, "SHA256SUMS"), `${hash}  site.tar.gz\n`);
    await verifyChecksums(dir);
    await writeFile(join(dir, "site.tar.gz"), "modified");
    await assert.rejects(() => verifyChecksums(dir));
    await writeFile(join(dir, "SHA256SUMS"), `${hash}  ../site.tar.gz\n`);
    await assert.rejects(() => verifyChecksums(dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
