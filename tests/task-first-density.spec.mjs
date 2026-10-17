import { fixturePlan } from "./workflow-fixtures.mjs";
import { test, expect } from "@playwright/test";
const tools = [
  ["csv-to-nested-json", "Create nested JSON"],
  ["fix-excel-dates", "Fix dates"],
  ["meeting-time-finder", "Find times"],
  ["json-to-csv", "Convert"],
  ["entity-extractor", "Extract entities"],
  ["text-to-mermaid", "Create flowchart"],
  ["ask-a-webpage", "Find answer"],
];
for (const width of [1280, 390])
  for (const [slug, name] of tools)
    test(`${width}px ${slug}: first useful action is reachable without a wall of setup`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tools/" + slug + "/");
      await page.evaluate(() => document.fonts.ready);
      const button = page.getByRole("button", { name, exact: true });
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box.y + box.height).toBeLessThan(
        slug === "meeting-time-finder" ? 1150 : 850,
      );
      expect(
        await page.locator("main").evaluate((e) => e.scrollWidth <= innerWidth),
      ).toBe(true);
      if (slug === "entity-extractor")
        await expect(
          page.getByRole("heading", { name: "Review mentions", exact: true }),
        ).not.toBeVisible();
    });
test("source tabs visibly distinguish the selected input without starting inference", async ({
  page,
}) => {
  let apiCalls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/utilities/")) apiCalls++;
  });
  await page.goto("/tools/ask-a-webpage/");
  const paste = page.getByRole("tab", { name: "Pasted text", exact: true });
  const url = page.getByRole("tab", { name: "Public URL", exact: true });
  const border = (e) => getComputedStyle(e).borderBottomColor;
  expect(await paste.evaluate(border)).not.toEqual(await url.evaluate(border));
  await url.click();
  await expect(url).toHaveAttribute("aria-selected", "true");
  expect(await url.evaluate(border)).not.toEqual(await paste.evaluate(border));
  await page.keyboard.press("ArrowLeft");
  await expect(paste).toBeFocused();
  expect(apiCalls).toBe(0);
});

test("diagram presents its result before optional connection editing", async ({
  page,
}) => {
  await fixturePlan(page, {
    graph: {
      nodes: [
        { id: "n0", label: "Receive request", type: "process" },
        { id: "n1", label: "Send receipt", type: "terminal" },
      ],
      edges: [{ from: "n0", to: "n1", label: "" }],
    },
  });
  await page.goto("/tools/text-to-mermaid/");
  await page.locator("#source-text").fill("Receive request\nSend receipt");
  await page
    .getByRole("button", { name: "Create flowchart", exact: true })
    .click();
  await expect(
    page
      .frameLocator('iframe[title="Rendered Mermaid flowchart"]')
      .locator("svg"),
  ).toBeVisible();
  await expect(page.locator("details#graph-panel")).toBeVisible();
  expect(await page.locator("#graph-panel").evaluate((e) => e.open)).toBe(
    false,
  );
  await page.locator("#graph-panel > summary").click();
  await expect(page.getByLabel("Step 1 type", { exact: true })).toBeVisible();
});
