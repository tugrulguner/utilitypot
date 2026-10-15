import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "utility-worker.spec.mjs",
  workers: 1,
  outputDir: "test-results-artifact",
  use: { baseURL: "http://127.0.0.1:4419" },
  webServer: {
    command:
      "npx wrangler dev --config release/extracted/wrangler.json --local --ip 127.0.0.1 --port 4419 --inspector-port 9419",
    url: "http://127.0.0.1:4419/tools/",
    reuseExistingServer: false,
    timeout: 60000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
