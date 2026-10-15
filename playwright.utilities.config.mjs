import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "utility-worker.spec.mjs",
  workers: 1,
  outputDir: "test-results-worker",
  use: { baseURL: "http://127.0.0.1:4398" },
  webServer: {
    command:
      "npx wrangler dev --local --ip 127.0.0.1 --port 4398 --inspector-port 9398",
    url: "http://127.0.0.1:4398/tools/",
    reuseExistingServer: false,
    timeout: 60000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
