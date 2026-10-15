import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "utility-worker.spec.mjs",
  workers: 1,
  outputDir: "test-results-worker",
  use: { baseURL: "http://127.0.0.1:4541" },
  webServer: {
    command:
      "npx wrangler dev --local --ip 127.0.0.1 --port 4541 --inspector-port 4542",
    url: "http://127.0.0.1:4541/tools/",
    reuseExistingServer: false,
    timeout: 60000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
