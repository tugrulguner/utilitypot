import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
for (const width of [1280, 390])
  test(`plain spreadsheet rows without an unnecessary choice at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tools/json-to-csv/");
    await page
      .locator("#source-text")
      .fill('{"name":"Mina","id":"900719925474099312345"}');
    await expect(page.locator("#row-summary")).toContainText(
      "1 spreadsheet row",
    );
    await expect(page.locator(".row-choice-control")).toBeHidden();
    await expect(page.locator("#record-sample table")).toContainText("Mina");
    await expect(page.locator(".utility-app")).not.toContainText(
      "Which records?",
    );
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    await page.locator("#extra-download").click();
    expect(await readFile(await (await dl).path(), "utf8")).toContain(
      "900719925474099312345",
    );
    await page.screenshot({
      path: info.outputPath(`json-rows-${width}.png`),
      fullPage: true,
    });
  });
test("multiple lists have meaningful names, counts, sample values and exact chosen CSV", async ({
  page,
}) => {
  await page.goto("/tools/json-to-csv/");
  await page.locator("#source-text").fill(
    JSON.stringify({
      orders: [{ order: "A-1", total: 19 }],
      customers: [
        { name: "Mina", city: "London" },
        { name: "Sol", city: "Oslo" },
      ],
    }),
  );
  await expect(page.locator(".row-choice-control")).toBeVisible();
  await expect(page.locator("#row-path")).toContainText("customers");
  await expect(page.locator("#row-path")).toContainText("2 rows");
  await page.locator("#row-path").selectOption("customers");
  await expect(page.locator("#record-sample table")).toContainText("Mina");
  await expect(page.locator("#record-sample table")).toContainText("Oslo");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await page.locator("#extra-download").click();
  expect(await readFile(await (await dl).path(), "utf8")).toBe(
    "name,city\r\nMina,London\r\nSol,Oslo",
  );
});
