import { test, expect } from "@playwright/test";
test("cron computation tolerates unavailable analytics and never uploads input", async ({
  page,
}) => {
  await page.route("**/*posthog.com/**", (r) => r.abort());
  const events = [];
  await page.exposeFunction("recordCronEvent", (name, properties) =>
    events.push({ name, properties }),
  );
  await page.goto("/tools/cron-explainer/");
  await expect(
    page.getByRole("button", { name: "Show next five runs", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    globalThis.posthog.capture = (name, props) => {
      globalThis.recordCronEvent(name, props);
      throw Error("Controlled analytics outage");
    };
  });
  await page
    .getByLabel("Cron expression", { exact: true })
    .fill("*/15 * * * *");
  await page.getByLabel("Schedule timezone", { exact: true }).fill("UTC");
  await page
    .getByLabel("Show run times in", { exact: true })
    .fill("America/New_York");
  await page.getByLabel("Cron expression", { exact: true }).press("Enter");
  await expect(page.locator("#cron-runs > li")).toHaveCount(5);
  await expect
    .poll(
      () => events.filter((e) => e.name === "utility_action_completed").length,
    )
    .toBe(1);
  expect(events.map((e) => e.name)).toEqual([
    "utility_action_started",
    "utility_action_completed",
  ]);
  expect(events[1].properties.outcome).toBe("success");
  expect(events[0].properties.attempt_id).toBe(events[1].properties.attempt_id);
  expect(events[1].properties.tool).toBe("cron_explainer");
  expect(JSON.stringify(events)).not.toMatch(/America|New_York|\*\/15/);
});
test("cron remains honest and disabled without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/tools/cron-explainer/");
  await expect(
    page.getByRole("button", { name: "Show next five runs", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("#cron-startup")).toContainText(
    "JavaScript is required to calculate run times.",
  );
  await expect(page.locator("#results")).toBeHidden();
  await context.close();
});

test("cron sample replacement preserves user settings when cancelled", async ({
  page,
}) => {
  await page.goto("/tools/cron-explainer/");
  await page.getByLabel("Cron expression", { exact: true }).fill("17 4 * * *");
  await page
    .getByLabel("Schedule timezone", { exact: true })
    .fill("America/Chicago");
  let dialogs = 0;
  page.on("dialog", async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  await page
    .getByRole("button", { name: "Load example: weekdays", exact: true })
    .click();
  await expect.poll(() => dialogs).toBe(1);
  await expect(page.getByLabel("Cron expression", { exact: true })).toHaveValue(
    "17 4 * * *",
  );
  await expect(
    page.getByLabel("Schedule timezone", { exact: true }),
  ).toHaveValue("America/Chicago");
  page.removeAllListeners("dialog");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Load example: weekdays", exact: true })
    .click();
  await expect(page.getByLabel("Cron expression", { exact: true })).toHaveValue(
    "0 9 * * MON-FRI",
  );
  await expect(
    page.getByLabel("Schedule timezone", { exact: true }),
  ).toHaveValue("UTC");
});
