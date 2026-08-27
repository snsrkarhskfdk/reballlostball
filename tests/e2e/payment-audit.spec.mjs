import { expect, test } from "@playwright/test";

const paidOrder = {
  id: "00000000-0000-4000-8000-000000000101",
  orderNo: "RB-AUDIT-PAID-001",
  orderName: "감사 테스트 주문",
  status: "paid",
  paymentStatus: "done",
  paymentMethod: "card",
  totalKrw: 18_000,
  createdAt: "2026-08-28T00:00:00.000Z",
  address: { receiverName: "테스트 고객" },
  items: [],
};

test("payment failure keeps a safe order retry route after reload", async ({ page }) => {
  await page.route("**/functions/v1/prepare-payment", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ code: "PAYMENT_CONFIG_MISSING", message: "결제 설정을 확인할 수 없습니다." }),
  }));
  await page.goto("/?code=PAY_PROCESS_ABORTED&orderId=RB-AUDIT-FAIL-001#/payment/fail");
  await expect(page.locator('[data-payment-retry="RB-AUDIT-FAIL-001"]')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[data-payment-retry="RB-AUDIT-FAIL-001"]')).toHaveCount(1);
  expect(new URL(page.url()).searchParams.has("code")).toBe(false);
});

test("Toss SDK load failure leaves an operable retry path", async ({ page }) => {
  let sdkRequests = 0;
  await page.route("https://js.tosspayments.com/v2/standard", async (route) => {
    sdkRequests += 1;
    if (sdkRequests === 1) return route.abort("failed");
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.TossPayments = function(clientKey) {
          return { payment: function(options) {
            return { requestPayment: function(payment) {
              window.__auditTossRequest = { clientKey, customerKey: options.customerKey, payment };
              return Promise.resolve({ ok: true });
            }};
          }};
        };
      `,
    });
  });
  await page.route("**/functions/v1/prepare-payment", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      clientKey: "test_ck_audit",
      customerKey: "guest_audit",
      payment: {
        method: "CARD",
        amount: { currency: "KRW", value: 18_000 },
        orderId: "RB-AUDIT-SDK-001",
        orderName: "감사 테스트 주문",
        successUrl: "https://reballlostball.com/payment/success",
        failUrl: "https://reballlostball.com/payment/fail",
      },
    }),
  }));

  await page.goto("/?orderId=RB-AUDIT-SDK-001#/payment/fail");
  const button = page.locator('[data-payment-retry="RB-AUDIT-SDK-001"]');
  await expect(button).toBeEnabled({ timeout: 10_000 });
  await button.click();
  await expect(button).toHaveText("토스 결제하기", { timeout: 10_000 });
  await button.click();
  await expect.poll(() => page.evaluate(() => window.__auditTossRequest || null)).toMatchObject({
    clientKey: "test_ck_audit",
    customerKey: "guest_audit",
    payment: { orderId: "RB-AUDIT-SDK-001" },
  });
});

test("unknown confirmation result stays pending without offering another payment", async ({ page }) => {
  await page.route("**/functions/v1/get-order", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      order: {
        ...paidOrder,
        orderNo: "RB-AUDIT-PENDING-001",
        status: "payment_auth_started",
        paymentStatus: "in_progress",
      },
    }),
  }));
  await page.route("**/functions/v1/payment-confirm", (route) => route.fulfill({
    status: 502,
    contentType: "application/json",
    body: JSON.stringify({
      code: "PAYMENT_RESULT_UNKNOWN",
      message: "결제 승인 결과를 확인 중입니다. 같은 주문으로 다시 확인해 주세요.",
    }),
  }));
  await page.goto("/payment/success?paymentKey=pk_audit_unknown&orderId=RB-AUDIT-PENDING-001&amount=18000");
  await expect(page.getByRole("heading", { name: "결제 승인 결과를 확인하고 있습니다." })).toBeVisible();
  await expect(page.locator("[data-payment-retry]")).toHaveCount(0);
  await expect(page.locator('[data-payment-status-refresh="RB-AUDIT-PENDING-001"]')).toBeVisible();
  expect(new URL(page.url()).searchParams.has("paymentKey")).toBe(false);
});

test("provider response mismatch is reconciled instead of launching a second payment", async ({ page }) => {
  await page.route("**/functions/v1/payment-confirm", (route) => route.fulfill({
    status: 409,
    contentType: "application/json",
    body: JSON.stringify({ code: "PAYMENT_RESPONSE_MISMATCH", message: "결제 승인 결과를 확인 중입니다." }),
  }));
  await page.route("**/functions/v1/get-order", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      order: { ...paidOrder, orderNo: "RB-AUDIT-MISMATCH-001", status: "payment_auth_started", paymentStatus: "in_progress" },
    }),
  }));
  await page.goto("/payment/success?paymentKey=pk_wrong&orderId=RB-AUDIT-MISMATCH-001&amount=18000");
  await expect(page.locator('[data-payment-status-refresh="RB-AUDIT-MISMATCH-001"]')).toBeVisible();
  await expect(page.locator("[data-payment-retry]")).toHaveCount(0);
});

test("lost confirmation response is treated as unknown and polled", async ({ page }) => {
  await page.route("**/functions/v1/payment-confirm", (route) => route.abort("failed"));
  await page.route("**/functions/v1/get-order", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      order: { ...paidOrder, orderNo: "RB-AUDIT-LOST-RESPONSE-001", status: "payment_auth_started", paymentStatus: "in_progress" },
    }),
  }));
  await page.goto("/payment/success?paymentKey=pk_response_lost&orderId=RB-AUDIT-LOST-RESPONSE-001&amount=18000");
  await expect(page.locator('[data-payment-status-refresh="RB-AUDIT-LOST-RESPONSE-001"]')).toBeVisible();
  await expect(page.locator("[data-payment-retry]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "새 주문 시작" })).toHaveCount(0);
});

test("cancellation race after confirmation remains pending", async ({ page }) => {
  await page.route("**/functions/v1/payment-confirm", (route) => route.fulfill({
    status: 409,
    contentType: "application/json",
    body: JSON.stringify({ code: "ORDER_CANCELLATION_PENDING", message: "취소 처리 중인 주문입니다." }),
  }));
  await page.route("**/functions/v1/get-order", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      order: { ...paidOrder, orderNo: "RB-AUDIT-CANCEL-RACE-001", status: "cancel_requested", paymentStatus: "done" },
    }),
  }));
  await page.goto("/payment/success?paymentKey=pk_cancel_race&orderId=RB-AUDIT-CANCEL-RACE-001&amount=18000");
  await expect(page.locator('[data-payment-status-refresh="RB-AUDIT-CANCEL-RACE-001"]')).toBeVisible();
  await expect(page.locator("[data-payment-retry]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "새 주문 시작" })).toHaveCount(0);
});

test("definitive confirmation failure requires a new order", async ({ page }) => {
  await page.route("**/functions/v1/payment-confirm", (route) => route.fulfill({
    status: 402,
    contentType: "application/json",
    body: JSON.stringify({ code: "PAYMENT_NOT_COMPLETED", message: "결제가 완료되지 않았습니다." }),
  }));
  await page.goto("/payment/success?paymentKey=pk_rejected&orderId=RB-AUDIT-REJECTED-001&amount=18000");
  await expect(page.getByRole("button", { name: "새 주문 시작" })).toBeVisible();
  await expect(page.locator("[data-payment-retry]")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "새 주문 시작" })).toBeVisible();
});

test("pending confirmation reload polls order truth without starting another payment", async ({ page }) => {
  let lookups = 0;
  const paymentMutations = [];
  page.on("request", (request) => {
    if (request.method() === "POST"
        && /\/(?:prepare-payment|payment-confirm)$/.test(new URL(request.url()).pathname)) {
      paymentMutations.push(request.url());
    }
  });
  await page.route("**/functions/v1/get-order", (route) => {
    lookups += 1;
    const pending = {
      ...paidOrder,
      orderNo: "RB-AUDIT-POLL-001",
      status: "payment_auth_started",
      paymentStatus: "in_progress",
    };
    const resolved = { ...paidOrder, orderNo: "RB-AUDIT-POLL-001" };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ order: lookups < 2 ? pending : resolved }),
    });
  });

  await page.goto("/#/payment/fail?orderId=RB-AUDIT-POLL-001&pending=1");
  await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("#/order/RB-AUDIT-POLL-001");
  expect(lookups).toBeGreaterThanOrEqual(2);
  expect(paymentMutations).toEqual([]);
});

test("duplicate DONE confirmation is still presented as paid", async ({ page }) => {
  await page.route("**/functions/v1/payment-confirm", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ order: paidOrder, duplicate: true }),
  }));
  await page.route("**/functions/v1/get-order", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ order: paidOrder }),
  }));
  await page.goto("/?paymentKey=pk_audit_done&orderId=RB-AUDIT-PAID-001&amount=18000#/payment/success");
  await expect(page.locator(".toast")).toContainText("결제가 완료되었습니다.");
  await expect(page.getByText("가상계좌 입금 안내를 확인해 주세요.")).toHaveCount(0);
});

test("partial cancellation response is never rendered as a full refund", async ({ page }) => {
  await page.route(/^http:\/\/127\.0\.0\.1:4190\/(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace('name="reball-supabase-url" content=""', 'name="reball-supabase-url" content="http://127.0.0.1:4190"')
      .replace('name="reball-supabase-publishable-key" content=""', 'name="reball-supabase-publishable-key" content="test_publishable_key"');
    await route.fulfill({ response, body });
  });
  await page.route("**/functions/v1/payment-confirm", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ order: paidOrder, paid: true }),
  }));
  await page.route("**/functions/v1/get-order", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ order: paidOrder }),
  }));
  await page.route("**/functions/v1/payment-cancel", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      order: { ...paidOrder, status: "partially_canceled", paymentStatus: "partial_canceled", refundAmount: 9_000 },
      duplicate: true,
      partial: true,
      retryRequiresNewKey: true,
    }),
  }));
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/?paymentKey=pk_audit_partial&orderId=RB-AUDIT-PAID-001&amount=18000#/payment/success");
  const cancel = page.locator('[data-payment-cancel-order="RB-AUDIT-PAID-001"]');
  await expect(cancel).toBeVisible({ timeout: 10_000 });
  const cancelResponse = page.waitForResponse((response) => (
    response.url().includes("/functions/v1/payment-cancel")
      && response.request().method() === "POST"
  ));
  await cancel.click();
  await cancelResponse;
  await expect(page.getByText("결제가 취소되었습니다. 결제 및 재고 상태도 서버에서 함께 반영되었습니다.")).toHaveCount(0);
  await expect(page.getByText("주문 취소", { exact: true })).toHaveCount(0);
  await expect(page.getByText("환불 완료", { exact: true })).toHaveCount(0);
  await expect(page.getByText("부분 취소", { exact: true })).toBeVisible();
  await expect(page.getByText("부분 환불", { exact: true })).toBeVisible();
  await expect(page.getByText("일부 금액만 취소되었습니다. 남은 결제 금액은 다시 취소할 수 있습니다.")).toBeVisible();
  await expect(cancel).toHaveText("남은 금액 취소 다시 시도");
  await expect(cancel).toBeVisible();
});
