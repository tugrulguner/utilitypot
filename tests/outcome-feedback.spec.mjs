import { test, expect } from "@playwright/test";
// Fixture responses isolate feedback behavior; not live-provider quality evidence.
for (const confidence of [0.4, 0.95])
  for (const tool of ["csv", "dates", "meeting", "jsonCsv", "diagram"]) {
    test(`${tool}: outcome survives ${confidence < 0.6 ? "uncertain" : "confident"} fixture interpretation`, async ({
      page,
    }) => {
      const slug = {
        csv: "csv-to-nested-json",
        dates: "fix-excel-dates",
        meeting: "meeting-time-finder",
        jsonCsv: "json-to-csv",
        diagram: "text-to-mermaid",
      }[tool];
      const extra = ["jsonCsv", "diagram"].includes(tool),
        status = extra ? "#extra-status" : "#utility-status",
        results = extra ? "#extra-results" : "#results";
      await page.goto(`/tools/${slug}/`);
      await page
        .locator("details")
        .evaluateAll((es) => es.forEach((e) => (e.open = true)));
      await page.getByRole("button", { name: /^Load example:/ }).click();
      let plan;
      if (tool === "csv")
        plan = {
          groupBy: "Customer",
          fields: [
            { path: "id", column: "Customer" },
            { path: "name", column: "Name" },
            { path: "items[].sku", column: "SKU" },
            { path: "items[].quantity", column: "Qty" },
          ],
        };
      if (tool === "dates") plan = { convention: "day-first" };
      if (tool === "meeting") {
        await page.locator("#meeting-date").fill("2026-06-15");
        plan = {
          participants: await page.locator(".participant").evaluateAll((es) =>
            es.map((e) => ({
              ...Object.fromEntries(
                [...e.querySelectorAll("[data-field]")].map((f) => [
                  f.dataset.field,
                  f.value,
                ]),
              ),
              scope: "supported",
            })),
          ),
        };
        await page.locator("#availability-mode").selectOption("jev");
      }
      if (tool === "jsonCsv") plan = { path: "orders", arrays: "reject" };
      if (tool === "diagram") {
        plan = {
          graph: JSON.parse(await page.locator("#review-plan").inputValue()),
        };
        await page.locator("#diagram-mode").selectOption("jev");
      }
      await page.route("**/api/utilities/interpret", (route) =>
        route.fulfill({
          json: {
            source: "jev",
            model: "fixture-model",
            plan,
            confidence: { selection: confidence },
          },
        }),
      );
      await page
        .locator(
          extra
            ? tool === "diagram"
              ? "#create-diagram"
              : "#extra-ask"
            : tool === "meeting"
              ? "#run"
              : "#ask-jev",
        )
        .click();
      await expect(page.locator(results)).toBeVisible();
      await expect(page.locator(status)).not.toContainText(
        /Jev|fixture-model|proposal|proposed settings/,
      );
      await expect(page.locator(status)).not.toHaveClass(/error/);
      await expect(page.locator(status)).toContainText(
        {
          csv: "3 source rows to 2 parent records",
          dates: "Processed 5 rows",
          meeting: "feasible slots",
          jsonCsv: "CSV computed locally",
          diagram: "Flowchart created",
        }[tool],
      );
      if (confidence < 0.6)
        await expect(page.locator(status)).toContainText("uncertain");
      const details = page.locator(`${results} [data-interpretation-details]`);
      await expect(details).toHaveCount(1);
      await expect(details).not.toHaveAttribute("open", "");
      await expect(details.locator("p")).not.toBeVisible();
      await details.locator("summary").click();
      await expect(details.locator("p")).toContainText("fixture-model");
    });
  }
