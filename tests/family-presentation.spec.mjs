import { test, expect } from "@playwright/test";
test("404 keeps the family shell and a recovery path", async ({ page }) => {
  const response = await page.goto("/not-a-real-tool/");
  expect(response.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await expect(page.getByLabel("Color theme")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Browse the tools →", exact: true }),
  ).toHaveAttribute("href", "/#tools");
});
test("family overview, assets and creator remain discoverable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".product-hero h1")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Browse tools", exact: false }).first(),
  ).toHaveAttribute("href", "#tools");
  await expect(page.locator(".creator-credit")).toBeVisible();
  await expect(page.locator(".product-hero img")).toHaveAttribute(
    "src",
    "/utilitypot-lockup-v1.png",
  );
  await expect(page.locator("link[rel=icon]")).toHaveAttribute(
    "href",
    "/utilitypot-mark-v1.svg",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://utilitypot.modepot.io/utilitypot-social-v1.png",
  );
  await expect(page.locator("#tools article")).toHaveCount(7);
});
test("family themes override OS, survive reload and follow Auto changes", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/tools/fix-excel-dates/");
  const theme = page.getByLabel("Color theme");
  await theme.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(22, 24, 27)");
  await page.reload();
  await expect(theme).toHaveValue("dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await theme.selectOption("light");
  expect(
    await page
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(248, 247, 244)");
  await theme.selectOption("auto");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("compact family navigation has reachable controls and keyboard-safe menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/");
  await expect(
    page
      .locator(".family-nav")
      .getByRole("link", { name: "ModePot", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const menu = page.locator("#family-menu");
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("link", { name: "GitHub", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Menu", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bounds = await page.locator(".utility-header").evaluate((h) =>
    [...h.querySelectorAll("a,button,select")]
      .filter(
        (e) =>
          e.getBoundingClientRect().width && e.getBoundingClientRect().height,
      )
      .map((e) => {
        const r = e.getBoundingClientRect();
        return {
          height: r.height,
          width: r.width,
          covered: !e.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          ),
        };
      }),
  );
  for (const r of bounds) {
    expect(r.height).toBeGreaterThanOrEqual(44);
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.covered).toBe(false);
  }
});
