import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("UtilityPot wordmark keeps the prefix off-white and pot rose in every SVG", async () => {
  for (const file of [
    "docs/assets/utilitypot-lockup-v2.svg",
    "public/utilitypot-social-v2.svg",
  ]) {
    const svg = await readFile(file, "utf8");
    assert.match(
      svg,
      /<text[^>]*fill="#F4F0E7"[^>]*>utility<tspan fill="#F28CBE">pot<\/tspan><\/text>/,
    );
  }
});

test("canonical artwork captions match the six-local, three-AI inventory", async () => {
  const lockup = await readFile("docs/assets/utilitypot-lockup-v2.svg", "utf8");
  const social = await readFile("public/utilitypot-social-v2.svg", "utf8");
  assert.match(lockup, /6 browser-local tools · 3 disclosed AI tools/);
  assert.match(
    social,
    /Six tools run in your browser; three use bounded AI when you ask/,
  );
  assert.match(social, /6 browser-local tools · 3 disclosed AI tools/);
});

test("UtilityPot identity uses canonical family geometry and a consistent README resource row", async () => {
  const readme = await readFile("README.md", "utf8");
  const firstImage = readme.match(/<img\b[^>]*>/)?.[0] ?? "";
  assert.match(firstImage, /src="utilitypot\.png\?v=inventory-artwork-2"/);
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
  const mark = await readFile("public/utilitypot-mark-v2.svg", "utf8");
  const hero = await readFile("docs/assets/utilitypot-lockup-v2.svg", "utf8");
  assert.ok(outline && mark.includes(outline) && hero.includes(outline));
  assert.ok(mark.includes("UtilityPot mark"));
  assert.ok(!mark.includes("M monogram"));
  for (const [file, w, h] of [
    ["utilitypot.png", 1200, 900],
    ["public/utilitypot-lockup-v2.png", 1200, 900],
    ["public/utilitypot-social-v2.png", 1200, 630],
  ]) {
    const png = await readFile(file);
    assert.equal(png.readUInt32BE(16), w);
    assert.equal(png.readUInt32BE(20), h);
  }
  assert.deepEqual(
    await readFile("utilitypot.png"),
    await readFile("public/utilitypot-lockup-v2.png"),
  );
});
