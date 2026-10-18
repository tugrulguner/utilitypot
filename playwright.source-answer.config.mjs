import base from "./playwright.config.mjs";
export default {
  ...base,
  testMatch: "source-answer-workspace.spec.mjs",
  use: { ...base.use, baseURL: "http://127.0.0.1:6210" },
  webServer: {
    ...base.webServer,
    command: "npm run preview -- --host 127.0.0.1 --port 6210",
    url: "http://127.0.0.1:6210",
    reuseExistingServer: false,
  },
};
