import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/create-order/index.ts", "utf8");

test("create-order requires a client-stable idempotency key and recovers before mutable cart parsing", () => {
  assert.match(source, /const idempotencyKey = cleanString\(req\.headers\.get\("idempotency-key"\) \|\| body\.idempotencyKey, 128\)/);
  assert.doesNotMatch(source, /suppliedIdempotencyKey \|\| crypto\.randomUUID/);
  assert.match(source, /IDEMPOTENCY_KEY_REQUIRED/);
  const recoveryAt = source.indexOf("recoverExistingOrder(idempotencyKey, user)");
  const itemsAt = source.indexOf("normalizeItems(body.items)");
  assert.ok(recoveryAt >= 0 && itemsAt > recoveryAt, "existing idempotent order must recover before mutable cart parsing");
  assert.match(source, /IDEMPOTENCY_ACTOR_MISMATCH/);
  assert.match(source, /racedRecovery/);
});

test("new-order payment methods are server allowlisted independently of hidden browser controls", () => {
  assert.match(source, /DEFAULT_ENABLED_PAYMENT_METHODS = \["card", "transfer", "easy_pay"\]/);
  assert.match(source, /ENABLED_PAYMENT_METHODS/);
  assert.match(source, /PAYMENT_METHOD_UNAVAILABLE/);
  assert.match(source, /enabledPaymentMethods\(\)\.has\(paymentMethod\)/);
});
