import { test, expect } from "@playwright/test";

test("mobile eight-step diagram is reviewable by page scrolling, not clipped inside a fixed frame", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let apiCalls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/utilities/")) apiCalls++;
  });
  await page.goto("/tools/text-to-mermaid/");
  await page
    .locator("#source-text")
    .fill(
      "Receive request.\nAssign a reviewer.\nRead the request.\nCheck the supporting documents.\nRecord the decision.\nNotify the requester.\nArchive the record.\nFinish the process.",
    );
  await page.locator("#create-diagram").click();
  const frame = page.locator("#extra-visual iframe");
  await expect(frame).toBeVisible({ timeout: 25000 });
  const drawing = await page
    .frameLocator("#extra-visual iframe")
    .locator("svg")
    .boundingBox();
  const viewport = await frame.boundingBox();
  expect(drawing.height).toBeLessThanOrEqual(viewport.height + 2);
  expect(await frame.getAttribute("sandbox")).toBe("");
  expect(apiCalls).toBe(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopDrawing = await page
    .frameLocator("#extra-visual iframe")
    .locator("svg")
    .boundingBox();
  const desktopViewport = await frame.boundingBox();
  expect(desktopDrawing.height).toBeLessThanOrEqual(desktopViewport.height + 2);
  expect(desktopViewport.height).toBeLessThanOrEqual(desktopDrawing.height + 8);
});
