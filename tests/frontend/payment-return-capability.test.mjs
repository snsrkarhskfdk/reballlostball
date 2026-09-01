import test from "node:test";
import assert from "node:assert/strict";

import {
  capturePaymentReturnCapability,
  replacePaymentReturnUrl,
} from "../../src/frontend/core/router.mjs";
import { loadGuestLookupSession } from "../../src/frontend/core/storage.mjs";
import {
  browserPaymentReturnToken,
  confirmTossPayment,
  paymentReturnStorageKey,
  prepareTossPayment,
} from "../../src/frontend/payments/toss-client.mjs";

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

function okJson(payload) {
  return Promise.resolve({
    ok: true,
    json: async () => payload,
  });
}

const orderId = "RB-71EF9A0CBFC64C2EAEF77951";
const returnToken = "a".repeat(64);

test("failed mobile return captures payment-only capability before URL scrub", () => {
  const storage = memoryStorage();
  const locationRef = {
    pathname: "/payment/fail",
    search: `?orderId=${orderId}&paymentReturnToken=${returnToken}&code=USER_CANCEL`,
    hash: "",
  };
  let replaced = "";
  const historyRef = { replaceState(_state, _title, url) { replaced = url; } };
  const documentRef = { baseURI: "https://reballlostball.com/" };

  assert.equal(capturePaymentReturnCapability(locationRef, storage), returnToken);
  replacePaymentReturnUrl("/payment/fail", {
    documentRef,
    historyRef,
    locationRef,
    storageRef: storage,
  });

  assert.equal(storage.getItem(paymentReturnStorageKey(orderId)), returnToken);
  assert.equal(replaced, `/#/payment/fail?orderId=${orderId}`);
  assert.equal(replaced.includes("paymentReturnToken"), false);
  assert.equal(replaced.includes("USER_CANCEL"), false);
});

test("retry preparation uses stored return capability when guest sessionStorage identity is gone", async () => {
  const storage = memoryStorage();
  storage.setItem(paymentReturnStorageKey(orderId), returnToken);
  let sentBody;
  const fetchImpl = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return okJson({ payment: { method: "CARD" } });
  };

  await prepareTossPayment({
    baseUrl: "https://example.supabase.co",
    anonKey: "anon",
    fetchImpl,
    storage,
    locationLike: { search: "", hash: "" },
  }, orderId, "");

  assert.deepEqual(sentBody, { orderId, paymentReturnToken: returnToken });
});

test("success confirmation replaces lost guest identity with a refreshed lookup token", async () => {
  const storage = memoryStorage();
  const refreshedLookupToken = "refreshed-guest-lookup-token";
  let sentBody;
  const fetchImpl = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return okJson({
      paid: true,
      order: { orderNo: orderId },
      guestLookupToken: refreshedLookupToken,
    });
  };

  const result = await confirmTossPayment({
    baseUrl: "https://example.supabase.co",
    anonKey: "anon",
    fetchImpl,
    storage,
    locationLike: {
      search: `?paymentKey=test_payment_key&orderId=${orderId}&amount=30500&paymentReturnToken=${returnToken}`,
      hash: "",
    },
  }, {
    paymentKey: "test_payment_key",
    orderId,
    amount: 30500,
  });

  assert.equal(result.paid, true);
  assert.equal(sentBody.paymentReturnToken, returnToken);
  assert.equal(sentBody.guestLookupToken, undefined);
  assert.deepEqual(loadGuestLookupSession(storage), {
    orderId,
    lookupToken: refreshedLookupToken,
  });
  assert.equal(storage.getItem(paymentReturnStorageKey(orderId)), null);
});

test("malformed return capability is ignored", () => {
  const storage = memoryStorage();
  assert.equal(browserPaymentReturnToken(orderId, {
    locationLike: { search: "?paymentReturnToken=not-a-token", hash: "" },
    storage,
  }), "");
  assert.equal(storage.getItem(paymentReturnStorageKey(orderId)), null);
});
