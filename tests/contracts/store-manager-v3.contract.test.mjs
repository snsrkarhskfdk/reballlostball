import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [migration, hardening, extraEdge, extraUi, injector, build, devServer, config] = await Promise.all([
  readFile(new URL("supabase/migrations/20260907050000_admin_ops_console_v3_closure.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/20260907051000_admin_ops_console_v3_policy_hardening.sql", root), "utf8"),
  readFile(new URL("supabase/functions/admin-ops-extra/index.ts", root), "utf8"),
  readFile(new URL("src/frontend/admin/store-console-extra.mjs", root), "utf8"),
  readFile(new URL("scripts/admin-console-assets.mjs", root), "utf8"),
  readFile(new URL("scripts/build.mjs", root), "utf8"),
  readFile(new URL("scripts/dev-server.mjs", root), "utf8"),
  readFile(new URL("supabase/config.toml", root), "utf8"),
]);

test("V3 ports every previously missing operations area onto the service-mediated console", () => {
  for (const view of ["returns", "inquiries", "reviews", "promo", "pos", "settlement", "brands"]) {
    assert.match(extraEdge, new RegExp(`view ===? \\"?${view}|view===\\"${view}\\"`));
  }
  for (const tab of ["returns", "inquiries", "reviews", "promo", "pos", "settlement"]) {
    assert.match(extraUi, new RegExp(`data-extra-tab=\\"${tab}\\"`));
    assert.match(extraUi, new RegExp(`data-panel=\\"${tab}\\"`));
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

test("new product registration is atomic and low-stock configuration is bounded", () => {
  assert.match(migration, /insert into public\.products/);
  assert.match(migration, /insert into public\.product_variants/);
  assert.match(migration, /low_stock_threshold/);
  assert.match(migration, /v_threshold not between 0 and 9999/);
  assert.match(extraUi, /data-product-create-form-extra/);
  assert.match(extraUi, /lowStockThreshold/);
});

test("cover photo no longer overwrites every SKU thumbnail and sales CSV blocks formula injection", () => {
  assert.match(extraUi, /대표 SKU 하나에만 반영/);
  assert.match(extraUi, /variants:\[\{id:target\.id,thumbnailUrl:publicUrl\}\]/);
  assert.match(extraUi, /\^\[=\+\\-@\]/);
  assert.match(extraUi, /csvCell/);
});

test("extended console assets are injected in both production build and local E2E server", () => {
  assert.match(injector, /store-console-extra\.css/);
  assert.match(injector, /store-console-extra\.mjs/);
  assert.match(build, /injectAdminConsoleAssets\(injectPublicConfig\(storeManagerHtml\)\)/);
  assert.match(devServer, /configuredStoreManagerHtml/);
  assert.match(devServer, /injectAdminConsoleAssets/);
  assert.match(config, /\[functions\.admin-ops-extra\]/);
  assert.match(config, /verify_jwt = false/);
});
