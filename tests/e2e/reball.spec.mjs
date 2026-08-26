import { expect, test } from "@playwright/test";

const routes = [
  ["home", "/#/"],
  ["product", "/#/product/titleist-pro-v1-v1x-lostball"],
  ["cart", "/#/cart"],
  ["checkout", "/#/checkout"],
  ["login", "/#/login"],
  ["signup", "/#/signup"],
  ["guest order", "/#/guest-order"],
  ["admin", "/#/admin"],
];

test("development entry uses the production HTML and app module", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("script[type=module][src^='./app.js']")).toHaveCount(1);
  await expect(page.locator("script[src*='app-current']")).toHaveCount(0);
});

test("Supabase CDN failure keeps the static storefront available", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort("failed"));
  await page.goto("/#/");
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator(".featured-product-grid")).toBeVisible();
});

test("a stalled Supabase CDN cannot hold the storefront module blank", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.abort("timedout");
  });
  await page.goto("/#/");
  await expect(page.locator("main h1")).toHaveCount(1, { timeout: 5_000 });
  await expect(page.locator(".featured-product-grid")).toBeVisible();
});

test("checkout exposes the server-required five-digit postal code", async ({ page }) => {
  await page.goto("/#/checkout");
  const postal = page.locator('input[name="zipCode"]');
  await expect(postal).toHaveCount(1);
  await expect(postal).toHaveAttribute("pattern", "[0-9]{5}");
});

test("Toss success return confirms on the server and removes paymentKey from the URL", async ({ page }) => {
  let confirmationPayload;
  await page.route("**/functions/v1/payment-confirm", async (route) => {
    confirmationPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        order: {
          id: "order-1",
          orderNumber: "RB-20260826-001",
          status: "paid",
          paymentStatus: "paid",
          deliveryStatus: "preparing",
          amount: 17000,
          paidAmount: 17000,
          paymentMethod: "card",
          items: [],
        },
      }),
    });
  });
  await page.goto("/?payment=success&paymentKey=pk_test&orderId=order-1&amount=17000#/payment/success");
  await expect.poll(() => confirmationPayload).toBeTruthy();
  expect(confirmationPayload).toEqual({ paymentKey: "pk_test", orderId: "ORDER-1", amount: 17000 });
  await expect(page).toHaveURL(/#\/order\/ORDER-1$/);
  expect(new URL(page.url()).searchParams.has("paymentKey")).toBe(false);
});

test("mock card confirmation failure never renders a completed order and scrubs the payment key", async ({ page }) => {
  await page.route("**/functions/v1/payment-confirm", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Mock card was rejected",
        code: "MOCK_CARD_DECLINED",
      }),
    });
  });
  await page.goto("/?payment=success&paymentKey=pk_fail&orderId=order-2&amount=17000#/payment/success");
  await expect(page).toHaveURL(/#\/payment\/fail$/);
  expect(new URL(page.url()).searchParams.has("paymentKey")).toBe(false);
  expect(new URL(page.url()).hash).toBe("#/payment/fail");
});

for (const [name, route] of routes) {
  test(`${name} exposes one page-level heading`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("main h1")).toHaveCount(1);
  });
}

test("home keeps five semantic stages while placing purchasable products directly after the hero", async ({ page }) => {
  await page.goto("/#/");
  const stages = page.locator("main [data-home-stage]");
  await expect(stages).toHaveCount(5);
  expect(await stages.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-home-stage")))).toEqual([
    "1", "3", "2", "4", "5",
  ]);
  await expect(page.locator("main .home-stage--store")).toHaveCount(0);
  await expect(page.locator("footer .footer-store-business")).toHaveCount(1);
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
  const primary = page.locator("[data-second-round-cta]");
  await expect(primary).toHaveCount(1);
  await primary.focus();
  await expect(primary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-home-stage="3"]')).toBeVisible();
});
