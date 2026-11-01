import { expect, test } from "@playwright/test";

test("local-only wishlist controls and account summary are absent in production UI", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("reball.wishlist", JSON.stringify(["titleist-pro-v1-v1x-lostball"]));
  });
  await page.goto("/#/");
  await expect(page.locator("[data-wish-card]")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("reball.wishlist"))).toBeNull();

  await page.goto("/#/mypage");
  await expect(page.locator('[data-my-tab="wishlist"]')).toHaveCount(0);
  await expect(page.locator(".mypage-summary article").filter({ hasText: "찜" })).toHaveCount(0);
});
