import { readFile, writeFile, mkdir, cp, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "jsonc-parser";

const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;
export function validateRelease(
  tag,
  version,
  changelog,
  today = new Date().toISOString().slice(0, 10),
) {
  if (!semver.test(version) || tag !== `v${version}`)
    throw Error("Tag must exactly equal v<package.json version>.");
  const headings = [...changelog.matchAll(/^## \[([^\]]+)\]([^\n]*)\n/gm)];
  const matches = headings.filter((m) => m[1] === version);
  if (matches.length !== 1)
    throw Error(
      "Need exactly one versioned changelog section. Prepare the release before tagging.",
    );
  const match = matches[0];
  if (match[2].trim() !== `- ${today}`)
    throw Error("Release changelog must use the publication UTC date.");
  const end =
    headings.find((m) => m.index > match.index)?.index ?? changelog.length;
  const notes = changelog.slice(match.index + match[0].length, end).trim();
  if (!notes || !/^[-*] \S/m.test(notes))
    throw Error("Release notes must contain user-visible changes.");
  return notes;
}
export async function verifyChecksums(dir) {
  const lines = (await readFile(join(dir, "SHA256SUMS"), "utf8"))
    .trim()
    .split("\n");
  if (!lines.length) throw Error("Missing checksum entries.");
  const seen = new Set();
  for (const line of lines) {
    const m = /^([a-f0-9]{64}) {2}([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line);
    if (!m || seen.has(m[2]))
      throw Error("Unsafe or duplicate checksum entry.");
    seen.add(m[2]);
    if (
      createHash("sha256")
        .update(await readFile(join(dir, m[2])))
        .digest("hex") !== m[1]
    )
      throw Error("Artifact checksum mismatch.");
  }
  const archives = (await readdir(dir)).filter((name) =>
    name.endsWith(".tar.gz"),
  );
  if (archives.length !== 1 || !seen.has(archives[0]))
    throw Error("Expected exactly one checksummed website archive.");
}
export async function buildBundle(root = process.cwd()) {
  const version = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  ).version;
  if (!semver.test(version)) throw Error("Invalid package version.");
  const output = join(root, "release");
  await mkdir(output, { recursive: true });
  const stage = join(output, "site");
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await cp(join(root, "dist"), join(stage, "assets"), { recursive: true });
  const workerOut = join(root, ".release-worker");
  await rm(workerOut, { recursive: true, force: true });
  execFileSync(
    process.execPath,
    [
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "deploy",
      "--dry-run",
      "--outdir",
      workerOut,
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  await cp(workerOut, join(stage, "worker"), { recursive: true });
  await readFile(join(stage, "worker/index.js")); // Fail if Wrangler changes its emitted entrypoint.
  const errors = [];
  const config = parse(
    await readFile(join(root, "wrangler.jsonc"), "utf8"),
    errors,
    { allowTrailingComma: true },
  );
  if (errors.length) throw Error("Invalid source Worker configuration.");
  delete config.$schema;
  config.main = "worker/index.js";
  config.assets.directory = "./assets";
  await writeFile(
    join(stage, "wrangler.json"),
    JSON.stringify(config, null, 2) + "\n",
  );
  await cp(join(root, "LICENSE"), join(stage, "LICENSE"));
  await writeFile(
    join(stage, "BUILD.json"),
    JSON.stringify(
      {
        version,
        commit: execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: root,
          encoding: "utf8",
        }).trim(),
      },
      null,
      2,
    ) + "\n",
  );
  // Check the exact bundled Worker and assets independently before archiving.
  execFileSync(
    process.execPath,
    [
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "deploy",
      "--config",
      join(stage, "wrangler.json"),
      "--dry-run",
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  const filename = `utilitypot-v${version}-site.tar.gz`;
  execFileSync("tar", ["-czf", join(output, filename), "-C", stage, "."], {
    cwd: root,
  });
  const hash = createHash("sha256")
    .update(await readFile(join(output, filename)))
    .digest("hex");
  await writeFile(join(output, "SHA256SUMS"), `${hash}  ${filename}\n`);
  await verifyChecksums(output);
  const extracted = join(output, "extracted");
  await rm(extracted, { recursive: true, force: true });
  await mkdir(extracted, { recursive: true });
  execFileSync("tar", ["-xzf", join(output, filename), "-C", extracted], {
    cwd: root,
  });
  console.log(`Verified deployment bundle: ${filename}`);
  return join(output, filename);
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const command = process.argv[2];
  if (command === "verify") {
    const version = JSON.parse(await readFile("package.json", "utf8")).version;
    const notes = validateRelease(
      process.argv[3],
      version,
      await readFile("CHANGELOG.md", "utf8"),
    );
    await mkdir("release", { recursive: true });
    await writeFile("release/RELEASE_NOTES.md", notes + "\n");
  } else if (command === "bundle") await buildBundle();
  else if (command === "checksums")
    await verifyChecksums(process.argv[3] ?? "release");
  else throw Error("Use verify <tag>, bundle, or checksums [directory].");
}
