import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const tools = JSON.parse(
  readFileSync(new URL("../src/data/tools.json", import.meta.url), "utf8"),
);
test("homepage advert is singular, disclosed and follows the tool directory", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".partner-card")).toHaveCount(1);
  await expect(page.locator(".partner-label")).toHaveText(
    "Partner advertisement",
  );
  const tools = await page.locator("#tools").boundingBox(),
    card = await page.locator(".partner-card").boundingBox();
  expect(card.y).toBeGreaterThanOrEqual(tools.y + tools.height);
  await expect(page.locator(".partner-card a")).toHaveAttribute(
    "href",
    "https://circlesandcookies.com/",
  );
});
for (const { slug } of tools) {
  test(`${slug}: one disclosed partner, no ad inside private input or output`, async ({
    page,
  }) => {
    await page.goto(`/tools/${slug}/`);
    await expect(page.locator(".partner-card")).toHaveCount(1);
    await expect(page.locator(".partner-label")).toHaveText(
      "Partner advertisement",
    );
    await expect(page.locator(".utility-app .partner-card")).toHaveCount(0);
    await expect(page.locator(".partner-cta")).toHaveAttribute(
      "target",
      "_blank",
    );
    await expect(page.locator(".partner-cta")).toHaveAttribute(
      "rel",
      "sponsored noopener",
    );
    expect(
      await page
        .locator(".partner-card")
        .evaluate((e) => !e.querySelector("script,iframe,form,input")),
    ).toBe(true);
  });
}
