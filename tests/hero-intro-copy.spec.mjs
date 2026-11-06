import { test, expect } from "@playwright/test";

test("homepage introduction names current tasks and preserves the privacy boundary", async ({
  page,
}) => {
  await page.goto("/");
  const hero = page.locator(".hero-copy");
  await expect(hero.getByRole("heading", { level: 1 })).toContainText("data");
  await expect(hero.locator(".utility-intro")).toContainText(
    /screenshot.*spreadsheet/i,
  );
  await expect(hero.locator(".utility-intro")).toContainText(/redact/i);
  await expect(hero.locator(".utility-intro")).toContainText(
    /compare spreadsheets/i,
  );
  await expect(hero.locator(".notice")).toContainText(
    "Eight tools work entirely in your browser; three use bounded AI only after you ask.",
  );
  await expect(hero.locator(".notice")).toContainText(
    /Review AI-assisted results./,
  );
  await expect(page.locator(".product-hero img")).toHaveAttribute(
    "src",
    "/utilitypot-lockup-v2.png?v=local-tools-11",
  );
});
