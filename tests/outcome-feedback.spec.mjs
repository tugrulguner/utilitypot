import { test, expect } from "@playwright/test";
import { approvalGraph, fixturePlan } from "./workflow-fixtures.mjs";
for (const [tool, slug, expected] of [
  ["csv", "csv-to-nested-json", "3 source rows to 2 parent records"],
  ["dates", "fix-excel-dates", "Processed 5 rows"],
  ["meeting", "meeting-time-finder", "feasible slots"],
  ["jsonCsv", "json-to-csv", "CSV computed locally"],
])
  test(`${tool}: deterministic outcome needs no interpretation`, async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/**", (r) => {
      calls++;
      return r.abort();
    });
    await page.goto(`/tools/${slug}/`);
    await page.getByRole("button", { name: /^Load example:/ }).click();
    await page.locator(tool === "jsonCsv" ? "#extra-run" : "#run").click();
    await expect(
      page.locator(tool === "jsonCsv" ? "#extra-results" : "#results"),
    ).toBeVisible();
    const status = page.locator(
      tool === "jsonCsv" ? "#extra-status" : "#utility-status",
    );
    await expect(status).toContainText(expected);
    await expect(status).not.toHaveClass(/error/);
    await expect(status).not.toContainText(/Jev|proposal|model/i);
    expect(calls).toBe(0);
    await expect(page.locator("[data-interpretation-details]")).toHaveCount(0);
  });
for (const confidence of [0.4, 0.95])
  test(`diagram: ${confidence < 0.6 ? "uncertain" : "confident"} fixture interpretation retains its outcome`, async ({
    page,
  }) => {
    await fixturePlan(
      page,
      { graph: approvalGraph },
      { selection: confidence },
    );
    await page.goto("/tools/text-to-mermaid/");
    await page.locator("#extra-example").click();
    await page.locator("#create-diagram").click();
    await expect(page.locator("#extra-results")).toBeVisible();
    await expect(page.locator("#extra-status")).toContainText(
      "Flowchart created",
    );
    await expect(page.locator("#extra-status")).not.toHaveClass(/error/);
    await expect(page.locator("#extra-status")).not.toContainText(
      /Jev|fixture|proposal/,
    );
    if (confidence < 0.6)
      await expect(page.locator("#extra-status")).toContainText("uncertain");
    const details = page.locator("[data-interpretation-details]");
    await expect(details).not.toHaveAttribute("open", "");
    await expect(details.locator("p")).not.toBeVisible();
    await details.locator("summary").click();
    await expect(details.locator("p")).toContainText("fixture");
  });
