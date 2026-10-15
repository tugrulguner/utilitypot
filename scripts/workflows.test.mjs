import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { parse as jsonc } from "jsonc-parser";

test("deployment and release workflows preserve family execution boundaries", async () => {
  const read = async (name) =>
    parse(await readFile(`.github/workflows/${name}.yml`, "utf8"));
  const ci = await read("ci"),
    deploy = await read("deploy-website"),
    release = await read("release");
  assert.ok("workflow_call" in ci.on);
  assert.deepEqual(deploy.on.push.branches, ["main"]);
  assert.ok("workflow_dispatch" in deploy.on);
  assert.equal(deploy.concurrency["cancel-in-progress"], false);
  assert.equal(deploy.jobs.ci.uses, "./.github/workflows/ci.yml");
  assert.equal(deploy.jobs.deploy.needs, "ci");
  assert.equal(deploy.jobs.deploy.if, "github.ref == 'refs/heads/main'");
  assert.equal(deploy.jobs.deploy.environment.name, "production");
  assert.equal(
    deploy.jobs.deploy.env.CLOUDFLARE_API_TOKEN,
    "${{ secrets.CLOUDFLARE_API_TOKEN }}",
  );
  assert.deepEqual(release.on.push.tags, ["v*"]);
  assert.equal(release.jobs.build.needs, "ci");
  assert.equal(release.jobs["github-release"].needs, "build");
  assert.equal(release.permissions.contents, "read");
  assert.equal(release.jobs["github-release"].permissions.contents, "write");
  const verify = ci.jobs.verify.steps.map((s) => s.run ?? "").join("\n");
  assert.match(verify, /test:release-artifact/);
  assert.match(verify, /test:release/);
  assert.match(
    release.jobs.build.steps.map((s) => s.run ?? "").join("\n"),
    /merge-base --is-ancestor/,
  );
  const publish = release.jobs["github-release"].steps.at(-1).run;
  assert.ok(
    publish.indexOf("sha256sum --check") < publish.indexOf("gh release create"),
  );
  assert.match(publish, /--verify-tag/);
  for (const workflow of [ci, deploy, release])
    for (const job of Object.values(workflow.jobs))
      for (const step of job.steps ?? [])
        if (step.uses) assert.match(step.uses, /@[0-9a-f]{40}$/);
  const tsconfig = JSON.parse(await readFile("tsconfig.json", "utf8"));
  for (const generated of ["release", ".release-worker", ".wrangler"])
    assert.ok(tsconfig.exclude.includes(generated));
  const config = jsonc(await readFile("wrangler.jsonc", "utf8"));
  assert.equal(config.name, "utilitypot-site");
  assert.deepEqual(config.routes, [
    { pattern: "utilitypot.modepot.io", custom_domain: true },
  ]);
});
