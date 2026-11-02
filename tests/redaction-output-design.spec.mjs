import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
// Synthetic UI qualification must not send documents or analytics off origin.
const apiRequests = new WeakMap();
test.beforeEach(async ({ page, context }) => {
  const requests = [];
  apiRequests.set(page, requests);
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      requests.push(request.url());
  });
  await context.route("**/*", (route) =>
    ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
});
test.afterEach(async ({ page }) => {
  expect(apiRequests.get(page)).toEqual([]);
});
const source = () =>
  sharp({
    create: {
      width: 760,
      height: 400,
      channels: 4,
      background: { r: 240, g: 80, b: 80, alpha: 0.5 },
    },
  })
    .png()
    .withMetadata({
      exif: { IFD0: { ImageDescription: "PRIVATE_METADATA_SENTINEL" } },
    })
    .toBuffer();
for (const width of [1280, 390, 320])
  for (const theme of ["light", "dark"])
    test(`preview-first redaction keeps export visible ${width} ${theme}`, async ({
      page,
    }, info) => {
      const api = [];
      page.on("request", (r) => {
        if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url());
      });
      await page.goto("/tools/redact-screenshot/");
      await page.setViewportSize({ width, height: 900 });
      await page.getByLabel("Color theme").selectOption(theme);
      await page.locator("#redaction-file").setInputFiles({
        name: "private.png",
        mimeType: "image/png",
        buffer: await source(),
      });
      const canvas = page.locator("#redaction-canvas");
      await expect(canvas).toHaveJSProperty("width", 760);
      await canvas.scrollIntoViewIfNeeded();
      const b = await canvas.boundingBox();
      await page.mouse.move(b.x + b.width * 0.1, b.y + b.height * 0.1);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4, {
        steps: 5,
      });
      await page.mouse.up();
      await expect(page.locator("#redaction-download")).toBeEnabled();
      await expect(page.locator("#redaction-download")).toBeInViewport({
        ratio: 1,
      });
      await expect(canvas).toBeInViewport({ ratio: 0.9 });
      await expect(
        page.locator("#redaction-coordinate-settings"),
      ).not.toHaveAttribute("open", "");
      await expect(page.locator("#redaction-status")).toContainText(
        "1 opaque black region selected",
      );
      await page.screenshot({
        path: info.outputPath(`redaction-${width}-${theme}.png`),
      });
      const event = page.waitForEvent("download");
      await page.locator("#redaction-download").click();
      const download = await event,
        bytes = await readFile(await download.path());
      expect(download.suggestedFilename()).toBe("redacted.png");
      const image = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const pixel = (x, y) => [
        ...image.data.subarray((y * 760 + x) * 4, (y * 760 + x) * 4 + 4),
      ];
      expect(pixel(100, 100)).toEqual([0, 0, 0, 255]);
      expect(pixel(700, 350)[3]).toBe(128);
      expect(bytes.toString("latin1")).not.toContain(
        "PRIVATE_METADATA_SENTINEL",
      );
      await page.locator("#redaction-undo").click();
      await expect(page.locator("#redaction-download")).toBeDisabled();
      await expect(page.locator("#redaction-status")).toContainText(
        "0 opaque black regions selected",
      );
      expect(api).toEqual([]);
    });

test("closed exact coordinates open through keyboard shortcuts and retain add, correction and clear behavior", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/tools/redact-screenshot/");
  await page.locator("#redaction-file").setInputFiles({
    name: "private.png",
    mimeType: "image/png",
    buffer: await source(),
  });
  await expect(page.locator("#redaction-canvas")).toHaveJSProperty(
    "width",
    760,
  );
  const settings = page.locator("#redaction-coordinate-settings");
  await expect(settings).not.toHaveAttribute("open", "");
  await page.locator("#redaction-preview").focus();
  await page.keyboard.press("w");
  await expect(settings).toHaveAttribute("open", "");
  await expect(page.locator("#redaction-width")).toBeFocused();
  await page.locator("#redaction-width").fill("0");
  await page.locator("#redaction-add").click();
  await expect(page.locator("#redaction-status")).toContainText(
    "non-zero width and height",
  );
  await expect(page.locator("#redaction-download")).toBeDisabled();
  await page.locator("#redaction-width").fill("30");
  await page.locator("#redaction-height").fill("20");
  await page.locator("#redaction-add").click();
  await expect(page.locator("#redaction-regions li")).toHaveCount(1);
  await expect(page.locator("#redaction-download")).toBeEnabled();
  await page.locator("#redaction-clear").click();
  await expect(page.locator("#redaction-regions li")).toHaveCount(0);
  await expect(page.locator("#redaction-download")).toBeDisabled();
  await page.locator("#redaction-undo").click();
  await expect(page.locator("#redaction-regions li")).toHaveCount(1);
  await page.locator("#redaction-clear-image").click();
  await expect(page.locator("#redaction-download")).toBeDisabled();
  await expect(page.locator("#redaction-canvas")).toHaveJSProperty("width", 1);
});
