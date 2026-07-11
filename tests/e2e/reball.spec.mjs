import { expect, test } from "@playwright/test";

async function injectConfiguredSupabaseIndex(page) {
  await page.route("http://127.0.0.1:4190/", async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace('name="reball-supabase-url" content=""', 'name="reball-supabase-url" content="https://test-project.supabase.co"')
      .replace('name="reball-supabase-publishable-key" content=""', 'name="reball-supabase-publishable-key" content="test-publishable-key"');
    await route.fulfill({ response, body });
  });
}

const routes = [
  ["home", "/#/"],
  ["product", "/#/product/titleist-pro-v1-v1x-lostball"],
  ["cart", "/#/cart"],
  ["checkout", "/#/checkout"],
  ["login", "/#/login"],
  ["signup", "/#/signup"],
  ["guest order", "/#/login/order"],
  ["admin", "/#/admin"],
];

test("development entry uses the production HTML and app module", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('script[type="module"][src^="./app.js"]')).toHaveCount(1);
  await expect(page.locator('script[src*="app-current.js"]')).toHaveCount(0);
});

test("Supabase CDN failure keeps the static storefront available", async ({ page }) => {
  await injectConfiguredSupabaseIndex(page);
  let sdkRequests = 0;
  await page.route("https://cdn.jsdelivr.net/**", (route) => {
    sdkRequests += 1;
    return route.abort();
  });
  await page.goto("/#/");
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main")).toContainText("프리미엄 로스트볼");
  await expect.poll(() => sdkRequests).toBeGreaterThan(0);
});

test("a stalled Supabase CDN cannot hold the storefront module blank", async ({ page }) => {
  await injectConfiguredSupabaseIndex(page);
  let sdkRequests = 0;
  await page.route("https://cdn.jsdelivr.net/**", async (route) => {
    sdkRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    await route.abort().catch(() => {});
  });
  await page.goto("/#/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main h1")).toHaveCount(1, { timeout: 1_500 });
  await expect(page.locator("main")).toContainText("프리미엄 로스트볼");
  await expect.poll(() => sdkRequests).toBeGreaterThan(0);
});

test("checkout collects the server-required five-digit postal code", async ({ page }) => {
  await page.goto("/#/checkout");
  const postalCode = page.locator('[name="zipCode"]');
  await expect(postalCode).toHaveAttribute("required", "");
  await expect(postalCode).toHaveAttribute("pattern", "[0-9]{5}");
  await expect(page.locator('[name="roadAddress"]')).toHaveAttribute("required", "");
});

test("Toss success return confirms on the server and removes paymentKey from the URL", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "reball.guestLookup.session.v1",
      JSON.stringify({ orderId: "ORDER_123456", lookupToken: "guest-lookup-token" })
    );
  });
  let confirmationBody;
  await page.route("**/functions/v1/payment-confirm", async (route) => {
    confirmationBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paid: true,
        order: {
          orderNo: "ORDER_123456",
          status: "paid",
          paymentStatus: "paid",
          deliveryStatus: "shipping_ready",
          totalKrw: 18000,
          customer: { name: "테스트" },
          items: [],
        },
      }),
    });
  });

  await page.goto("/?paymentKey=pay_test_123&orderId=ORDER_123456&amount=18000#/payment/success");
  await expect(page.locator("main h1")).toContainText("주문 접수가 완료되었습니다");
  expect(confirmationBody).toEqual({
    paymentKey: "pay_test_123",
    orderId: "ORDER_123456",
    amount: 18000,
    guestLookupToken: "guest-lookup-token",
  });
  expect(page.url()).not.toContain("paymentKey");
  expect(new URL(page.url()).hash).toBe("#/order/ORDER_123456");
});

test("mock card confirmation failure never renders a completed order and scrubs the payment key", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "reball.guestLookup.session.v1",
      JSON.stringify({ orderId: "ORDER_FAILED_123", lookupToken: "guest-lookup-token" })
    );
  });
  let confirmationCalls = 0;
  await page.route("**/functions/v1/payment-confirm", async (route) => {
    confirmationCalls += 1;
    await route.fulfill({
      status: 402,
      contentType: "application/json",
      body: JSON.stringify({ code: "PAYMENT_REJECTED", message: "결제가 승인되지 않았습니다." }),
    });
  });

  await page.goto("/?paymentKey=pay_mock_failure&orderId=ORDER_FAILED_123&amount=18000#/payment/success");
  await expect(page.locator("main h1")).toHaveText("결제를 완료하지 못했습니다.");
  await expect(page.locator("main")).toContainText("결제가 승인되지 않았습니다.");
  await expect(page.locator("main")).not.toContainText("주문 접수가 완료되었습니다.");
  expect(confirmationCalls).toBe(1);
  expect(page.url()).not.toContain("paymentKey");
  expect(new URL(page.url()).hash).toBe("#/payment/fail");
});

for (const [name, route] of routes) {
  test(`${name} exposes one page-level heading`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("main h1")).toHaveCount(1);
  });
}

test("home follows the six-stage purchase hierarchy", async ({ page }) => {
  await page.goto("/#/");
  const stages = page.locator("main [data-home-stage]");
  await expect(stages).toHaveCount(6);
  expect(await stages.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-home-stage")))).toEqual([
    "1", "2", "3", "4", "5", "6",
  ]);
});

test("forged local admin state cannot reveal the admin shell", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("reball.adminUser", JSON.stringify({ id: "admin", role: "owner_admin" }));
    localStorage.setItem("reball.adminCredentials", JSON.stringify({ id: "admin", password: "forged" }));
  });
  await page.goto("/#/admin");
  await expect(page.locator("[data-admin-login-form]")).toBeVisible();
  await expect(page.locator("[data-admin-shell]")).toHaveCount(0);
});

test("legacy sensitive localStorage is purged", async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of [
      "reball.ephemeralOrders",
      "reball.adminUser",
      "reball.adminCredentials",
      "reball.adminCustomers",
      "reball.pendingSignupEmail",
    ]) localStorage.setItem(key, "sensitive-test-value");
  });
  await page.goto("/#/");
  const remaining = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      [
        "reball.ephemeralOrders",
        "reball.adminUser",
        "reball.adminCredentials",
        "reball.adminCustomers",
        "reball.pendingSignupEmail",
      ].includes(key)
    )
  );
  expect(remaining).toEqual([]);
});

test("product is purchasable only with a server-backed exact variant", async ({ page }) => {
  await page.goto("/#/product/titleist-pro-v1-v1x-lostball");
  const buy = page.locator("[data-add-detail]");
  await expect(buy).toHaveCount(1);
  const state = await buy.evaluate((button) => ({
    disabled: button.disabled,
    variantId: button.getAttribute("data-variant-id"),
  }));
  if (!state.disabled) expect(state.variantId).toBeTruthy();
});

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`viewport ${width}px has no document-level horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow).toBe(false);
  });
}

test("primary commerce action is keyboard reachable", async ({ page }) => {
  await page.goto("/#/");
  const primary = page.locator('[data-home-stage="1"] .gold-cart-btn[data-scroll-to="products"]');
  await expect(primary).toHaveCount(1);
  await primary.focus();
  await expect(primary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-home-stage="3"]')).toBeVisible();
});
