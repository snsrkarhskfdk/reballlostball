import test from "node:test";
import assert from "node:assert/strict";

import {
  createIdempotencyKey,
  createOrderRequest,
  lookupGuestOrderRequest,
  orderLinePayload,
  normalizeServerOrder,
} from "../../src/frontend/commerce/order-client.mjs";
import { confirmTossPayment, loadTossSdk } from "../../src/frontend/payments/toss-client.mjs";

test("주문 line payload는 variantId와 quantity만 허용한다", () => {
  assert.deepEqual(
    orderLinePayload([{ variantId: "v-1", quantity: 2, price: 1, total: 1 }]),
    [{ variantId: "v-1", quantity: 2 }]
  );
  assert.throws(() => orderLinePayload([{ slug: "fake", quantity: 1 }]), /올바르지 않습니다/);
  assert.throws(() => orderLinePayload([{ variantId: "v-1", quantity: 11 }]), /최대 10개/);
  assert.throws(
    () => orderLinePayload([
      { variantId: "v-1", quantity: 10 },
      { variantId: "v-2", quantity: 10 },
      { variantId: "v-3", quantity: 1 },
    ]),
    /총수량은 최대 20개/,
  );
  assert.throws(
    () => orderLinePayload([{ variantId: "v-1", quantity: 1 }, { variantId: "v-1", quantity: 1 }]),
    /중복/,
  );
  assert.throws(
    () => orderLinePayload(Array.from({ length: 11 }, (_, index) => ({ variantId: `v-${index}`, quantity: 1 }))),
    /최대 10개 옵션/,
  );
});

test("create-order는 클라이언트 총액 없이 서버 endpoint를 호출한다", async () => {
  let request;
  const result = await createOrderRequest(
    {
      baseUrl: "https://example.supabase.co",
      anonKey: "anon",
      accessToken: "jwt",
      idempotencyKey: "order_1234567890abcdef",
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => ({ order: { id: "o-1" } }) };
      },
    },
    { items: [{ variantId: "v-1", quantity: 1 }], customer: { name: "홍길동" } }
  );
  assert.equal(request.url, "https://example.supabase.co/functions/v1/create-order");
  assert.equal(request.options.headers.Authorization, "Bearer jwt");
  assert.equal(request.options.headers["Idempotency-Key"], "order_1234567890abcdef");
  assert.equal(JSON.parse(request.options.body).total, undefined);
  assert.equal(result.order.id, "o-1");
});

test("주문 요청 키는 충분히 무작위한 고정 길이 값으로 생성한다", () => {
  const key = createIdempotencyKey({ randomUUID: () => "12345678-1234-1234-1234-1234567890ab" });
  assert.equal(key, "order_123456781234123412341234567890ab");
  assert.ok(key.length >= 16);
});

test("비회원 조회는 로컬 주문 배열이 아닌 서버 endpoint를 사용한다", async () => {
  let called = false;
  await lookupGuestOrderRequest(
    {
      baseUrl: "https://example.supabase.co",
      anonKey: "anon",
      fetchImpl: async () => {
        called = true;
        return { ok: true, json: async () => ({ order: { id: "o-1" } }) };
      },
    },
    { orderId: "RB-1", lookupToken: "random-secret" }
  );
  assert.equal(called, true);
});

test("토스 성공 복귀값은 서버 payment-confirm으로 전달한다", async () => {
  let request;
  await confirmTossPayment(
    {
      baseUrl: "https://example.supabase.co",
      anonKey: "anon",
      fetchImpl: async (url, options) => {
        request = { url, options, body: JSON.parse(options.body) };
        return { ok: true, json: async () => ({ paid: true }) };
      },
    },
    { paymentKey: "payment-key", orderId: "ORDER_123456", amount: 18000, guestLookupToken: "guest-token" }
  );
  assert.equal(request.url, "https://example.supabase.co/functions/v1/payment-confirm");
  assert.deepEqual(request.body, {
    paymentKey: "payment-key",
    orderId: "ORDER_123456",
    amount: 18000,
    guestLookupToken: "guest-token",
  });
  assert.throws(
    () => confirmTossPayment({ baseUrl: "x", anonKey: "x" }, { paymentKey: "", orderId: "bad", amount: 0 }),
    /올바르지 않습니다/
  );
});

test("서버 주문의 결제·배송·상품 스냅샷을 UI 모델로 보존한다", () => {
  const order = normalizeServerOrder({
    orderNo: "RB-ORDER-123456",
    status: "payment_ready",
    paymentStatus: "ready",
    paymentMethod: "card",
    totalKrw: 18000,
    address: { receiverName: "홍길동", zipCode: "12345", roadAddress: "테스트로 1" },
    items: [{ variantId: "v-1", productName: "타이틀리스트 로스트볼", variantName: "V1 / A / 10구", unitPriceKrw: 18000, quantity: 1, lineTotalKrw: 18000 }],
  });
  assert.equal(order.paymentStatus, "ready");
  assert.equal(order.delivery, "배송 준비 전");
  assert.equal(order.customer.name, "홍길동");
  assert.deepEqual(order.items[0], {
    key: "RB-ORDER-123456-v-1",
    variantId: "v-1",
    name: "타이틀리스트 로스트볼",
    brandName: "타이틀리스트",
    selection: { model: "V1 / A / 10구" },
    price: 18000,
    quantity: 1,
    lineTotal: 18000,
  });
});

test("서버 주문번호는 route·attribute에 안전한 형식만 받아들인다", () => {
  assert.equal(normalizeServerOrder({ orderNo: 'ORDER_123\" onmouseover=\"alert(1)' }), null);
  assert.equal(normalizeServerOrder({ orderNo: "too-short" })?.id, "TOO-SHORT");
});

test("토스 SDK 로드 실패 후 재시도는 이미 종료된 script event에 걸리지 않는다", async () => {
  class FakeScript extends EventTarget {
    constructor() {
      super();
      this.dataset = {};
      this.isConnected = false;
    }
    remove() {
      this.isConnected = false;
      if (documentRef.current === this) documentRef.current = null;
    }
  }

  const documentRef = {
    current: null,
    querySelector() { return this.current; },
    createElement() { return new FakeScript(); },
    head: {
      appendChild(script) {
        script.isConnected = true;
        documentRef.current = script;
      },
    },
  };

  const first = loadTossSdk(documentRef, { timeoutMs: 100 });
  documentRef.current.dispatchEvent(new Event("error"));
  await assert.rejects(first, /SDK를 불러오지/);
  assert.equal(documentRef.current, null);

  const second = loadTossSdk(documentRef, { timeoutMs: 100 });
  globalThis.TossPayments = function TossPayments() {};
  documentRef.current.dispatchEvent(new Event("load"));
  assert.equal(await second, globalThis.TossPayments);
  delete globalThis.TossPayments;
});
