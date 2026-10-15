import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("UtilityPot wordmark keeps the name white and pot orange in every SVG", async () => {
  for (const file of [
    "docs/assets/utilitypot-lockup-v1.svg",
    "public/utilitypot-social-v1.svg",
  ]) {
    const svg = await readFile(file, "utf8");
    assert.match(
      svg,
      /<text[^>]*fill="#F4F0E7"[^>]*>utility<tspan fill="#F2B84B">pot<\/tspan><\/text>/,
    );
  }
});

test("UtilityPot identity uses canonical family geometry and a consistent README resource row", async () => {
  const readme = await readFile("README.md", "utf8");
  const firstImage = readme.match(/<img\b[^>]*>/)?.[0] ?? "";
  assert.match(firstImage, /src="utilitypot\.png\?v=wordmark-2"/);
  assert.match(firstImage, /width="600"/);
  const resources =
    readme.match(/<p align="center">Part of[\s\S]*?<\/p>/)?.[0] ?? "";
  for (const url of [
    "https://modepot.io/",
    "https://utilitypot.modepot.io/",
    "https://tugrul.modepot.io/",
  ])
    assert.ok(resources.includes(url));
  const original = await readFile("public/modepot-mark.svg", "utf8");
  const outline = original.match(/<path d="([^"]+)"/)?.[1];
  const mark = await readFile("public/utilitypot-mark-v1.svg", "utf8");
  const hero = await readFile("docs/assets/utilitypot-lockup-v1.svg", "utf8");
  assert.ok(outline && mark.includes(outline) && hero.includes(outline));
  assert.ok(mark.includes("UtilityPot mark"));
  assert.ok(!mark.includes("M monogram"));
  for (const [file, w, h] of [
    ["utilitypot.png", 1200, 900],
    ["public/utilitypot-lockup-v1.png", 1200, 900],
    ["public/utilitypot-social-v1.png", 1200, 630],
  ]) {
    const png = await readFile(file);
    assert.equal(png.readUInt32BE(16), w);
    assert.equal(png.readUInt32BE(20), h);
  }
  assert.deepEqual(
    await readFile("utilitypot.png"),
    await readFile("public/utilitypot-lockup-v1.png"),
  );
});
