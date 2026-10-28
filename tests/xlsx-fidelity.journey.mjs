import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { zipSync, unzipSync, strToU8 } from "fflate";

export async function verifyXlsxFidelity(page) {
  await page.route("**/*", (r) =>
    ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  const api = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url());
  });
  const original = unzipSync(
    new Uint8Array(
      await readFile(
        new URL("./fixtures/compare-before.xlsx", import.meta.url),
      ),
    ),
  );
  function workbook(cells, shared) {
    const files = { ...original };
    files["xl/worksheets/sheet2.xml"] = strToU8(
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c><c r="B1" t="inlineStr"><is><t>value</t></is></c><c r="C1" t="inlineStr"><is><t>extra</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>1</t></is></c>' +
        cells +
        "</row></sheetData></worksheet>",
    );
    if (shared) files["xl/sharedStrings.xml"] = strToU8(shared);
    return Buffer.from(zipSync(files));
  }
  const cases = [
    {
      before: '<c r="B2" t="inlineStr"><is><t><![CDATA[old]]></t></is></c>',
      after: '<c r="B2" t="s"><v>0</v></c>',
      shared: "<sst><si><t><![CDATA[new]]></t></si></sst>",
      changes: [{ column: "value", before: "old", after: "new" }],
    },
    {
      before: '<c r="C2" t="inlineStr"><is><t>x</t></is></c>',
      after: "",
      changes: [{ column: "extra", before: "x", after: null }],
    },
    {
      before: '<c r="B2" t="inlineStr"><is><t>left_x000D_right</t></is></c>',
      csv: 'id,value,extra\r\n1,"left\rright"',
      changes: [],
    },
  ];
  await page.goto("/tools/compare-spreadsheets/");
  for (const c of cases) {
    await page.locator("#diff-before-file").setInputFiles({
      name: "before.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: workbook(c.before),
    });
    await page.locator("#diff-after-file").setInputFiles(
      c.csv
        ? {
            name: "after.csv",
            mimeType: "text/csv",
            buffer: Buffer.from(c.csv),
          }
        : {
            name: "after.xlsx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer: workbook(c.after, c.shared),
          },
    );
    await page
      .locator("#diff-before-sheet")
      .selectOption({ label: "Inventory" });
    if (!c.csv)
      await page
        .locator("#diff-after-sheet")
        .selectOption({ label: "Inventory" });
    await page.locator("#diff-key").selectOption("id");
    await page.locator("#diff-run").click();
    await expect(page.locator("#diff-result")).toBeVisible();
    const event = page.waitForEvent("download");
    await page.locator("#diff-json").click();
    const report = JSON.parse(
      await readFile(await (await event).path(), "utf8"),
    );
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].changes).toEqual(c.changes);
    if (c.csv) {
      expect(report.counts.unchanged).toBe(1);
      expect(report.rows[0].before.value).toBe("left\rright");
      expect(report.rows[0].after.value).toBe("left\rright");
    } else expect(report.counts.changed).toBe(1);
  }
  expect(api).toEqual([]);
}
