import assert from "node:assert/strict";
import test from "node:test";

import {
  constantTimeEqual,
  hmacSha256Base64Url,
  normalizeAddress,
  normalizeItems,
  normalizePaymentMethod,
  sanitizeProviderPayload,
  sha256Hex,
  stableStringify,
  tossAuthorizationHeader,
} from "../../supabase/functions/_shared/core.ts";

test("stable request fingerprints ignore object key insertion order", async () => {
  const left = stableStringify({ items: [{ quantity: 2, variantId: "a" }], method: "card" });
  const right = stableStringify({ method: "card", items: [{ variantId: "a", quantity: 2 }] });
  assert.equal(left, right);
  assert.equal(await sha256Hex(left), await sha256Hex(right));
});

test("guest lookup token derivation is secret-bound and retry-stable", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const first = await hmacSha256Base64Url(secret, "guest-order:req-1:fingerprint");
  const retry = await hmacSha256Base64Url(secret, "guest-order:req-1:fingerprint");
  const other = await hmacSha256Base64Url(secret, "guest-order:req-2:fingerprint");
  assert.equal(first, retry);
  assert.notEqual(first, other);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(await sha256Hex(first), /^[0-9a-f]{64}$/);
});

test("constant-time comparison rejects unequal hashes", () => {
  assert.equal(constantTimeEqual("a".repeat(64), "a".repeat(64)), true);
  assert.equal(constantTimeEqual("a".repeat(64), "b".repeat(64)), false);
  assert.equal(constantTimeEqual("short", "longer"), false);
});

test("catalog inputs contain only variant IDs and bounded quantities", () => {
  const items = normalizeItems([
    { variantId: "123e4567-e89b-12d3-a456-426614174000", quantity: 2, price: 1 },
  ]);
  assert.deepEqual(items, [{ variantId: "123e4567-e89b-12d3-a456-426614174000", quantity: 2 }]);
  assert.throws(() => normalizeItems([{ variantId: "missing", quantity: 1 }]));
  assert.throws(() => normalizeItems([{ variantId: "123e4567-e89b-12d3-a456-426614174000", quantity: 0 }]));
  assert.throws(() => normalizeItems([{ variantId: "123e4567-e89b-12d3-a456-426614174000", quantity: 11 }]));
  assert.throws(() => normalizeItems([
    { variantId: "123e4567-e89b-12d3-a456-426614174000", quantity: 10 },
    { variantId: "123e4567-e89b-12d3-a456-426614174001", quantity: 10 },
    { variantId: "123e4567-e89b-12d3-a456-426614174002", quantity: 1 },
  ]));
});

test("shipping and payment method input normalization rejects malformed values", () => {
  assert.deepEqual(normalizeAddress({
    receiverName: "홍길동",
    receiverPhone: "010-1234-5678",
    zipCode: "12345",
    roadAddress: "테스트로 1",
  }), {
    receiverName: "홍길동",
    receiverPhone: "01012345678",
    zipCode: "12345",
    roadAddress: "테스트로 1",
    detailAddress: "",
    memo: "",
  });
  assert.equal(normalizePaymentMethod("virtual"), "virtual_account");
  assert.throws(() => normalizePaymentMethod("cash"));
});

test("Toss authorization uses secret Basic auth while stored payload is redacted", () => {
  const header = tossAuthorizationHeader("test_sk_example_secret");
  assert.equal(header, `Basic ${btoa("test_sk_example_secret:")}`);
  const sanitized = sanitizeProviderPayload({
    paymentKey: "pk",
    secret: "do-not-store",
    card: { cardNumber: "1111", approveNo: "ok" },
    customerEmail: "private@example.com",
  });
  assert.deepEqual(sanitized, { paymentKey: "pk", card: { approveNo: "ok" } });
});
