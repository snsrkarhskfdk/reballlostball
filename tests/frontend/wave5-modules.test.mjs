import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRoute,
  paymentReturnKind,
  paymentReturnParams,
  replacePaymentReturnUrl,
} from "../../src/frontend/core/router.mjs";
import { createAppState } from "../../src/frontend/core/state.mjs";
import {
  bundleId,
  cartItemDescription,
  cartItemFromVariant,
  cartTotal,
  shippingCost,
} from "../../src/frontend/cart/model.mjs";
import {
  checkoutCustomerFromForm,
  isCheckoutCustomerValid,
  renderCheckoutField,
  renderCheckoutMethod,
} from "../../src/frontend/checkout/view.mjs";
import {
  normalizeNotifications,
  translateDeliveryStatus,
  translateOrderStatus,
  translatePaymentStatus,
} from "../../src/frontend/account/presentation.mjs";
import {
  adminChartPercentages,
  adminDefaultModal,
  adminTabLabel,
  defaultAdminProfile,
} from "../../src/frontend/admin/presentation.mjs";
import { businessProfile, products, shippingPolicy } from "../../src/frontend/catalog/content.mjs";

test("router helpers normalize hashes and scrub payment return URLs", () => {
  const successLocation = {
    hash: "#/payment/success?orderId=RB-100&amount=18000",
    pathname: "/payment/success/",
    search: "?paymentKey=pay_test&amount=999",
  };
  assert.equal(parseRoute(successLocation), "/payment/success");
  assert.equal(paymentReturnKind(successLocation), "success");
  const params = paymentReturnParams(successLocation);
  assert.equal(params.get("paymentKey"), "pay_test");
  assert.equal(params.get("orderId"), "RB-100");
  assert.equal(params.get("amount"), "999", "the canonical URL query must win over a duplicate hash value");

  let replaced = "";
  replacePaymentReturnUrl("/order/RB-100", {
    documentRef: { baseURI: "https://shop.example/store/index.html" },
    historyRef: { replaceState: (_state, _title, value) => { replaced = value; } },
  });
  assert.equal(replaced, "/store/#/order/RB-100");
  assert.equal(replaced.includes("paymentKey"), false);
});

test("state factory creates independent mutable collections", () => {
  const first = createAppState({ route: "/cart", products: [{ slug: "ball" }] });
  const second = createAppState();
  first.cart.push({ variantId: "variant-a", quantity: 1 });
  first.authRoles.push("owner_admin");
  assert.equal(first.route, "/cart");
  assert.deepEqual(second.cart, []);
  assert.deepEqual(second.authRoles, []);
  assert.notEqual(first.cart, second.cart);
});

test("cart module keeps variant identity and authoritative quantity math", () => {
  const product = { slug: "titleist", name: "타이틀리스트", brandName: "Titleist", image: "ball.webp" };
  const variant = {
    id: "variant-1",
    sku: "TITLEIST-A-10",
    model: "PRO V1",
    grade: "A",
    pack: "10알",
    color: "화이트",
    price: 18_000,
    compareAtPrice: 20_000,
    stock: 3,
    imageUrl: "variant.webp",
  };
  const item = cartItemFromVariant(product, variant, 2);
  assert.equal(item.variantId, "variant-1");
  assert.equal(item.quantity, 2);
  assert.equal(cartItemDescription(item), "PRO V1 / A / 10알 / 화이트");
  assert.equal(cartTotal([item]), 36_000);
  assert.equal(shippingCost(36_000, shippingPolicy), shippingPolicy.baseFee);
  assert.equal(shippingCost(shippingPolicy.freeThreshold, shippingPolicy), 0);
  assert.equal(bundleId({ title: "A Set", products: [product], price: 18_000 }), "a-set__titleist__18000");
});

test("checkout module validates server-required address fields and escapes labels", () => {
  const form = new FormData();
  form.set("name", "홍길동");
  form.set("phone", "010-1234-5678");
  form.set("zipCode", "12345");
  form.set("roadAddress", "테스트로 1");
  form.set("detailAddress", "101호");
  const customer = checkoutCustomerFromForm(form);
  assert.equal(isCheckoutCustomerValid(customer), true);
  assert.equal(isCheckoutCustomerValid({ ...customer, zipCode: "1234" }), false);
  assert.match(renderCheckoutField("<수령인>", "<input />"), /&lt;수령인&gt;/);
  assert.match(renderCheckoutMethod('card\" autofocus', "카드", "", true), /value="card&quot; autofocus"/);
});

test("account and admin presentation modules preserve status and role labels", () => {
  assert.equal(translateOrderStatus("paid"), "결제 완료");
  assert.equal(translatePaymentStatus("partial_canceled"), "부분 취소");
  assert.equal(translateDeliveryStatus("배송중"), "배송중");
  assert.deepEqual(normalizeNotifications({ sms: false }, { sms: true, email: true }), { sms: false, email: true });
  assert.deepEqual(adminChartPercentages([1, 1, 2]), [25, 25, 50]);
  assert.equal(adminTabLabel("customer"), "고객/회원관리");
  assert.equal(adminDefaultModal("orders"), "orderDetail");
  assert.equal(defaultAdminProfile(businessProfile.supportEmail).email, businessProfile.supportEmail);
  assert.ok(products.length > 0);
});
