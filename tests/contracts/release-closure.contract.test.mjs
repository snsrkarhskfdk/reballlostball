import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("public auth authority is CAPTCHA protected and server checked", () => {
  const checkLoginId = readFileSync("supabase/functions/check-login-id/index.ts", "utf8");
  assert.match(checkLoginId, /verifyCaptcha\(req, body\.captchaToken\)/);
  assert.match(checkLoginId, /enforceRateLimit\(req, "auth_login_id_check"/);
  assert.match(checkLoginId, /check_signup_identity_v1/);
});

test("store manager order pagination keeps PII and payment role boundaries", () => {
  const source = readFileSync("supabase/functions/admin-orders-page/index.ts", "utf8");
  assert.match(source, /ORDER_PII_ROLES/);
  assert.match(source, /PAYMENT_ROLES/);
  assert.match(source, /pageSize/);
  assert.match(source, /offset/);
  assert.match(source, /piiRedacted/);
  assert.match(source, /canCancel/);
});

test("admin order pages select one authoritative latest payment independently per order", () => {
  const source = readFileSync("supabase/functions/admin-orders-page/index.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260909210500_admin_latest_payment_per_order.sql", "utf8");
  assert.match(source, /admin_order_latest_payments_v1/);
  assert.doesNotMatch(source, /pageSize \* 3/);
  assert.match(migration, /partition by p\.order_id[\s\S]*order by p\.created_at desc, p\.id desc/i);
  assert.match(migration, /where ranked\.rn = 1/);
  assert.match(migration, /revoke all on function public\.admin_order_latest_payments_v1\(uuid\[\]\) from authenticated/i);
  assert.match(migration, /grant execute on function public\.admin_order_latest_payments_v1\(uuid\[\]\) to service_role/i);
});
