import { test, expect } from "@playwright/test";
import { fixturePlan, approvalGraph } from "./workflow-fixtures.mjs";
import { mermaidSource } from "../src/lib/utilities/diagram.js";
import { readFile } from "node:fs/promises";

for (const width of [1280, 390, 320])
  for (const theme of ["light", "dark"]) {
    test(`flowchart export and theme inspection at ${width}px ${theme} (presentation fixture)`, async ({
      page,
      context,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({
        colorScheme: theme === "light" ? "dark" : "light",
      });
      let calls = 0;
      page.on("request", (r) => {
        if (new URL(r.url()).pathname === "/api/utilities/interpret") calls++;
      });
      await page.goto("/tools/text-to-mermaid/");
      await page.locator("#color-theme").selectOption(theme);
      await page.getByRole("button", { name: /^Load example:/ }).click();
      await fixturePlan(page, { graph: approvalGraph });
      await page.locator("#create-diagram").click();
      const frame = page.locator("#extra-visual iframe");
      await expect(
        page.frameLocator("#extra-visual iframe").locator("svg"),
      ).toBeVisible();
      const svgAction = page
        .locator(".result-toolbar")
        .getByRole("button", { name: "Download SVG", exact: true });
      await expect(svgAction).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const positions = await svgAction.evaluate((el) => ({
        button: el.getBoundingClientRect().top,
        frame: document
          .querySelector("#extra-visual iframe")
          .getBoundingClientRect().top,
      }));
      expect(positions.button).toBeLessThan(positions.frame);
      await expect(frame).toHaveAttribute("data-diagram-theme", theme);
      await expect(
        page.getByRole("button", { name: "Download Mermaid", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Copy Mermaid", exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: info.outputPath("flowchart-result.png") });
      const ev = page.waitForEvent("download");
      await svgAction.click();
      const svgDownload = await ev;
      expect(svgDownload.suggestedFilename()).toBe("utilitypot-flowchart.svg");
      const labels = await page.evaluate(
        (markup) =>
          [
            ...new DOMParser()
              .parseFromString(markup, "image/svg+xml")
              .querySelectorAll(".nodes .node text"),
          ].map((el) => el.textContent),
        await readFile(await svgDownload.path(), "utf8"),
      );
      expect(labels).toContain("Receive request");
      expect(labels).toHaveLength(4);
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.locator("#extra-copy").click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        mermaidSource(approvalGraph),
      );
      const change = theme === "light" ? "dark" : "light";
      await page.locator("#color-theme").selectOption(change);
      await expect(frame).toHaveAttribute("data-diagram-theme", change);
      const background = await page
        .frameLocator("#extra-visual iframe")
        .locator("body")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(background).toBe(
        change === "dark" ? "rgb(32, 36, 42)" : "rgb(255, 255, 255)",
      );
      await expect(page.locator("#extra-output")).toHaveText(
        mermaidSource(approvalGraph),
      );
      await page
        .getByRole("button", { name: "Actual size", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Actual size", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(frame).toHaveJSProperty(
        "offsetWidth",
        Math.round(Number(await frame.getAttribute("data-intrinsic-width"))),
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      expect(calls).toBe(1);
    });
  }

for (const initial of ["light", "dark"]) {
  test(`theme change during initial ${initial} Mermaid render reconciles preview and SVG (presentation fixture)`, async ({
    page,
  }) => {
    const target = initial === "light" ? "dark" : "light";
    let calls = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/utilities/interpret")
        calls++;
    });
    await page.goto("/tools/text-to-mermaid/");
    await page.locator("#color-theme").selectOption(initial);
    await page.getByRole("button", { name: /^Load example:/ }).click();
    await fixturePlan(page, { graph: approvalGraph });
    await page.evaluate((target) => {
      window.__diagramThemeFlip = false;
      // Change the real theme control during Mermaid's first SVG construction,
      // before the application installs its finished-preview observer.
      const observer = new MutationObserver(() => {
        if (
          !document.querySelector('svg[id^="diagram-"]') ||
          document.querySelector("#extra-visual iframe")
        )
          return;
        observer.disconnect();
        const control = document.querySelector("#color-theme");
        control.value = target;
        control.dispatchEvent(new Event("change", { bubbles: true }));
        window.__diagramThemeFlip = true;
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }, target);
    await page.locator("#create-diagram").click();
    await expect
      .poll(() => page.evaluate(() => window.__diagramThemeFlip))
      .toBe(true);
    const frame = page.locator("#extra-visual iframe");
    await expect(page.locator("html")).toHaveAttribute("data-theme", target);
    await expect(frame).toHaveAttribute("data-diagram-theme", target);
    await expect(
      page.frameLocator("#extra-visual iframe").locator("body"),
    ).toHaveCSS(
      "background-color",
      target === "dark" ? "rgb(32, 36, 42)" : "rgb(255, 255, 255)",
    );
    const srcdoc = await frame.getAttribute("srcdoc");
    const displayedSvg = srcdoc.slice(
      srcdoc.indexOf("<svg"),
      srcdoc.lastIndexOf("</svg>") + "</svg>".length,
    );
    const downloadEvent = page.waitForEvent("download");
    await page.locator("#diagram-svg-download").click();
    const download = await downloadEvent;
    expect(await readFile(await download.path(), "utf8")).toBe(displayedSvg);
    await expect(page.locator("#extra-output")).toHaveText(
      mermaidSource(approvalGraph),
    );
    expect(calls).toBe(1);
  });
}
