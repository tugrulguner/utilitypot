import { test, expect } from "@playwright/test";
import { fixturePlan } from "./workflow-fixtures.mjs";
const text = "Ada Lovelace joined Cedar Labs in London.";
const items = [
  { type: "Person", text: "Ada Lovelace", start: 0, end: 12 },
  { type: "Organization", text: "Cedar Labs", start: 20, end: 30 },
  { type: "Speaker", text: "Ada Lovelace", start: 0, end: 12 },
  { type: "Place", text: "London", start: 34, end: 40 },
];
const ratio = (a, b) => {
  const lum = (v) =>
    v
      .slice(0, 3)
      .map((c) => c / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const x = [lum(a), lum(b)].sort((x, y) => y - x);
  return (x[0] + 0.05) / (x[1] + 0.05);
};
test("four configured categories retain distinct accessible colours and shared exact spans in Light/Dark/Auto", async ({
  page,
}) => {
  await page.goto("/tools/entity-extractor/");
  await page.locator("#source-text").fill(text);
  await page.locator("#custom-category").check();
  await page
    .locator("#instructions")
    .fill(
      "Speaker: a named person who speaks\nPlace: a named geographical place",
    );
  await fixturePlan(page, { entities: items });
  await page.locator("#extra-ask").click();
  await expect(page.locator(".entity-category-chip")).toHaveCount(4);
  await expect(page.locator("mark.is-shared")).toHaveText("Ada Lovelace");
  for (const choice of ["light", "dark", "auto"])
    for (const os of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: os });
      await page.locator("#color-theme").selectOption(choice);
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        choice === "auto" ? os : choice,
      );
      const samples = await page
        .locator(".entity-workspace")
        .evaluate((root) => {
          const c = document.createElement("canvas").getContext("2d");
          const rgb = (v) => {
            c.clearRect(0, 0, 1, 1);
            c.fillStyle = v;
            c.fillRect(0, 0, 1, 1);
            return [...c.getImageData(0, 0, 1, 1).data];
          };
          const style = getComputedStyle(root);
          const ink = rgb(style.getPropertyValue("--ink"));
          const panel = rgb(
            getComputedStyle(root.querySelector(".entity-source-toolbar"))
              .backgroundColor,
          );
          return [0, 1, 2, 3].map((slot) => ({
            accent: rgb(style.getPropertyValue("--entity-color-" + slot)),
            tint: rgb(style.getPropertyValue("--entity-tint-" + slot)),
            ink,
            panel,
            border: rgb(
              getComputedStyle(
                root.querySelector(
                  `[data-category-slot="${slot}"] .entity-occurrence`,
                ),
              ).borderColor,
            ),
          }));
        });
      expect(new Set(samples.map((s) => s.accent.join(","))).size).toBe(4);
      for (const s of samples) {
        expect(ratio(s.ink, s.tint)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(s.accent, s.panel)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(s.accent, s.tint)).toBeGreaterThanOrEqual(3);
        expect(s.border).toEqual(s.accent);
      }
    }
  await page
    .getByRole("button", {
      name: "Speaker Ada Lovelace, occurrence 1",
      exact: true,
    })
    .click();
  await expect(page.locator("mark.is-current")).toHaveText("Ada Lovelace");
  expect(await page.locator(".entity-document").textContent()).toBe(text);
  const organization = page.locator(
    '.entity-category[data-category-slot="1"] .entity-occurrence',
  );
  const organizationColor = await organization.evaluate(
    (el) => getComputedStyle(el).borderColor,
  );
  await page.locator("#people-category").uncheck();
  await expect(page.locator(".entity-workspace")).toHaveCount(0);
  await fixturePlan(page, { entities: [items[1]] });
  await page.locator("#extra-ask").click();
  await expect(
    page.locator('.entity-category[data-category-slot="1"]'),
  ).toContainText("Organization");
  expect(
    await page
      .locator(".entity-category .entity-occurrence")
      .evaluate((el) => getComputedStyle(el).borderColor),
  ).toBe(organizationColor);
});
