import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [migration, fullMigration, managerHtml, managerJs, adminJs, managerCss, build, vercel, shipping, members] = await Promise.all([
  readFile(new URL("supabase/migrations/20260903130000_store_manager_ops.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/20260907010000_full_admin_console.sql", root), "utf8"),
  readFile(new URL("store-manager.html", root), "utf8"),
  readFile(new URL("store-manager.mjs", root), "utf8"),
  readFile(new URL("src/frontend/admin/store-console.mjs", root), "utf8"),
  readFile(new URL("store-manager.css", root), "utf8"),
  readFile(new URL("scripts/build.mjs", root), "utf8"),
  readFile(new URL("vercel.json", root), "utf8"),
  readFile(new URL("supabase/functions/admin-shipping/index.ts", root), "utf8"),
  readFile(new URL("supabase/functions/admin-members/index.ts", root), "utf8"),
]);

test("store_manager can update catalog and read fulfillment without direct payment/settlement table authority", () => {
  assert.match(migration, /'store_manager'::text/);
  assert.match(migration, /products_store_manager_update/);
  assert.match(migration, /product_variants_store_manager_update/);
  assert.match(migration, /orders_store_manager_select/);
  assert.match(migration, /order_items_store_manager_select/);
  assert.doesNotMatch(migration, /payments_store_manager/);
  assert.doesNotMatch(migration, /settlement.*store_manager/i);
});

test("store_manager direct catalog updates stay pinned while owner/inventory can use full product UI", () => {
  assert.match(migration, /guard_store_manager_product_update_v1/);
  assert.match(migration, /new\.slug is distinct from old\.slug/);
  assert.match(migration, /new\.name is distinct from old\.name/);
  assert.match(migration, /new\.summary is distinct from old\.summary/);
  assert.match(migration, /guard_store_manager_variant_update_v1/);
  assert.match(migration, /new\.sku is distinct from old\.sku/);
  assert.match(migration, /new\.grade is distinct from old\.grade/);
  assert.match(migration, /new\.pack_size is distinct from old\.pack_size/);
  assert.match(managerCss, /\.sm-product-fields>\.sm-field\{display:none\}/);
  assert.match(managerCss, /sm-can-edit-product-content/);
  assert.match(adminJs, /owner_admin/);
  assert.match(adminJs, /inventory_manager/);
});

test("shipping remains mediated by the service-role-only RPC", () => {
  assert.match(migration, /ur\.role in \('owner_admin','cs_manager','store_manager'\)/);
  assert.match(migration, /revoke all on function public\.admin_update_shipping_v1[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.admin_update_shipping_v1[\s\S]*to service_role/i);
  assert.match(shipping, /owner_admin,cs_manager,store_manager/);
  assert.match(shipping, /admin_update_shipping_v1/);
});

test("product media uses a dedicated limited bucket with manager-only writes", () => {
  assert.match(migration, /reball-product-media/);
  assert.match(migration, /8388608/);
  assert.match(migration, /image\/jpeg/);
  assert.match(migration, /image\/webp/);
  assert.match(migration, /reball_product_media_manager_insert/);
  assert.match(managerJs, /imageToWebp/);
  assert.match(managerJs, /1600/);
  assert.match(managerJs, /upsert: false/);
});

test("admin console is separately routed, noindexed, and built with public config", () => {
  assert.match(managerHtml, /noindex,nofollow,noarchive/);
  assert.match(managerHtml, /reball-supabase-url/);
  assert.match(managerHtml, /store-manager\.mjs/);
  assert.match(managerHtml, /store-console\.mjs/);
  assert.match(build, /store-manager\.html/);
  assert.match(build, /injectPublicConfig\(storeManagerHtml\)/);
  assert.match(vercel, /"source": "\/store-manager"/);
  assert.match(vercel, /"destination": "\/store-manager\.html"/);
});

test("full console exposes all requested operations tabs", () => {
  for (const tab of ["dashboard","products","shipping","returns","inquiry","promo","pos","settlement","customer","review","settings"]) {
    assert.match(managerHtml, new RegExp(`data-tab=["']${tab}["']`));
  }
  assert.match(adminJs, /loadDashboard/);
  assert.match(adminJs, /loadReturns/);
  assert.match(adminJs, /loadInquiries/);
  assert.match(adminJs, /loadPromo/);
  assert.match(adminJs, /loadPos/);
  assert.match(adminJs, /loadSettlement/);
  assert.match(adminJs, /loadMembers/);
  assert.match(adminJs, /loadReviews/);
  assert.match(adminJs, /loadSettings/);
});

test("payment cancellation is server-mediated and gated to payments_manager or owner_admin in UI", () => {
  assert.doesNotMatch(managerJs, /payment-cancel|TOSS_SECRET_KEY|TOSS_PAYMENTS_SECRET_KEY/);
  assert.match(adminJs, /payment-cancel/);
  assert.match(adminJs, /has\("owner_admin"\)\|\|has\("payments_manager"\)/);
  assert.doesNotMatch(adminJs, /TOSS_SECRET_KEY|TOSS_PAYMENTS_SECRET_KEY/);
});

test("full admin migration adds operational ledgers, role RPC, audit trail, and owner settings policies", () => {
  assert.match(fullMigration, /create table if not exists public\.customer_inquiries/);
  assert.match(fullMigration, /create table if not exists public\.return_requests/);
  assert.match(fullMigration, /create table if not exists public\.pos_devices/);
  assert.match(fullMigration, /low_stock_threshold/);
  assert.match(fullMigration, /admin_set_user_roles_v1/);
  assert.match(fullMigration, /revoke all on function public\.admin_set_user_roles_v1[\s\S]*from public, anon, authenticated/i);
  assert.match(fullMigration, /grant execute on function public\.admin_set_user_roles_v1[\s\S]*to service_role/i);
  assert.match(fullMigration, /audit_admin_change_v1/);
  assert.match(fullMigration, /store_profile_owner_update/);
  assert.match(fullMigration, /commerce_settings_owner_update/);
  assert.match(fullMigration, /reviews_admin_update/);
  assert.match(fullMigration, /banners_admin_update/);
});

test("member administration reads auth users and mutates roles only through owner-only service RPC", () => {
  assert.match(members, /authAdmin/);
  assert.match(members, /\/auth\/v1\/admin\/users/);
  assert.match(members, /admin_set_user_roles_v1/);
  assert.match(members, /canManageRoles/);
  assert.match(members, /owner_admin/);
});
