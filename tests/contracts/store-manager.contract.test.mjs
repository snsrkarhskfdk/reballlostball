import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [legacyMigration, opsMigration, managerHtml, managerJs, managerCss, build, vercel, shipping, consoleEdge, cancel] = await Promise.all([
  readFile(new URL("supabase/migrations/20260903130000_store_manager_ops.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/20260906150000_admin_ops_console_v2.sql", root), "utf8"),
  readFile(new URL("store-manager.html", root), "utf8"),
  readFile(new URL("store-manager.mjs", root), "utf8"),
  readFile(new URL("store-manager.css", root), "utf8"),
  readFile(new URL("scripts/build.mjs", root), "utf8"),
  readFile(new URL("vercel.json", root), "utf8"),
  readFile(new URL("supabase/functions/admin-shipping/index.ts", root), "utf8"),
  readFile(new URL("supabase/functions/admin-console/index.ts", root), "utf8"),
  readFile(new URL("supabase/functions/payment-cancel/index.ts", root), "utf8"),
]);

test("store_manager catalog writes move from direct RLS updates to one service-only audited transaction", () => {
  assert.match(legacyMigration, /products_store_manager_update/);
  assert.match(opsMigration, /drop policy if exists products_store_manager_update/);
  assert.match(opsMigration, /drop policy if exists product_variants_store_manager_update/);
  assert.match(opsMigration, /admin_catalog_update_v2/);
  assert.match(opsMigration, /for update/);
  assert.match(opsMigration, /catalog_batch_update/);
  assert.match(opsMigration, /revoke all on function public\.admin_catalog_update_v2[\s\S]*from public, anon, authenticated/i);
  assert.match(opsMigration, /grant execute on function public\.admin_catalog_update_v2[\s\S]*to service_role/i);
  assert.match(opsMigration, /store manager metadata update denied/);
  assert.match(managerJs, /adminAction\("catalogUpdate"/);
  assert.doesNotMatch(managerJs, /\.from\("products"\)\.update/);
  assert.doesNotMatch(managerJs, /\.from\("product_variants"\)\.update/);
});

test("owner operations exist but remain server-role gated and audited", () => {
  for (const fn of ["admin_update_store_settings_v2", "admin_save_policy_v2", "admin_set_user_role_v2"]) {
    assert.match(opsMigration, new RegExp(fn));
  }
  assert.match(opsMigration, /cannot remove last owner admin/);
  assert.match(opsMigration, /store_settings_update/);
  assert.match(opsMigration, /policy_publish/);
  assert.match(opsMigration, /user_role_update/);
  assert.match(consoleEdge, /requireOwner\(roles\)/);
  assert.match(consoleEdge, /OWNER_ACCESS_DENIED/);
  assert.match(managerHtml, /data-tab="settings"/);
  assert.match(managerHtml, /data-tab="staff"/);
  assert.match(managerHtml, /data-tab="audit"/);
});

test("payments and refunds are visible only to payments_manager or owner_admin", () => {
  assert.match(consoleEdge, /PAYMENT_ROLES = new Set<Role>\(\["payments_manager", "owner_admin"\]\)/);
  assert.match(consoleEdge, /canPayments/);
  assert.match(managerJs, /PAYMENT_ROLES = new Set\(\["owner_admin", "payments_manager"\]\)/);
  assert.match(managerJs, /data-cancel-order/);
  assert.match(managerJs, /functions\/v1\/payment-cancel/);
  assert.match(cancel, /claim_payment_cancellation_v1/);
  assert.doesNotMatch(managerJs, /TOSS_SECRET_KEY|TOSS_PAYMENTS_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});

test("shipping remains mediated by server role checks and service-only RPC", () => {
  assert.match(legacyMigration, /admin_update_shipping_v1/);
  assert.match(legacyMigration, /revoke all on function public\.admin_update_shipping_v1[\s\S]*from public, anon, authenticated/i);
  assert.match(shipping, /owner_admin,cs_manager,store_manager/);
  assert.match(shipping, /admin_update_shipping_v1/);
  assert.match(managerJs, /functions\/v1\/admin-shipping/);
});

test("product media stays size-limited, converted to webp, and attached through audited catalog action", () => {
  assert.match(legacyMigration, /reball-product-media/);
  assert.match(legacyMigration, /8388608/);
  assert.match(managerJs, /imageToWebp/);
  assert.match(managerJs, /1600/);
  assert.match(managerJs, /image\/webp/);
  assert.match(managerJs, /upsert: false/);
  assert.match(managerJs, /thumbnailUrl: publicUrl/);
  assert.match(managerJs, /detailImageUrl: publicUrl/);
});

test("operations console exposes dashboard, orders, products, shipping, members, audit, settings and staff", () => {
  for (const tab of ["dashboard", "orders", "products", "shipping", "members", "audit", "settings", "staff"]) {
    assert.match(managerHtml, new RegExp(`data-tab="${tab}"`));
    assert.match(managerHtml, new RegExp(`data-panel="${tab}"`));
  }
  assert.match(managerJs, /TAB_ROLES/);
  assert.match(managerJs, /admin-members/);
  assert.match(managerJs, /admin-console\?view=/);
  assert.match(managerJs, /orderNote/);
  assert.match(managerJs, /roleSet/);
  assert.match(managerJs, /policySave/);
  assert.match(managerCss, /\.sm-summary--wide/);
  assert.match(managerCss, /\.sm-table-wrap/);
});

test("admin-console is authentication, origin and rate-limit guarded", () => {
  assert.match(consoleEdge, /assertAllowedOrigin\(req\)/);
  assert.match(consoleEdge, /sessionUser\(req\)/);
  assert.match(consoleEdge, /AUTH_REQUIRED/);
  assert.match(consoleEdge, /enforceRateLimit/);
  assert.match(consoleEdge, /ADMIN_ACCESS_DENIED/);
  assert.match(consoleEdge, /serviceSelect/);
  assert.doesNotMatch(consoleEdge, /Deno\.env\.get\("TOSS_SECRET_KEY"/);
});

test("store manager console is separately routed, noindexed and built with public config only", () => {
  assert.match(managerHtml, /noindex,nofollow,noarchive/);
  assert.match(managerHtml, /reball-supabase-url/);
  assert.match(managerHtml, /store-manager\.mjs\?v=20260906-01/);
  assert.match(build, /store-manager\.html/);
  assert.match(build, /injectPublicConfig\(storeManagerHtml\)/);
  assert.match(vercel, /"source": "\/store-manager"/);
  assert.match(vercel, /"destination": "\/store-manager\.html"/);
});
