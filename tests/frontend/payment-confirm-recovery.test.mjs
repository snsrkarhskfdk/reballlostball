import assert from "node:assert/strict";
import test from "node:test";
import { confirmTossPayment, pendingTossConfirmation } from "../../src/frontend/payments/toss-client.mjs";

const ORDER_ID = "RB-CONFIRM-RECOVER-001";

function harness({ status, code, accessToken = "" }) {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const config = {
    baseUrl: "https://example.supabase.co",
    anonKey: "public",
    accessToken,
    storage,
    locationLike: new URL("https://shop.example/#/payment/success"),
    confirmTimeoutMs: 50,
    fetchImpl: async () =>
      new Response(JSON.stringify({ code, message: code }), {
        status,
        headers: { "content-type": "application/json" },
      }),
  };
  return { config, storage };
}

async function confirmAndCapture(options) {
  const { config, storage } = harness(options);
  let error = null;
  try {
    await confirmTossPayment(config, { orderId: ORDER_ID, paymentKey: "pay_secret_key", amount: 17000 });
  } catch (caught) {
    error = caught;
  }
  return { error, pending: pendingTossConfirmation(ORDER_ID, storage) };
}

test("an unauthenticated confirmation keeps the tuple so the customer can re-authenticate", async () => {
  // The provider may already have charged the customer. Losing the tuple here
  // removes every recovery affordance, so a 401 must never be treated as final.

  // A member whose session did not survive the provider round trip sends no
  // Authorization header at all — the browser holds no access token.
  const noSession = await confirmAndCapture({ status: 401, code: "AUTH_REQUIRED" });
  assert.ok(noSession.pending, "A 401 with no surviving session must preserve the confirmation tuple.");
  assert.equal(noSession.error?.code, "PAYMENT_CONFIRM_AUTH_REQUIRED");

  // A member whose token is present but expired must behave the same way.
  const expiredSession = await confirmAndCapture({ status: 401, code: "AUTH_REQUIRED", accessToken: "expired" });
  assert.ok(expiredSession.pending, "A 401 with an expired token must preserve the confirmation tuple.");
  assert.equal(expiredSession.error?.code, "PAYMENT_CONFIRM_AUTH_REQUIRED");
});

test("an ownership denial stays definitive and does not masquerade as session recovery", async () => {
  // 403 means the caller was identified and does not own the order. Offering
  // endless re-authentication there would be a dead end.
  const denied = await confirmAndCapture({ status: 403, code: "ORDER_ACCESS_DENIED", accessToken: "other-member" });
  assert.equal(denied.pending, null, "A 403 ownership denial must clear the confirmation tuple.");
  assert.notEqual(denied.error?.code, "PAYMENT_CONFIRM_AUTH_REQUIRED");
});
