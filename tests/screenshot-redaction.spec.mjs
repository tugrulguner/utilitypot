import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
const image = async () =>
  sharp({
    create: {
      width: 10,
      height: 10,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
test("upload, CSS-scaled pointer redaction, flattened opaque pixels and private generic filename", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) requests.push(r.url());
  });
  await page.goto("/tools/redact-screenshot/");
  await page.locator("#redaction-file").setInputFiles({
    name: "private-original.png",
    mimeType: "image/png",
    buffer: await image(),
  });
  await expect(page.locator("#redaction-canvas")).toHaveJSProperty("width", 10);
  await expect(page.locator("#redaction-download")).toBeDisabled();
  await page.locator("#redaction-canvas").evaluate((c) => {
    c.style.width = "100px";
  });
  const box = await page.locator("#redaction-canvas").boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.up();
  await expect(page.locator("#redaction-download")).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#redaction-download").click(),
  ]);
  expect(download.suggestedFilename()).toBe("redacted.png");
  const bytes = await readFile(await download.path());
  const result = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(result.info.width).toBe(10);
  expect(result.info.height).toBe(10);
  const pixel = (x, y) => [
    ...result.data.subarray((y * 10 + x) * 4, (y * 10 + x) * 4 + 4),
  ];
  expect(pixel(3, 3)).toEqual([0, 0, 0, 255]);
  expect(pixel(8, 8)).toEqual([255, 0, 0, 255]);
  expect(bytes.toString("latin1")).not.toContain("private-original");
  expect(requests).toEqual([]);
});
test("bad replacement discards old pixels and error is explicit; mobile width has no document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/tools/redact-screenshot/");
  await page.locator("#redaction-file").setInputFiles({
    name: "image.png",
    mimeType: "image/png",
    buffer: await image(),
  });
  await expect(page.locator("#redaction-canvas")).toHaveJSProperty("width", 10);
  await page.locator("#redaction-file").setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.locator("#redaction-error")).toBeVisible();
  await expect(page.locator("#redaction-download")).toBeDisabled();
  await expect(page.locator("#redaction-canvas")).toHaveJSProperty("width", 10);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
