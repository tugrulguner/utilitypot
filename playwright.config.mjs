import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: "utility-worker.spec.mjs",
  use: { baseURL: "http://127.0.0.1:4417" },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4417",
    url: "http://127.0.0.1:4417",
    reuseExistingServer: false,
  },
});
