import { expect, test } from "@playwright/test";

test("ambiguous Toss confirmation stays on exact confirmation recovery and never prepare-payment", async ({ page }) => {
  let confirmCalls = 0;
  let prepareCalls = 0;

  await page.route("**/functions/v1/prepare-payment", async (route) => {
    prepareCalls += 1;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ code: "ORDER_NOT_PAYMENT_READY", message: "must not be called during confirmation recovery" }),
    });
  });

  await page.route("**/functions/v1/payment-confirm", async (route) => {
    confirmCalls += 1;
    if (confirmCalls <= 3) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: "INTERNAL_ERROR", message: "provider result still ambiguous" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paid: true,
        order: {
          id: "order-recover-1",
          orderNumber: "ORDER-RECOVER-1",
          status: "paid",
          paymentStatus: "done",
          deliveryStatus: "preparing",
          amount: 17000,
          paidAmount: 17000,
          paymentMethod: "card",
          items: [],
        },
      }),
    });
  });

  await page.goto("/?payment=success&paymentKey=pk_recover&orderId=order-recover-1&amount=17000#/payment/success");
  await expect(page).toHaveURL(/#\/payment\/fail\?orderId=ORDER-RECOVER-1$/, { timeout: 10_000 });
  expect(confirmCalls).toBe(3);

  const recovery = page.locator("[data-payment-confirm-recovery]");
  await expect(recovery).toHaveCount(1);
  await expect(recovery).toBeEnabled();
  await expect(recovery).toHaveText("결제 결과 다시 확인");
  await page.waitForTimeout(250);
  expect(prepareCalls).toBe(0);

  await recovery.click();
  await expect.poll(() => confirmCalls).toBe(4);
  await expect(page).toHaveURL(/#\/order\/ORDER-RECOVER-1$/, { timeout: 5_000 });
  expect(prepareCalls).toBe(0);
});
