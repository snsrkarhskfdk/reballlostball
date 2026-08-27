import { expect, test } from "@playwright/test";

const darkInk = "rgb(20, 48, 31)";
const darkTurf = "rgb(46, 92, 63)";

test("light home-stage headings remain readable on the paper canvas", async ({ page }) => {
  await page.goto("/#/");

  for (const selector of ["#home-trust-title", "#home-products-title", "#home-shipping-title"]) {
    const heading = page.locator(selector);
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS("color", darkInk);
    await expect(heading).toHaveCSS("opacity", "1");
  }

  for (const selector of [
    ".home-stage--trust .home-stage-head > p",
    ".home-stage--products .home-stage-head > div > p",
    ".home-stage--shipping .home-stage-head > p",
  ]) {
    const eyebrow = page.locator(selector);
    await expect(eyebrow).toBeVisible();
    await expect(eyebrow).toHaveCSS("color", darkTurf);
  }
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`SECOND ROUND final bridge is visible and contained on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#/");

    const bridge = page.locator(".second-round-bridge");
    await expect(bridge).toBeVisible();
    await expect(bridge).toHaveAttribute("aria-hidden", "false");
    await expect(bridge.locator("h2")).toHaveCSS("color", "rgb(16, 42, 27)");
    await expect(bridge.locator(".second-round-bridge-body")).toHaveCSS("color", "rgb(70, 89, 75)");
    await expect(bridge.locator(".second-round-cta")).toBeVisible();

    const geometry = await bridge.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const paper = document.querySelector(".second-round-paper");
      const ornament = paper ? getComputedStyle(paper, "::before") : null;
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        background: getComputedStyle(node).backgroundColor,
        ornamentContent: ornament?.content || "none",
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });

    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(geometry.width).toBeGreaterThan(viewport.name === "desktop" ? 500 : 300);
    expect(geometry.height).toBeGreaterThan(250);
    expect(geometry.background).toBe("rgba(255, 255, 255, 0.92)");
    expect(geometry.ornamentContent).not.toBe("none");
    expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  });
}
