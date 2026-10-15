import { test, expect } from "@playwright/test";

test("mobile meeting options show both city times without clipping the text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/meeting-time-finder/");
  await page.locator("#meeting-date").fill("2027-01-19");
  for (const [i, city] of [
    [0, "London"],
    [1, "New York"],
  ]) {
    await page.locator(`#p${i}-zone`).fill(city);
    await page.locator(`#p${i}-start`).fill("09:00");
    await page.locator(`#p${i}-end`).fill("17:00");
  }
  await page.locator("#run").click();
  await page.locator("#slot-choice").selectOption("4");
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.locator("#slot-choice").evaluate((el) => {
    const css = getComputedStyle(el),
      canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d");
    ctx.font = css.font;
    const text = el.selectedOptions[0].textContent;
    return {
      text,
      textWidth: ctx.measureText(text).width,
      available:
        el.clientWidth -
        parseFloat(css.paddingLeft) -
        parseFloat(css.paddingRight) -
        24,
    };
  });
  expect(geometry.text).toContain("London");
  expect(geometry.text).toContain("New York");
  expect(geometry.textWidth).toBeLessThanOrEqual(geometry.available);
});

test("mobile date statuses and values remain readable as whole words", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/fix-excel-dates/");
  await page
    .locator("#dates-input")
    .fill("2027\n2027-02\n04/05/2027\n2027-02-30\n\n2027-12-09");
  await page.locator("#run").click();
  await page.evaluate(() => document.fonts.ready);
  const partial = page
    .locator("#result-view td:visible, #result-view dd:visible")
    .filter({ hasText: /^partial$/ })
    .first();
  const lines = await partial.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getClientRects().length;
  });
  expect(lines).toBe(1);
  await expect(page.locator("#result-view")).toContainText("2027-12-09");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("CSV pasted before its module finishes loading remains usable", async ({
  page,
}) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/_astro/UtilityApp*.js", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/tools/csv-to-nested-json/", { waitUntil: "commit" });
    await page
      .locator("#csv-input")
      .fill('order_id,buyer,sku,qty\n001,"Mina, P",A1,2\n001,"Mina, P",B2,1');
    release();
    await expect(page.locator("#group-by")).toHaveValue("order_id");
    await page.locator("#run").click();
    await expect(page.locator("#results")).toBeVisible();
    await expect(page.locator("#result-view")).toContainText("001");
  } finally {
    release();
  }
});

test("new JSON record choices never retain helper claims about the previous source", async ({
  page,
}) => {
  await page.goto("/tools/json-to-csv/");
  await page.locator("#source-text").fill('{"id":"001"}');
  await page.locator("#row-path").selectOption("$object");
  await expect(page.locator("#nested-array-help")).toContainText(
    "No nested arrays",
  );
  await page
    .locator("#source-text")
    .fill('{"orders":[{"id":"002","tags":["x"]}],"people":[{"name":"Noah"}]}');
  await expect(page.locator("#row-path")).toHaveValue("");
  await expect(page.locator("#nested-array-help")).toContainText(
    "Choose records",
  );
  await expect(page.locator("#nested-array-help")).not.toContainText(
    "No nested arrays",
  );
  await page.locator("#array-policy").selectOption("join");
  await expect(page.locator("#nested-array-help")).toContainText(
    "Choose records",
  );
  await page.locator("#row-path").selectOption("orders");
  await expect(page.locator("#nested-array-help")).toContainText("tags");
  await page.locator("#array-policy").selectOption("reject");
  await page.locator("#extra-run").click();
  await expect(page.locator("#extra-status")).toContainText(
    "Keep as JSON text in a cell",
  );
  await expect(page.locator("#extra-status")).not.toContainText(
    "join, or reject",
  );
});
