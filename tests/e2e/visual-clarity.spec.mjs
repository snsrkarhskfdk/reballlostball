import { expect, test } from "@playwright/test";

const darkInk = "rgb(20, 48, 31)";
const darkTurf = "rgb(46, 92, 63)";
const paper = "rgb(247, 246, 241)";

test("home-stage copy remains readable even while the hero body state is dark", async ({ page }) => {
  await page.goto("/#/");

  // Reproduce the contrast failure that axe found: the SECOND ROUND runtime can
  // temporarily make the body dark while later home stages already exist in DOM.
  await page.evaluate(() => document.body.classList.add("second-round-active"));

  for (const selector of [".home-stage--trust", ".home-stage--products", ".home-stage--shipping"]) {
    await expect(page.locator(selector)).toHaveCSS("background-color", paper);
  }

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
    await expect(eyebrow).toHaveCSS("opacity", "1");
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

    const hero = page.locator(".second-round-hero");
    await expect(hero).toBeVisible();
    await hero.evaluate((node) => node.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.waitForTimeout(80);

    const bridge = page.locator(".second-round-bridge");
    await expect(bridge).toBeVisible();
    await expect(bridge).toHaveAttribute("aria-hidden", "false");
    await expect(bridge.locator("h2")).toHaveCSS("color", "rgb(16, 42, 27)");
    await expect(bridge.locator(".second-round-bridge-body")).toHaveCSS("color", "rgb(70, 89, 75)");
    await expect(bridge.locator(".second-round-cta")).toBeVisible();

    const geometry = await bridge.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const paperNode = document.querySelector(".second-round-paper");
      const ornament = paperNode ? getComputedStyle(paperNode, "::before") : null;
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
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
    expect(geometry.height).toBeGreaterThan(viewport.name === "desktop" ? 250 : 220);
    expect(geometry.clientHeight).toBeLessThanOrEqual(viewport.height);
    expect(geometry.scrollHeight).toBeGreaterThanOrEqual(geometry.clientHeight);
    expect(geometry.background).toBe("rgba(255, 255, 255, 0.92)");
    expect(geometry.ornamentContent).not.toBe("none");
    expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  });
}
