import { test, expect } from "@playwright/test";
import { sourceAnswerFixture } from "./helpers/source-answer-fixture.mjs";
const route = "/tools/ask-a-webpage/";

const source = "Useful evidence answers the question clearly.";
function result(input) {
  const start = source.indexOf("Useful evidence");
  return sourceAnswerFixture(
    input,
    {
      source: "jev",
      model: "PRESENTATION FIXTURE — NOT LIVE",
      confidence: { answerability: 0.8 },
      plan: {
        status: "answered",
        excerpts: [
          {
            id: "one",
            start,
            end: source.length,
            text: source.slice(start),
            role: "direct",
          },
        ],
      },
    },
    source,
  );
}
test("populated reader has one answer surface with compact actions and evidence disclosures", async ({
  page,
}, testInfo) => {
  await page.route("**/api/utilities/interpret", (r) =>
    r.fulfill({ json: result(r.request().postDataJSON().input) }),
  );
  await page.goto(route);
  await page.locator("#source-text").fill(source);
  await page.locator("#instructions").fill("What is useful?");
  await page.locator("#extra-ask").click();
  const article = page.locator(".source-answer");
  await expect(article).toBeVisible();
  await expect(
    page.locator("#extra-results .reader-result-toolbar"),
  ).toBeVisible();
  await expect(article.locator(".answer-title")).toHaveCount(0);
  await expect(article.locator(".answer-question")).toHaveCount(1);
  await expect(article.locator(".answer-citation")).toBeVisible();
  await expect(article.locator(".answer-sources")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(article.locator(".answer-processing")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator("#extra-copy")).toBeVisible();
  await expect(page.locator("#extra-download")).toBeVisible();
  const surface = await page.locator("#extra-results").evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    border: getComputedStyle(el).borderTopWidth,
    answerBeforeActions: !!(
      document
        .querySelector(".answer-lead")
        .compareDocumentPosition(
          document.querySelector(".reader-result-toolbar"),
        ) & Node.DOCUMENT_POSITION_FOLLOWING
    ),
  }));
  expect(surface.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(surface.border).toBe("3px");
  expect(surface.answerBeforeActions).toBe(true);
  for (const id of ["extra-copy", "extra-download"]) {
    expect(
      (await page.locator(`#${id}`).boundingBox()).height,
    ).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: testInfo.outputPath("reader-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("reader-mobile.png"),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: testInfo.outputPath("reader-mobile-dark.png"),
    fullPage: true,
  });
});
test("reader transport failure exposes privacy-safe report link in error viewport at narrow widths", async ({
  page,
}) => {
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.route("**/api/utilities/interpret", (r) =>
      r.fulfill({
        status: 503,
        json: { error: "Reader temporarily unavailable." },
      }),
    );
    await page.goto(route);
    await page.locator("#source-text").fill("PRIVATE SOURCE TEXT");
    await page.locator("#instructions").fill("PRIVATE QUESTION TEXT");
    await page.locator("#extra-ask").click();
    const status = page.locator("#extra-status");
    await expect(status).toContainText("temporarily unavailable");

    const report = page.getByRole("link", { name: "Report this problem" });
    await expect(report).toBeVisible();
    const box = await report.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(800);
    const href = await report.getAttribute("href");
    expect(href).toContain("github.com/tugrulguner/utilitypot/issues/new");
    expect(new URL(href).searchParams.get("body")).toContain(
      "Page: https://utilitypot.modepot.io/tools/ask-a-webpage/",
    );
    expect(href).not.toContain("PRIVATE");
    expect(href).not.toContain("What%20is");
    const errorBox = await status.boundingBox();
    expect(errorBox.y).toBeGreaterThanOrEqual(0);
    expect(errorBox.y + errorBox.height).toBeLessThanOrEqual(800);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});
