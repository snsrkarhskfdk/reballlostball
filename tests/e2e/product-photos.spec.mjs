import { expect, test } from "@playwright/test";

test("supplied product photos load on the homepage and detail gallery", async ({ page }) => {
  await page.goto("/#/");

  const homeGrid = page.locator(".featured-product-grid");
  await expect(homeGrid).toBeVisible();
  const suppliedCards = homeGrid.locator("img.catalog-product-photo");
  await expect(suppliedCards).toHaveCount(6);
  for (const image of await suppliedCards.all()) {
    await expect(image).toHaveJSProperty("complete", true);
    expect(await image.evaluate((node) => node.naturalWidth)).toBeGreaterThan(0);
    const bounds = await image.evaluate((node) => {
      const imageRect = node.getBoundingClientRect();
      const mediaRect = node.closest(".product-media").getBoundingClientRect();
      return {
        image: {
          left: imageRect.left,
          top: imageRect.top,
          right: imageRect.right,
          bottom: imageRect.bottom,
        },
        media: {
          left: mediaRect.left,
          top: mediaRect.top,
          right: mediaRect.right,
          bottom: mediaRect.bottom,
        },
      };
    });
    expect(bounds.image.left).toBeGreaterThanOrEqual(bounds.media.left - 1);
    expect(bounds.image.top).toBeGreaterThanOrEqual(bounds.media.top - 1);
    expect(bounds.image.right).toBeLessThanOrEqual(bounds.media.right + 1);
    expect(bounds.image.bottom).toBeLessThanOrEqual(bounds.media.bottom + 1);
  }
  await homeGrid.screenshot({ path: "artifacts/homepage-product-photos.png" });

  await page.goto("/#/product/bridgestone-tour-b-lostball");
  const suppliedThumbs = page.locator(".thumb-row img.catalog-product-photo");
  await expect(suppliedThumbs).toHaveCount(7);
  for (const image of await suppliedThumbs.all()) {
    await expect(image).toHaveJSProperty("complete", true);
    expect(await image.evaluate((node) => node.naturalWidth)).toBeGreaterThan(0);
  }
});
