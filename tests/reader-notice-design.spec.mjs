import { test, expect } from "@playwright/test";
import { sourceAnswerFixture } from "./helpers/source-answer-fixture.mjs";
test("partial coverage stays visible without a competing card above the answer", async ({
  page,
}) => {
  const source = "Aster is an open-source workshop for software tools.";
  await page.route("**/api/utilities/interpret", (route) =>
    route.fulfill({
      json: sourceAnswerFixture(
        route.request().postDataJSON().input,
        {
          source: "jev",
          model: "PRESENTATION FIXTURE — NOT LIVE",
          confidence: {},
          plan: {
            status: "partial",
            excerpts: [
              {
                id: "one",
                start: 0,
                end: source.length,
                text: source,
                role: "direct",
              },
            ],
          },
        },
        source,
      ),
    }),
  );
  await page.goto("/tools/ask-a-webpage/");
  await page.locator("#source-text").fill(source);
  await page.locator("#instructions").fill("What is this source about?");
  await page.locator("#extra-ask").click();
  const notice = page.locator(".answer-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("may not be covered");
  const style = await notice.evaluate((el) => ({
    border: getComputedStyle(el).borderTopWidth,
    background: getComputedStyle(el).backgroundColor,
  }));
  expect(style.border).toBe("0px");
  expect(style.background).toBe("rgba(0, 0, 0, 0)");
});
