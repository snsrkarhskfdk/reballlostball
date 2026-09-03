import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [migration, managerHtml, managerJs, build, vercel, shipping] = await Promise.all([
  readFile(new URL("supabase/migrations/20260903130000_store_manager_ops.sql", root), "utf8"),
  readFile(new URL("store-manager.html", root), "utf8"),
  readFile(new URL("store-manager.mjs", root), "utf8"),
  readFile(new URL("scripts/build.mjs", root), "utf8"),
  readFile(new URL("vercel.json", root), "utf8"),
  readFile(new URL("supabase/functions/admin-shipping/index.ts", root), "utf8"),
]);

test("store_manager can update catalog and read fulfillment without receiving payment/settlement authority", () => {
  assert.match(migration, /'store_manager'::text/);
  assert.match(migration, /products_store_manager_update/);
  assert.match(migration, /product_variants_store_manager_update/);
  assert.match(migration, /orders_store_manager_select/);
  assert.match(migration, /order_items_store_manager_select/);
  assert.doesNotMatch(migration, /payments_store_manager/);
  assert.doesNotMatch(migration, /settlement.*store_manager/i);
});

test("shipping remains mediated by the service-role-only RPC", () => {
  assert.match(migration, /ur\.role in \('owner_admin','cs_manager','store_manager'\)/);
  assert.match(migration, /revoke all on function public\.admin_update_shipping_v1[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.admin_update_shipping_v1[\s\S]*to service_role/i);
  assert.match(shipping, /owner_admin,cs_manager,store_manager/);
  assert.match(shipping, /admin_update_shipping_v1/);
});

test("product media uses a dedicated size-and-mime-limited bucket with manager-only writes", () => {
  assert.match(migration, /reball-product-media/);
  assert.match(migration, /8388608/);
  assert.match(migration, /image\/jpeg/);
  assert.match(migration, /image\/webp/);
  assert.match(migration, /reball_product_media_manager_insert/);
  assert.match(managerJs, /imageToWebp/);
  assert.match(managerJs, /1600/);
  assert.match(managerJs, /upsert: false/);
});

test("store manager console is separately routed, noindexed, and built with public Supabase config", () => {
  assert.match(managerHtml, /noindex,nofollow,noarchive/);
  assert.match(managerHtml, /reball-supabase-url/);
  assert.match(managerHtml, /store-manager\.mjs/);
  assert.match(build, /store-manager\.html/);
  assert.match(build, /injectPublicConfig\(storeManagerHtml\)/);
  assert.match(vercel, /"source": "\/store-manager"/);
  assert.match(vercel, /"destination": "\/store-manager\.html"/);
});

test("console exposes only catalog media/stock/status and shipping actions", () => {
  assert.match(managerJs, /PRODUCT_ROLES/);
  assert.match(managerJs, /SHIPPING_ROLES/);
  assert.match(managerJs, /price_krw/);
  assert.match(managerJs, /stock_qty/);
  assert.match(managerJs, /thumbnail_url/);
  assert.match(managerJs, /admin-shipping/);
  assert.doesNotMatch(managerHtml, /정산관리|결제키|환불 실행/);
});
