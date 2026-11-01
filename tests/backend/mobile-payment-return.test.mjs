import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [migrationV1, migrationV2, ttlMigration, prepareSource, confirmSource] = await Promise.all([
  readFile(new URL("supabase/migrations/20260901080000_mobile_payment_return_capability.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/20260901102500_mobile_paid_guest_token_rotation.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/20260901104000_payment_return_capability_ttl.sql", root), "utf8"),
  readFile(new URL("supabase/functions/prepare-payment/index.ts", root), "utf8"),
  readFile(new URL("supabase/functions/payment-confirm/index.ts", root), "utf8"),
]);

test("legacy payment return resolver remains service-role only", () => {
  assert.match(migrationV1, /resolve_payment_return_capability_v1/);
  assert.match(migrationV1, /revoke all on function public\.resolve_payment_return_capability_v1\(text, text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migrationV1, /grant execute on function public\.resolve_payment_return_capability_v1\(text, text\)[\s\S]*to service_role/i);
});

test("v2 paid-return recovery helpers remain service-role only", () => {
  assert.match(migrationV2, /payment_return_guest_hash_v2/);
  assert.match(migrationV2, /rotate_guest_lookup_token_after_payment_v2/);
  assert.match(migrationV2, /status not in \('paid', 'waiting_for_deposit'\)/);
  assert.match(migrationV2, /revoke all on function public\.payment_return_guest_hash_v2\(text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migrationV2, /grant execute on function public\.payment_return_guest_hash_v2\(text\)[\s\S]*to service_role/i);
  assert.match(migrationV2, /revoke all on function public\.rotate_guest_lookup_token_after_payment_v2\(text, text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migrationV2, /grant execute on function public\.rotate_guest_lookup_token_after_payment_v2\(text, text\)[\s\S]*to service_role/i);
});

test("payment return recovery expires two hours after order creation", () => {
  assert.match(ttlMigration, /created_at < now\(\) - interval '2 hours'/);
  assert.match(ttlMigration, /revoke all on function public\.payment_return_guest_hash_v2\(text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(ttlMigration, /grant execute on function public\.payment_return_guest_hash_v2\(text\)[\s\S]*to service_role/i);
});

test("prepare-payment uses an order-scoped HMAC capability and never exposes the guest lookup token", () => {
  assert.match(prepareSource, /payment-return-v2:/);
  assert.match(prepareSource, /hmacSha256Hex/);
  assert.match(prepareSource, /constantTimeEqual/);
  assert.match(prepareSource, /payment_return_guest_hash_v2/);
  assert.match(prepareSource, /withPaymentReturnCapability/);
  assert.doesNotMatch(prepareSource, /searchParams\.set\(["']guestLookupToken["']/);
});

test("payment-confirm reissues a canonical guest lookup token only after a settled return", () => {
  assert.match(confirmSource, /payment-return-v2:/);
  assert.match(confirmSource, /guest-order-recovery-v2:/);
  assert.match(confirmSource, /payment_return_guest_hash_v2/);
  assert.match(confirmSource, /rotate_guest_lookup_token_after_payment_v2/);
  // A settled order must rotate the guest token in every state the customer can still
  // reach, or a confirmation replay after fulfilment advanced strands them.
  for (const status of ["waiting_for_deposit", "paid", "shipping_ready", "shipped", "delivered"]) {
    assert.ok(confirmSource.includes(`"${status}",`), `SETTLED_ORDER_STATUSES must contain ${status}.`);
  }
  assert.ok(confirmSource.includes("SETTLED_ORDER_STATUSES.has(status)"), "Token rotation must be gated on the settled-status set.");
  assert.match(confirmSource, /guestLookupToken: refreshedLookupToken/);
  assert.match(confirmSource, /claim_payment_confirmation_v1/);
  // The unauthenticated branch must still reject, but it now separates a caller we
  // could not authenticate at all — a recoverable 401, so the browser keeps the
  // confirmation tuple and can offer re-authentication — from an identified caller
  // who does not own the order, which stays a definitive 403. Both must be present.
  assert.ok(confirmSource.includes("if (!user && !guestTokenHash) {"), "The unauthenticated branch must still exist.");
  assert.ok(confirmSource.includes('if (!suppliedCredential) throw new HttpError(401, "AUTH_REQUIRED"'), "A caller we cannot authenticate at all must get a recoverable 401.");
  assert.ok(confirmSource.includes('throw new HttpError(403, "ORDER_ACCESS_DENIED"'), "An identified caller who does not own the order must still get a definitive 403.");
});
