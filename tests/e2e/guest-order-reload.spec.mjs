import { expect, test } from "@playwright/test";

const ORDER_ID = "RB-90607D8AE3E5492B8FE1F3EF";
const LOOKUP_TOKEN = "guest_lookup_test_token_abcdefghijklmnopqrstuvwxyz_123456";

async function expectRecoveredCanceledOrder(page) {
  await expect(page.getByRole("heading", { name: "결제가 취소되었습니다." })).toBeVisible();
  await expect(page.getByText("주문을 찾을 수 없습니다.")).toHaveCount(0);
  const dateValue = page.locator("dt", { hasText: "주문일" }).locator("xpath=following-sibling::dd[1]");
  await expect(dateValue).toHaveText("2026. 8. 29. 21:11");
  await expect(page.locator("[data-payment-cancel-order]")).toHaveCount(0);
  await expect(page.locator(".order-lookup-token code")).toContainText("123456");
}

test("guest order route survives a full reload by reloading the server order", async ({ page }) => {
  // This regression is about our server-backed capability-token recovery, not an
  // external CDN's cold-start latency. Force the storefront's documented static
  // fallback path so the test stays deterministic even on a fresh CI runner.
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort("failed"));

  await page.addInitScript(({ orderId, lookupToken }) => {
    sessionStorage.setItem("reball.guestLookup.session.v1", JSON.stringify({ orderId, lookupToken }));
  }, { orderId: ORDER_ID, lookupToken: LOOKUP_TOKEN });

  let lookupCount = 0;
  await page.route("**/functions/v1/guest-order-lookup", async (route) => {
    lookupCount += 1;
    const request = route.request();
    const body = JSON.parse(request.postData() || "{}");
    expect(body.orderId).toBe(ORDER_ID);
    expect(body.lookupToken).toBe(LOOKUP_TOKEN);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        order: {
          id: "54e2f208-d0c6-4a02-a6e1-3eae2f9d4c71",
          orderNo: ORDER_ID,
          status: "canceled",
          paymentStatus: "canceled",
          paymentMethod: "card",
          totalKrw: 36500,
          createdAt: "2026-08-29T12:11:13.539217+00:00",
          deliveryStatus: "배송 준비 전",
          address: { receiverName: "김연준" },
          items: [],
        },
      }),
    });
  });

  await page.goto(`/#/order/${ORDER_ID}`);
  await expectRecoveredCanceledOrder(page);
  await expect.poll(() => lookupCount).toBeGreaterThanOrEqual(1);

  // The original regression happened after a browser refresh. Verify that exact
  // boundary rather than merely navigating to the route once.
  await page.reload();
  await expectRecoveredCanceledOrder(page);
  await expect.poll(() => lookupCount).toBeGreaterThanOrEqual(2);
});
