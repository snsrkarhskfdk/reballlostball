import { expect, test } from "@playwright/test";

const ORDER_ID = "RB-MOBILE-RETURN-001";

async function mockPaymentPreparation(page) {
  await page.route("https://js.tosspayments.com/v2/standard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "window.TossPayments=function(){return{payment:function(){return{requestPayment:function(){return Promise.resolve({ok:true})}}}}}" });
  });
  await page.route("**/functions/v1/prepare-payment", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        orderId: ORDER_ID,
        clientKey: "test_ck_contract",
        customerKey: "guest_contract-test",
        payment: {
          method: "CARD",
          amount: { currency: "KRW", value: 30500 },
          orderId: ORDER_ID,
          orderName: "테스트 로스트볼",
          successUrl: "https://reballlostball.com/payment/success",
          failUrl: "https://reballlostball.com/payment/fail",
        },
      }),
    });
  });
}

test("mobile failed Toss return stays a failure page and retains retry after reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPaymentPreparation(page);

  await page.goto(`/?paymentKey=pay_should_be_scrubbed&code=PAY_PROCESS_CANCELED&message=cancel&orderId=${ORDER_ID}#/payment/fail`);

  await expect(page.getByRole("heading", { name: "결제를 완료하지 못했습니다." })).toBeVisible();
  await expect(page.getByText("주문이 접수되었습니다.")).toHaveCount(0);
  await expect(page.locator(`[data-payment-retry="${ORDER_ID}"]`)).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => location.href)).toContain(`#/payment/fail?orderId=${ORDER_ID}`);
  expect(await page.evaluate(() => location.href)).not.toContain("paymentKey");
  expect(await page.evaluate(() => location.href)).not.toContain("code=");
  expect(await page.evaluate(() => location.href)).not.toContain("message=");

  await page.reload();

  await expect(page.getByRole("heading", { name: "결제를 완료하지 못했습니다." })).toBeVisible();
  await expect(page.getByText("주문이 접수되었습니다.")).toHaveCount(0);
  await expect(page.locator(`[data-payment-retry="${ORDER_ID}"]`)).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => location.href)).toContain(`#/payment/fail?orderId=${ORDER_ID}`);
});
