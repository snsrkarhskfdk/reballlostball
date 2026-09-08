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
