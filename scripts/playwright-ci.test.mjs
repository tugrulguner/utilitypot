import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const workflow = readFileSync(
  new URL(".github/workflows/ci.yml", root),
  "utf8",
);
const lock = JSON.parse(
  readFileSync(new URL("package-lock.json", root), "utf8"),
);
const version = lock.packages["node_modules/@playwright/test"].version;

for (const job of ["verify"]) {
  test(`${job} retains browser verification without runtime APT`, () => {
    const body = workflow.split(`  ${job}:\n`)[1]?.split(/\n  [\w-]+:\n/)[0];
    assert.ok(body, `missing ${job} job`);
    const image = body.match(/^      image: (\S+)$/m)?.[1];
    assert.ok(
      image?.startsWith(
        `mcr.microsoft.com/playwright:v${version}-noble@sha256:`,
      ),
    );
    assert.match(image, /@sha256:[0-9a-f]{64}$/);
    assert.ok(body.includes("options: --init --shm-size=1g"));
    assert.ok(
      body.includes(
        'git config --global --add safe.directory "$GITHUB_WORKSPACE"',
      ),
    );
    assert.ok(!body.includes("playwright install"));
    assert.ok(!body.includes("sudo --preserve-env=GITHUB_ACTIONS"));
    for (const command of {
      verify: [
        "npm ci",
        "npm audit --audit-level=moderate",
        "npm test",
        "npm run test:release",
        "npm run format:check",
        "npm run check",
        "npm run build",
        "npm run test:browser",
        "npm run test:worker",
        "npm run release:bundle",
        "npm run test:release-artifact",
      ],
    }[job])
      assert.ok(body.includes(command), command);
  });
}
