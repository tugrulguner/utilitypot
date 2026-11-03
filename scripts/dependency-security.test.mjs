import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const lock = JSON.parse(
  await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const compare = (a, b) => {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
const vulnerable = {
  "fast-uri": (v) => compare(v, "3.0.0") >= 0 && compare(v, "3.1.9") < 0,
  undici: (v) =>
    (compare(v, "7.0.0") >= 0 && compare(v, "7.30.1") < 0) ||
    (compare(v, "8.0.0") >= 0 && compare(v, "8.12.2") < 0),
  vite: (v) => compare(v, "8.3.0") >= 0 && compare(v, "8.3.2") <= 0,
  zod: (v) => compare(v, "4.6.6") < 0,
};
for (const [name, affected] of Object.entries(vulnerable))
  test(`all locked ${name} copies exclude reviewed advisory ranges`, () => {
    const copies = Object.entries(lock.packages).filter(([path]) =>
      path.endsWith("node_modules/" + name),
    );
    assert(
      Object.keys(lock.packages).length > 1,
      "Audit requires a nonempty dependency inventory",
    );
    for (const [path, meta] of copies)
      assert(
        !affected(meta.version),
        `${path}@${meta.version} is in the reviewed vulnerable range`,
      );
  });

test("CI rejects moderate-or-higher dependency findings before building", async () => {
  const { parse } = await import("yaml");
  const workflow = parse(
    await readFile(
      new URL("../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    ),
  );
  const commands = workflow.jobs.verify.steps.map((s) => s.run).filter(Boolean);
  const audit = commands.indexOf("npm audit --audit-level=moderate");
  assert(
    audit > commands.indexOf("npm ci") &&
      audit < commands.indexOf("npm run build"),
    "CI must enforce a dependency audit between locked installation and build",
  );
});

for (const file of [
  "wrangler/wrangler-dist/cli.js",
  "miniflare/dist/src/index.js",
])
  test(`bundled tooling dependencies exclude reviewed ranges: ${file}`, async () => {
    const { resolve } = await import("node:path");
    const base =
      process.env.DEPENDENCY_SECURITY_MODULES ||
      new URL("../node_modules/", import.meta.url).pathname;
    const source = await readFile(resolve(base, file), "utf8");
    const markers = [...source.matchAll(/(undici|zod)@(\d+\.\d+\.\d+)/g)];
    assert(
      markers.length > 0,
      "Tooling bundle provenance changed; review its embedded dependencies",
    );
    for (const [, name, version] of markers)
      assert(
        !vulnerable[name](version),
        `${file} embeds affected ${name}@${version}`,
      );
  });

test("locked Astro supports the project's advertised minimum Node version", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(
    new URL("../node_modules/astro/package.json", import.meta.url),
  );
  const { minVersion, satisfies } = require("semver");
  const floor = minVersion(lock.packages[""].engines.node);
  assert(
    satisfies(floor, lock.packages["node_modules/astro"].engines.node),
    "Dependency update must preserve the documented Node minimum",
  );
});
