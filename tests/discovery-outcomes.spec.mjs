import { fulfillEntityDocumentFixture } from "./helpers/entity-document-fixture.mjs";
import { test, expect } from "@playwright/test";
import { approvalGraph } from "./workflow-fixtures.mjs";
const tools = [
  ["csv-to-nested-json", "Create nested JSON", "#results"],
  ["fix-excel-dates", "Fix dates", "#results"],
  ["meeting-time-finder", "Find times", "#results"],
  ["json-to-csv", "Convert", "#extra-results"],
  ["entity-extractor", "Extract names", "#extra-results"],
  ["text-to-mermaid", "Create flowchart", "#extra-results"],
  ["ask-a-webpage", "Find answer", "#extra-results"],
];
for (const width of [1280, 1050, 390])
  for (const [slug, action, result] of tools)
    test(`${slug}: discovery stays in its lane through results and disclosures at ${width}px (AI fixtures)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      let calls = 0;
      await page.route("**/api/utilities/interpret", async (route) => {
        calls++;
        const { tool, input } = route.request().postDataJSON();
        const plan =
          tool === "entities"
            ? { entities: [{ type: "Person", text: "Ada", start: 0, end: 3 }] }
            : tool === "diagram"
              ? { graph: approvalGraph }
              : {
                  status: "answered",
                  excerpts: [
                    { text: input.text, start: 0, end: input.text.length },
                  ],
                };
        await fulfillEntityDocumentFixture(route, {
          json: {
            source: "jev",
            model: "layout-regression-fixture",
            plan,
            confidence: {},
          },
        });
      });
      await page.goto(`/tools/${slug}/`);
      await page.evaluate(() => document.fonts.ready);
      const rail = page.locator(".discovery-rail"),
        app = page.locator(".utility-app");
      const rect = (loc) =>
        loc.evaluate((e) => {
          const r = e.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y + scrollY,
            width: r.width,
            height: r.height,
            right: r.right,
          };
        });
      const initial = await rect(rail),
        initialApp = await rect(app);
      await page.getByRole("button", { name: /^Load example:/ }).click();
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(page.locator(result)).toBeVisible();
      async function assertPosition() {
        const r = await rect(rail),
          a = await rect(app);
        if (width >= 1050) {
          expect(r.x).toBeCloseTo(initial.x, 0);
          expect(r.y).toBeCloseTo(initial.y, 0);
          expect(r.x).toBeGreaterThanOrEqual(a.right);
          expect(a.width).toBeCloseTo(initialApp.width, 0);
        } else expect(r.y).toBeGreaterThanOrEqual(a.y + a.height);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await assertPosition();
      const details = page.locator(result).locator("details");
      if (await details.count()) {
        const d = details.first();
        await d.locator(":scope > summary").click();
        await assertPosition();
        await d.locator(":scope > summary").click();
        await assertPosition();
      }
      expect(calls).toBe(
        ["entity-extractor", "text-to-mermaid", "ask-a-webpage"].includes(slug)
          ? 1
          : 0,
      );
      await page.screenshot({
        path: test.info().outputPath(`${slug}-${width}.png`),
        fullPage: true,
      });
    });
