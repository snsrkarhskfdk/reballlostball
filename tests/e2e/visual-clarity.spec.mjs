import { expect, test } from "@playwright/test";

const darkInk = "rgb(20, 48, 31)";
const darkTurf = "rgb(46, 92, 63)";
const paper = "rgb(247, 246, 241)";

test("home-stage copy remains readable even while the hero body state is dark", async ({ page }) => {
  await page.goto("/#/");

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
  test(`SECOND ROUND video hands directly to the normal storefront on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/#/");

    const hero = page.locator(".second-round-hero");
    const products = page.locator("#products");
    await expect(hero).toBeVisible();
    await expect(products).toHaveCount(1);
    await expect(page.locator(".second-round-frame")).toHaveCount(0);
    await expect(page.locator(".second-round-bridge")).toHaveCount(0);
    await expect(page.locator(".second-round-paper")).toHaveCount(0);
    await expect(page.locator("[data-second-round-cta]")).toHaveCount(0);

    const directSibling = await hero.evaluate((node) => node.nextElementSibling?.id || "");
    expect(directSibling).toBe("products");

    const heroBottom = await hero.evaluate((node) => node.offsetTop + node.offsetHeight);
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), heroBottom);
    await page.waitForTimeout(120);

    await expect(products).toBeVisible();
    await expect(page.locator(".site-header")).toBeVisible();
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      productsTop: document.querySelector("#products")?.getBoundingClientRect().top ?? 9999,
    }));
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.productsTop).toBeLessThan(viewport.height);
  });
}
