import { test, expect } from "@playwright/test";
test("header footer and homepage attribution retain canonical navigation and explicit telemetry", async ({
  page,
}) => {
  await page.route("**/*posthog.com/**", (r) => r.abort());
  await page.goto("/tools/json-to-csv/");
  await page.evaluate(() => {
    window.__events = [];
    window.posthog.capture = (event, properties) =>
      window.__events.push({ event, properties });
    document.addEventListener("click", (e) => {
      if (e.target.closest("a[data-discovery-destination]")) {
        window.__navigationPreserved = e.defaultPrevented === false;
        e.preventDefault();
      }
    });
  });
  await page
    .locator('header .family-nav a[data-discovery-destination="modepot"]')
    .click();
  await page
    .locator('header .family-nav a[data-discovery-destination="creator"]')
    .click();
  await page.locator('footer a[data-discovery-destination="modepot"]').click();
  await page.locator('footer a[data-discovery-destination="creator"]').click();
  expect(await page.evaluate(() => window.__navigationPreserved)).toBe(true);
  expect(await page.evaluate(() => window.__events)).toEqual([
    {
      event: "modepot_clicked",
      properties: {
        destination: "https://modepot.io/",
        surface: "utility_header",
      },
    },
    {
      event: "creator_profile_clicked",
      properties: {
        destination: "https://tugrul.modepot.io/",
        surface: "utility_header",
      },
    },
    {
      event: "modepot_clicked",
      properties: {
        destination: "https://modepot.io/",
        surface: "utility_footer",
      },
    },
    {
      event: "creator_profile_clicked",
      properties: {
        destination: "https://tugrul.modepot.io/",
        surface: "utility_footer",
      },
    },
  ]);
  await page.goto("/");
  for (const target of ["modepot", "creator"])
    await expect(
      page.locator(`.creator-credit a[data-discovery-destination="${target}"]`),
    ).toHaveClass(/ph-no-autocapture/);
});
