import { expect, test } from "@playwright/test";

test("checkout exposes only contracted payment methods and the maximum delivery period", async ({ page }) => {
  await page.goto("/#/checkout");
  await expect(page.locator('input[name="payment"][value="card"]')).toHaveCount(1);
  await expect(page.locator('input[name="payment"][value="transfer"]')).toHaveCount(1);
  await expect(page.locator('input[name="payment"][value="easy"]')).toHaveCount(1);
  await expect(page.locator('input[name="payment"][value="virtual"]')).toHaveCount(0);
  await expect(page.getByText(/최대 배송기간: 결제일로부터 최대 7일/).first()).toBeVisible();
  await expect(page.getByText(/카드·계좌이체·간편결제는 토스페이먼츠 결제창/)).toBeVisible();
});

for (const width of [768, 1024, 1180, 1440]) {
  test(`checkout ${width}px has no document-level horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/#/checkout");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow).toBe(false);
  });
}

test("prepared Toss payment is requested from the retry button click", async ({ page }) => {
  await page.route("https://js.tosspayments.com/v2/standard", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.TossPayments = function(clientKey) {
          return {
            payment: function(options) {
              return {
                requestPayment: function(payment) {
                  window.__reballTossRequest = { clientKey, customerKey: options.customerKey, payment };
                  return Promise.resolve({ ok: true });
                }
              };
            }
          };
        };
      `,
    });
  });

  await page.route("**/functions/v1/prepare-payment", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        orderId: "RB-PAYMENT-TEST-001",
        clientKey: "test_ck_contract",
        customerKey: "guest_contract-test",
        payment: {
          method: "CARD",
          amount: { currency: "KRW", value: 18500 },
          orderId: "RB-PAYMENT-TEST-001",
          orderName: "브리지스톤 로스트볼",
          successUrl: "https://reballlostball.com/payment/success",
          failUrl: "https://reballlostball.com/payment/fail",
        },
      }),
    });
  });

  await page.goto("/?payment=fail&orderId=RB-PAYMENT-TEST-001#/payment/fail");
  const button = page.locator('[data-payment-retry="RB-PAYMENT-TEST-001"]');
  await expect(button).toBeEnabled({ timeout: 10_000 });
  await expect(button).toHaveText("토스 결제하기");
  await button.click();
  await expect.poll(() => page.evaluate(() => window.__reballTossRequest || null)).toMatchObject({
    clientKey: "test_ck_contract",
    customerKey: "guest_contract-test",
    payment: {
      method: "CARD",
      amount: { currency: "KRW", value: 18500 },
      orderId: "RB-PAYMENT-TEST-001",
    },
  });
});
