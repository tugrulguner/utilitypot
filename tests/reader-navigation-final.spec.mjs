import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { sourceAnswerFixture } from "./helpers/source-answer-fixture.mjs";
const text = "Useful evidence answers the question clearly.";
for (const width of [1280, 390, 320])
  for (const theme of ["light", "dark"]) {
    test(`reader skip navigation, clipboard, exports and citation at ${width}px ${theme}`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      let requests = 0;
      await page.route("**/api/utilities/interpret", (route) => {
        requests++;
        return route.fulfill({
          json: sourceAnswerFixture(
            route.request().postDataJSON().input,
            {
              source: "jev",
              model: "PRESENTATION FIXTURE — NOT LIVE",
              confidence: { answerability: 0.8 },
              plan: {
                status: "answered",
                excerpts: [
                  {
                    id: "one",
                    start: 0,
                    end: text.length,
                    text,
                    role: "direct",
                  },
                ],
              },
            },
            text,
          ),
        });
      });
      await page.goto("/tools/ask-a-webpage/");
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: new URL(page.url()).origin,
      });
      const skip = page.locator(".skip-link");
      await expect(skip).not.toBeInViewport();
      await page.keyboard.press("Tab");
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      await page.locator("#color-theme").selectOption(theme);
      await page.locator("#source-text").fill(text);
      await page.locator("#instructions").fill("What is useful?");
      await page.locator("#extra-ask").click();
      await expect(page.locator(".source-answer")).toBeVisible();
      await expect(skip).not.toBeFocused();
      await expect(skip).not.toBeInViewport();
      await page.locator("#extra-copy").click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      let event = page.waitForEvent("download");
      await page.locator("#extra-download").click();
      let download = await event;
      const markdown = await readFile(await download.path(), "utf8");
      expect(markdown).toBe(copied);
      expect(markdown).toContain(text);
      await page.locator(".answer-processing > summary").click();
      event = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download source data (JSON)" })
        .click();
      download = await event;
      const data = JSON.parse(await readFile(await download.path(), "utf8"));
      expect(data.source.text).toBe(text);
      expect(data.source.kind).toBe("pasted-text");
      expect(data.model).toContain("NOT LIVE");
      for (const span of [
        ...data.plan.excerpts,
        ...data.plan.answer.lead,
        ...data.plan.answer.sections.flatMap((s) => s.items),
      ])
        expect(data.source.text.slice(span.start, span.end)).toBe(span.text);
      await page.locator(".answer-citation").first().click();
      await expect(page.locator(".answer-sources")).toHaveAttribute("open", "");
      expect(await page.evaluate(() => document.activeElement?.id)).toMatch(
        /^answer-source-/,
      );
      expect(requests).toBe(1);
    });
  }
