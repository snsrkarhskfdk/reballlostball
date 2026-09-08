import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [migration, hardening, adminConsole, extraEdge, adminMembers, extraUi, finalAudit, injector, build, devServer, config] = await Promise.all([
  readFile(new URL("supabase/migrations/20260907050000_admin_ops_console_v3_closure.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/20260907051000_admin_ops_console_v3_policy_hardening.sql", root), "utf8"),
  readFile(new URL("supabase/functions/admin-console/index.ts", root), "utf8"),
  readFile(new URL("supabase/functions/admin-ops-extra/index.ts", root), "utf8"),
  readFile(new URL("supabase/functions/admin-members/index.ts", root), "utf8"),
  readFile(new URL("src/frontend/admin/store-console-extra.mjs", root), "utf8"),
  readFile(new URL("src/frontend/admin/store-console-final-audit.mjs", root), "utf8"),
  readFile(new URL("scripts/admin-console-assets.mjs", root), "utf8"),
  readFile(new URL("scripts/build.mjs", root), "utf8"),
  readFile(new URL("scripts/dev-server.mjs", root), "utf8"),
  readFile(new URL("supabase/config.toml", root), "utf8"),
]);

test("V3 ports every previously missing operations area onto the service-mediated console", () => {
  for (const view of ["returns", "inquiries", "reviews", "promo", "pos", "settlement", "brands"]) {
    assert.ok(extraEdge.includes(`view===\"${view}\"`), `missing GET view: ${view}`);
  }
  for (const tab of ["returns", "inquiries", "reviews", "promo", "pos", "settlement"]) {
    assert.ok(extraUi.includes(`[\"${tab}\",`), `missing generated tab definition: ${tab}`);
    assert.ok(extraUi.includes(`data-panel=\"${tab}\"`), `missing panel: ${tab}`);
  }
  for (const action of ["product_create", "return_create", "return_status", "inquiry_create", "inquiry_reply", "inquiry_close", "benefit_create", "benefit_toggle", "banner_create", "banner_toggle", "pos_create", "pos_status", "review_visibility"]) {
    assert.match(migration, new RegExp(action));
  }
});

test("extended mutations are service-role only, role checked and audited", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /private\.user_has_role/);
  assert.match(migration, /admin_audit_logs/);
  assert.match(migration, /revoke all on function public\.admin_ops_mutation_v1\(uuid,text,jsonb\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.admin_ops_mutation_v1\(uuid,text,jsonb\) to service_role/i);
  assert.match(extraEdge, /sessionUser\(req\)/);
  assert.match(extraEdge, /assertAllowedOrigin\(req\)/);
  assert.match(extraEdge, /enforceRateLimit/);
  assert.match(extraEdge, /admin_ops_mutation_v1/);
  assert.doesNotMatch(extraUi, /SUPABASE_SERVICE_ROLE_KEY|TOSS_SECRET_KEY|TOSS_PAYMENTS_SECRET_KEY/);
  assert.doesNotMatch(finalAudit, /SUPABASE_SERVICE_ROLE_KEY|TOSS_SECRET_KEY|TOSS_PAYMENTS_SECRET_KEY/);
});

test("last owner removal and customer-created support rows are hardened against races and spoofed state", () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('reball-admin:last-owner'/);
  assert.match(migration, /cannot remove last owner admin/);
  assert.match(hardening, /profile_id = auth\.uid\(\)/);
  assert.match(hardening, /status = 'open'/);
  assert.match(hardening, /admin_reply is null/);
  assert.match(hardening, /requested_by = auth\.uid\(\)/);
  assert.match(hardening, /status = 'requested'/);
  assert.match(hardening, /handled_by is null/);
});

test("new product registration is atomic and low-stock configuration is bounded and editable", () => {
  assert.match(migration, /insert into public\.products/);
  assert.match(migration, /insert into public\.product_variants/);
  assert.match(migration, /low_stock_threshold/);
  assert.match(migration, /v_threshold not between 0 and 9999/);
  assert.match(extraUi, /data-product-create-form-extra/);
  assert.match(extraUi, /lowStockThreshold/);
  assert.match(finalAudit, /data-final-threshold-input/);
  assert.match(finalAudit, /action: "threshold_set"/);
  assert.match(finalAudit, /저재고 기준 이하/);
  assert.match(finalAudit, /thresholdPending/);
  assert.match(finalAudit, /!row\.querySelector\("\[data-final-threshold-control\]"\)/);
});

test("cover photo protection and CSV formula-injection protection remain in force", () => {
  assert.match(extraUi, /대표 SKU 하나에만 반영/);
  assert.match(extraUi, /variants:\[\{id:target\.id,thumbnailUrl:publicUrl\}\]/);
  assert.match(extraUi, /\^\[=\+\\-@\]/);
  assert.match(extraUi, /csvCell/);
  assert.match(finalAudit, /import "\.\/store-console-extra\.mjs"/);
});

test("returns cancellation supports the refund-account requirement for completed virtual accounts", () => {
  assert.match(finalAudit, /method !== "virtual_account"/);
  assert.match(finalAudit, /new Set\(\["done", "partial_canceled"\]\)/);
  assert.match(finalAudit, /refundReceiveAccount/);
  assert.match(finalAudit, /Idempotency-Key/);
  assert.match(finalAudit, /data-extra-cancel/);
  assert.match(finalAudit, /stopImmediatePropagation/);
});

test("member purchase totals exclude failed or fully canceled orders and subtract partial refunds", () => {
  assert.match(adminMembers, /PURCHASE_STATUSES/);
  for (const status of ["paid", "partially_canceled", "shipping_ready", "shipped", "delivered"]) {
    assert.ok(adminMembers.includes(`\"${status}\"`), `missing valid purchase status: ${status}`);
  }
  assert.doesNotMatch(adminMembers, /PURCHASE_STATUSES[\s\S]*"payment_failed"/);
  assert.doesNotMatch(adminMembers, /PURCHASE_STATUSES[\s\S]*"canceled"/);
  assert.match(adminMembers, /gross - refunded/);
  assert.match(adminMembers, /Math\.max\(0, gross - refunded\)/);
  assert.match(adminMembers, /pagedSelect/);
  const fetchOrdersStart = adminMembers.indexOf("function fetchOrders()");
  const fetchOrdersEnd = adminMembers.indexOf("Deno.serve", fetchOrdersStart);
  assert.ok(fetchOrdersStart >= 0 && fetchOrdersEnd > fetchOrdersStart, "fetchOrders function boundary must exist");
  const fetchOrdersBody = adminMembers.slice(fetchOrdersStart, fetchOrdersEnd);
  assert.match(fetchOrdersBody, /return pagedSelect<OrderSummaryRow>/);
  assert.doesNotMatch(fetchOrdersBody, /catch/);
});

test("daily dashboard accounting keeps canceled same-day approvals in gross and uses refund ledger events", () => {
  assert.match(adminConsole, /payment_refunds\?select=cancel_amount,refund_status,requested_at,completed_at/);
  assert.match(adminConsole, /const approvedToday = payments\.filter/);
  assert.match(adminConsole, /Number\(p\.approved_amount \|\| 0\) > 0/);
  assert.doesNotMatch(adminConsole, /p\.status === "done" && new Date\(String\(p\.approved_at/);
  assert.match(adminConsole, /String\(r\.refund_status\) === "completed"/);
  assert.match(adminConsole, /r\.completed_at/);
  assert.match(adminConsole, /grossTodayKrw - refundsTodayKrw/);
});

test("payment-only operators receive financial order fields without customer shipping PII", () => {
  assert.match(adminConsole, /ORDER_PII_ROLES/);
  assert.match(adminConsole, /const safeOrderSelect = "id,order_no,status,payment_status,payment_method,payment_provider,subtotal_krw,shipping_krw,discount_krw,refund_amount,total_krw,created_at,updated_at"/);
  assert.match(adminConsole, /select: canOrderPii \? fullOrderSelect : safeOrderSelect/);
  assert.match(adminConsole, /piiRedacted: !canOrderPii/);
  assert.match(adminConsole, /canOrderPii\s*\? serviceSelect<AnyRow\[\]>/);
  assert.match(adminConsole, /requireAny\(roles, ORDER_PII_ROLES, "주문 메모를 남길 권한이 없습니다\."\)/);
  const returnsStart = extraEdge.indexOf("async function returnsView");
  const returnsEnd = extraEdge.indexOf("async function inquiriesView", returnsStart);
  const returnsBody = extraEdge.slice(returnsStart, returnsEnd);
  assert.doesNotMatch(returnsBody, /address_snapshot|receiver|tracking_number|shipping_carrier/);
  assert.match(finalAudit, /isPaymentOnlyOperator/);
  assert.match(finalAudit, /고객 배송정보 비공개/);
  assert.match(finalAudit, /상품 상세 비공개/);
});

test("final audit keeps extension permissions deterministic after base-tab rerenders", () => {
  assert.match(finalAudit, /EXTRA_TAB_ROLES/);
  assert.match(finalAudit, /applyExtraTabPermissions/);
  assert.match(finalAudit, /MutationObserver/);
  assert.match(finalAudit, /data-extra-tab/);
});

test("extended console assets are injected in both production build and local E2E server", () => {
  assert.match(injector, /store-console-extra\.css/);
  assert.match(injector, /store-console-final-audit\.css/);
  assert.match(injector, /store-console-final-audit\.mjs/);
  assert.match(build, /injectAdminConsoleAssets\(injectPublicConfig\(storeManagerHtml\)\)/);
  assert.match(devServer, /configuredStoreManagerHtml/);
  assert.match(devServer, /injectAdminConsoleAssets/);
  assert.match(config, /\[functions\.admin-ops-extra\]/);
  assert.match(config, /verify_jwt = false/);
});
