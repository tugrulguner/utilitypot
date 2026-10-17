import { chromium } from "@playwright/test";
import { readFile, writeFile, readdir } from "node:fs/promises";
const files = await readdir("node_modules/@fontsource-variable/manrope/files");
const name = files.find((n) => n === "manrope-latin-wght-normal.woff2");
if (!name) throw Error("Missing canonical lockup font");
const font = (
  await readFile("node_modules/@fontsource-variable/manrope/files/" + name)
).toString("base64");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [source, target, width, height] of [
    ["docs/assets/utilitypot-lockup-v2.svg", "utilitypot.png", 1200, 900],
    [
      "public/utilitypot-social-v2.svg",
      "public/utilitypot-social-v2.png",
      1200,
      630,
    ],
  ]) {
    await page.setViewportSize({ width, height });
    await page.setContent(
      "<style>@font-face{font-family:Manrope;src:url(data:font/woff2;base64," +
        font +
        ") format('woff2');font-weight:200 900}html,body{margin:0;padding:0}</style>" +
        (await readFile(source, "utf8")),
    );
    await page.evaluate(() => document.fonts.load("700 100px Manrope"));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: target });
  }
  await writeFile(
    "public/utilitypot-lockup-v2.png",
    await readFile("utilitypot.png"),
  );
  console.log(
    "Rendered canonical UtilityPot README/site lockup and 1200x630 social preview.",
  );
} finally {
  await browser.close();
}
