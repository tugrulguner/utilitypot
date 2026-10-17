import { test, expect } from "@playwright/test";

test("UtilityPot flask and pot suffix are rose while the prefix stays off-white", async ({
  page,
}) => {
  await page.goto("/");
  for (const path of [
    "/utilitypot-mark-v2.svg",
    "/utilitypot-lockup-v2.png",
    "/utilitypot-social-v2.png",
  ]) {
    const result = await page.evaluate(async (path) => {
      const im = new Image();
      im.src = path;
      await im.decode();
      const c = document.createElement("canvas");
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(im, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let rose = 0,
        white = 0,
        suffix = 0;
      const shift = c.height === 630 ? 135 : 0;
      const near = (k, col) =>
        col.every((v, i) => Math.abs(data[k + i] - v) < 12);
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const k = (y * c.width + x) * 4;
          if (data[k + 3] < 200) continue;
          if (x < 450 && near(k, [242, 140, 190])) rose++;
          if (c.width === 1200 && y >= 330 - shift && y < 470 - shift) {
            if (x >= 510 && x < 610 && near(k, [244, 240, 231])) white++;
            if (x > 780 && x < 1100 && near(k, [242, 140, 190])) suffix++;
          }
        }
      return { width: c.width, rose, white, suffix };
    }, path);
    expect(result.rose, `${path}: actual flask pixels`).toBeGreaterThan(100);
    if (result.width === 1200) {
      expect(result.white, `${path}: off-white utility prefix`).toBeGreaterThan(
        100,
      );
      expect(
        result.suffix,
        `${path}: rose pot suffix matching flask`,
      ).toBeGreaterThan(100);
    }
  }
});
