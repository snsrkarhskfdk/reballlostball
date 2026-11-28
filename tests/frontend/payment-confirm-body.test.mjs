import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmTossPayment,
  paymentReturnStorageKey,
  pendingTossConfirmation,
  retryPendingTossConfirmation,
} from "../../src/frontend/payments/toss-client.mjs";

const confirmation = { orderId: "RB-BODY-RECOVERY-001", paymentKey: "synthetic-payment-key", amount: 17000 };
const returnToken = "a".repeat(64);

function harness(fetchImpl) {
  const values = new Map([[paymentReturnStorageKey(confirmation.orderId), returnToken]]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  return {
    storage,
    config: {
      baseUrl: "https://example.supabase.co", anonKey: "synthetic-public", storage,
      locationLike: { search: "", hash: "" }, confirmAutoAttempts: 1,
      confirmTimeoutMs: 20, fetchImpl,
    },
  };
}

function success(status = "paid", extra = {}) {
  return {
    order: { orderNo: confirmation.orderId, totalKrw: confirmation.amount, status },
    guestLookupToken: "synthetic-refreshed-lookup-token",
    ...extra,
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function assertRecoveryPreserved(storage) {
  assert.deepEqual(pendingTossConfirmation(confirmation.orderId, storage), confirmation);
  assert.equal(storage.getItem(paymentReturnStorageKey(confirmation.orderId)), returnToken);
}

test("a body timeout after HTTP 200 keeps the exact confirmation and return capability", async () => {
  const { config, storage } = harness(async (_url, { signal }) => ({
    ok: true, status: 200,
    json: () => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  }));
  await assert.rejects(confirmTossPayment(config, confirmation), { code: "PAYMENT_CONFIRM_RECOVERY_REQUIRED" });
  assertRecoveryPreserved(storage);
});

test("truncated HTTP 200 JSON keeps confirmation recovery available", async () => {
  const { config, storage } = harness(async () => new Response('{"order":', { status: 200 }));
  await assert.rejects(confirmTossPayment(config, confirmation), { code: "PAYMENT_CONFIRM_RECOVERY_REQUIRED" });
  assertRecoveryPreserved(storage);
});

test("incomplete or mismatched HTTP 200 bodies cannot discard recovery state", async () => {
  for (const payload of [
    null, [], {}, { paid: true }, { order: [] },
    { ...success(), order: { ...success().order, orderNo: "RB-DIFFERENT-ORDER" } },
    { ...success(), order: { ...success().order, totalKrw: 1 } },
    { ...success(), order: { ...success().order, totalKrw: "17000" } },
    success("payment_auth_started"), success("canceled"),
  ]) {
    const { config, storage } = harness(async () => jsonResponse(payload));
    await assert.rejects(confirmTossPayment(config, confirmation), { code: "PAYMENT_CONFIRM_RECOVERY_REQUIRED" });
    assertRecoveryPreserved(storage);
  }
});

test("valid settled and duplicate responses clear recovery only after the order is verified", async () => {
  for (const status of ["waiting_for_deposit", "paid", "shipping_ready", "shipped", "delivered"]) {
    const payload = success(status, status === "waiting_for_deposit"
      ? { paid: false, waitingForDeposit: true }
      : { duplicate: true });
    const { config, storage } = harness(async () => jsonResponse(payload));
    assert.deepEqual(await confirmTossPayment(config, confirmation), payload);
    assert.equal(pendingTossConfirmation(confirmation.orderId, storage), null);
    assert.equal(storage.getItem(paymentReturnStorageKey(confirmation.orderId)), null);
  }
});

test("rechecking an unreadable response resends the same tuple and then clears it", async () => {
  const requests = [];
  const { config, storage } = harness(async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return requests.length === 1 ? new Response("truncated", { status: 200 }) : jsonResponse(success("paid", { duplicate: true }));
  });
  await assert.rejects(confirmTossPayment(config, confirmation), { code: "PAYMENT_CONFIRM_RECOVERY_REQUIRED" });
  assertRecoveryPreserved(storage);
  await retryPendingTossConfirmation(config, confirmation.orderId);
  assert.deepEqual(requests, [
    { ...confirmation, paymentReturnToken: returnToken },
    { ...confirmation, paymentReturnToken: returnToken },
  ]);
  assert.equal(pendingTossConfirmation(confirmation.orderId, storage), null);
});

test("non-JSON HTTP failures retain authentication, ownership, and server-error semantics", async () => {
  for (const [status, expectedCode, preserve] of [
    [401, "PAYMENT_CONFIRM_AUTH_REQUIRED", true],
    [403, "", false],
    [502, "PAYMENT_CONFIRM_RECOVERY_REQUIRED", true],
  ]) {
    const { config, storage } = harness(async () => new Response("upstream error", { status }));
    await assert.rejects(confirmTossPayment(config, confirmation), error => error.code === expectedCode && error.status === status);
    if (preserve) assertRecoveryPreserved(storage);
    else assert.equal(pendingTossConfirmation(confirmation.orderId, storage), null);
  }
});
