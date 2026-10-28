import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const source = new URL(
  "./fixtures/redaction-review-source.png",
  import.meta.url,
).pathname;
async function prepare(page) {
  await page.goto("/tools/redact-screenshot/");
  await page.locator("#redaction-file").setInputFiles(source);
  for (const [id, n] of Object.entries({
    x: 65,
    y: 45,
    width: 360 - 65,
    height: 120 - 45,
  }))
    await page.locator("#redaction-" + id).fill(String(n));
  await page.locator("#redaction-add").click();
  await expect(page.locator("#redaction-download")).toBeEnabled();
}
test("an image selected before the controller loads is consumed at startup", async ({
  page,
}) => {
  let release;
  const held = new Promise((r) => (release = r));
  await page.route("**/*.js", async (route) => {
    if (
      !["127.0.0.1", "localhost"].includes(
        new URL(route.request().url()).hostname,
      )
    )
      return route.abort();
    const response = await route.fetch();
    const text = await response.text();
    if (
      text.includes("redaction-download") &&
      text.includes("redaction-canvas")
    )
      await held;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/tools/redact-screenshot/", { waitUntil: "commit" });
    await page.locator("#redaction-file").setInputFiles(source);
    release();
    await expect(page.locator("#redaction-canvas")).toHaveJSProperty(
      "width",
      600,
    );
  } finally {
    release();
  }
});

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (r) =>
    ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
});
test("clearing during real PNG encoding discards the pending download", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      return original.call(
        this,
        (blob) => {
          window.releaseRedactionBlob = () => callback(blob);
        },
        ...args,
      );
    };
  });
  await prepare(page);
  await page.locator("#redaction-download").click();
  await expect
    .poll(() => page.evaluate(() => typeof window.releaseRedactionBlob))
    .toBe("function");
  await page.locator("#redaction-clear-image").click();
  const leaked = page
    .waitForEvent("download", { timeout: 700 })
    .catch(() => null);
  await page.evaluate(() => window.releaseRedactionBlob());
  expect(await leaked).toBeNull();
});
test("download removes source metadata and preserves transparency outside selected regions", async ({
  page,
}) => {
  await prepare(page);
  const event = page.waitForEvent("download");
  await page.locator("#redaction-download").click();
  const bytes = await readFile(await (await event).path());
  expect(bytes.includes(Buffer.from("PRIVATE_ORIGINAL_SENTINEL"))).toBe(false);
  const actual = await page.evaluate(
    async (array) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(array)], { type: "image/png" }),
      );
      const c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      const x = c.getContext("2d");
      x.drawImage(bitmap, 0, 0);
      return {
        inside: [...x.getImageData(100, 80, 1, 1).data],
        outside: [...x.getImageData(510, 100, 1, 1).data],
        width: c.width,
        height: c.height,
      };
    },
    [...bytes],
  );
  expect(actual.inside).toEqual([0, 0, 0, 255]);
  expect(actual.outside[3]).toBe(128);
  expect([actual.width, actual.height]).toEqual([600, 360]);
});
