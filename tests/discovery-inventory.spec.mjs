import { test, expect } from "@playwright/test";
import tools from "../src/data/tools.json" with { type: "json" };
test("homepage and agent map publish the complete current inventory", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator("#tools > h2")).toHaveText(
    `${tools.length} tools. No signup.`,
  );
  await expect(page.locator("#tools article")).toHaveCount(tools.length);
  const response = await request.get("/llms.txt");
  expect(response.ok()).toBe(true);
  const text = await response.text();
  const slugs = [
    ...text.matchAll(
      /^- \[[^\]]+\]\(https:\/\/utilitypot\.modepot\.io\/tools\/([^/]+)\/\):/gm,
    ),
  ]
    .map((m) => m[1])
    .sort();
  expect(slugs).toEqual(tools.map((t) => t.slug).sort());
});
