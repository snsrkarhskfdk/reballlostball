import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [migration, prepareSource, confirmSource] = await Promise.all([
  readFile(new URL("supabase/migrations/20260901080000_mobile_payment_return_capability.sql", root), "utf8"),
  readFile(new URL("supabase/functions/prepare-payment/index.ts", root), "utf8"),
  readFile(new URL("supabase/functions/payment-confirm/index.ts", root), "utf8"),
]);

test("payment return capability is scoped, derived, and service-role only", () => {
  assert.match(migration, /resolve_payment_return_capability_v1/);
  assert.match(migration, /payment-return-v1:/);
  assert.match(migration, /guest_lookup_token_hash/);
  assert.match(migration, /extensions\.digest/);
  assert.match(migration, /revoke all on function public\.resolve_payment_return_capability_v1\(text, text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.resolve_payment_return_capability_v1\(text, text\)[\s\S]*to service_role/i);
});

test("prepare-payment never exposes the guest lookup token in Toss return URLs", () => {
  assert.match(prepareSource, /paymentReturnToken/);
  assert.match(prepareSource, /sha256Hex\(`payment-return-v1:\$\{guestTokenHash\}:\$\{orderNo\}`\)/);
  assert.match(prepareSource, /withPaymentReturnCapability/);
  assert.doesNotMatch(prepareSource, /searchParams\.set\(["']guestLookupToken["']/);
});

test("payment-confirm can restore guest authorization only through the service resolver", () => {
  assert.match(confirmSource, /paymentReturnToken/);
  assert.match(confirmSource, /resolve_payment_return_capability_v1/);
  assert.match(confirmSource, /guestTokenHash = await rpc<string \| null>/);
  assert.match(confirmSource, /if \(!user && !guestTokenHash\) throw new HttpError\(403/);
  assert.match(confirmSource, /claim_payment_confirmation_v1/);
});
