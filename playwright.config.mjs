import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: "utility-worker.spec.mjs",
  use: { baseURL: "http://127.0.0.1:4387" },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4387",
    url: "http://127.0.0.1:4387",
    reuseExistingServer: false,
  },
});
