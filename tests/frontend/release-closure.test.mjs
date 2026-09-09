import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { todayIso } from "../../src/frontend/account/presentation.mjs";
import { checkLoginIdAvailability } from "../../src/frontend/auth/login-id-client.mjs";
import { PENDING_ORDER_ATTEMPT_SESSION_KEY, saveCartSession } from "../../src/frontend/core/storage.mjs";
import { injectPublicConfig } from "../../scripts/public-config.mjs";

test("Korea business date does not drift to UTC date", () => {
  assert.equal(todayIso(new Date("2026-09-08T16:30:00.000Z")), "2026-09-09");
  assert.equal(todayIso(new Date("2026-09-08T00:30:00.000Z")), "2026-09-08");
});

test("login ID availability is decided by the server endpoint", async () => {
  let requestBody = null;
  const fetchImpl = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ loginId: "reballuser", available: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await checkLoginIdAvailability(
    { baseUrl: "https://example.supabase.co", anonKey: "public", fetchImpl },
    { loginId: "ReballUser", captchaToken: "captcha-proof" }
  );
  assert.deepEqual(requestBody, { loginId: "reballuser", captchaToken: "captcha-proof" });
  assert.equal(result.available, false);
});

test("empty cart hydration never clears an unresolved create-order recovery capability", () => {
  const values = new Map([
    [PENDING_ORDER_ATTEMPT_SESSION_KEY, JSON.stringify({ idempotencyKey: "order_1234567890abcdef", authenticated: false, serverAccepted: false })],
  ]);
  const storage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  saveCartSession(storage, []);
  assert.ok(storage.getItem(PENDING_ORDER_ATTEMPT_SESSION_KEY));
});

test("production build refuses missing Turnstile public config", () => {
  const html = readFileSync("index.html", "utf8");
  assert.throws(
    () => injectPublicConfig(html, {
      VERCEL_ENV: "production",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "public",
    }),
    /Turnstile|CAPTCHA/
  );

  const output = injectPublicConfig(html, {
    VERCEL_ENV: "production",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public",
    AUTH_CAPTCHA_PROVIDER: "turnstile",
    AUTH_CAPTCHA_SITE_KEY: "site-key",
  });
  assert.match(output, /name="reball-captcha-provider" content="turnstile"/);
  assert.match(output, /name="reball-captcha-site-key" content="site-key"/);
});

test("release routing and deployment authority are closed", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.equal(vercel.rewrites.some((rule) => rule.source === "/(.*)" && rule.destination === "/index.html"), false);
  assert.equal(vercel.rewrites.some((rule) => rule.source === "/payment/:path*" && rule.destination === "/index.html"), true);
  assert.equal(vercel.redirects.some((rule) => rule.destination.startsWith("https://reballlostball.com/")), true);

  const index = readFileSync("index.html", "utf8");
  assert.match(index, /rel="canonical" href="https:\/\/reballlostball\.com\/"/);
  assert.match(index, /https:\/\/reballlostball\.com\/assets\/figma\/og-image\.png/);
  assert.match(index, /runtime\/release-closure\.mjs/);
  assert.doesNotMatch(index, /fonts\.googleapis\.com/);

  const manifest = JSON.parse(readFileSync("assets/figma/site.webmanifest", "utf8"));
  assert.match(manifest.description, /S\/A\+\/A\/B/);

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.engines.node, "22.x");
  assert.equal(existsSync(".github/workflows/pages.yml"), false);
  assert.equal(existsSync("CNAME"), false);
  assert.equal(existsSync(".nojekyll"), false);
  assert.equal(existsSync("robots.txt"), true);
  assert.equal(existsSync("sitemap.xml"), true);
  assert.equal(existsSync("404.html"), true);
});

test("Codex review blockers stay closed across auth, payment, order recovery and admin pagination", () => {
  const runtime = readFileSync("src/frontend/runtime/release-closure.mjs", "utf8");
  const captcha = readFileSync("src/frontend/auth/captcha-client.mjs", "utf8");
  const loginIdEdge = readFileSync("supabase/functions/check-login-id/index.ts", "utf8");
  const createOrderEdge = readFileSync("supabase/functions/create-order/index.ts", "utf8");
  const pagination = readFileSync("src/frontend/admin/store-manager-pagination.mjs", "utf8");
  const ordersPage = readFileSync("supabase/functions/admin-orders-page/index.ts", "utf8");
  const toss = readFileSync("src/frontend/payments/toss-client.mjs", "utf8");
  const adminAssets = readFileSync("scripts/admin-console-assets.mjs", "utf8");
  const build = readFileSync("scripts/build.mjs", "utf8");
  const devServer = readFileSync("scripts/dev-server.mjs", "utf8");
  const envExample = readFileSync(".env.example", "utf8");

  assert.match(runtime, /resetCaptchaControl\(captchaControl, document\)/);
  assert.match(captcha, /client\.reset\(widgetId\)/);
  assert.match(captcha, /client\.remove\(widgetId\)/);
  assert.match(captcha, /captchaWidgetId/);
  assert.match(runtime, /localStorage\.setItem\("reball\.coupons", "\[\]"\)/);

  const preLimitAt = loginIdEdge.indexOf('"auth_login_id_check_pre"');
  const captchaAt = loginIdEdge.indexOf("await verifyCaptcha");
  const subjectLimitAt = loginIdEdge.indexOf('"auth_login_id_check", loginId');
  assert.ok(preLimitAt >= 0 && captchaAt > preLimitAt && subjectLimitAt > captchaAt);

  assert.match(runtime, /isPaymentConfirm/);
  assert.match(runtime, /!isPaymentConfirm/);
  assert.match(runtime, /pending\.idempotencyKey/);
  assert.match(runtime, /authenticated/);
  assert.match(runtime, /serverAccepted/);
  assert.match(runtime, /finalizeAcceptedOrderAttemptOnRoute/);
  assert.doesNotMatch(runtime, /pending\.body/);
  assert.doesNotMatch(runtime, /requestBodyFingerprint/);
  assert.match(createOrderEdge, /recoverExistingOrder\(idempotencyKey, user\)/);
  assert.match(createOrderEdge, /idempotency_key/);
  assert.match(createOrderEdge, /IDEMPOTENCY_ACTOR_MISMATCH/);
  assert.match(createOrderEdge, /racedRecovery/);
  assert.match(createOrderEdge, /guest-order:\$\{idempotencyKey\}:\$\{fingerprint\}/);

  assert.match(toss, /confirmTimeoutMs/);
  assert.match(toss, /if \(status >= 500\) return true/);
  assert.match(toss, /PAYMENT_CONFIRM_RECOVERY_REQUIRED/);

  assert.match(pagination, /orders:\s*\{ page: 1/);
  assert.match(pagination, /shipping:\s*\{ page: 1/);
  assert.match(pagination, /returns:\s*\{ page: 1/);
  assert.match(pagination, /function activeOrdersScope\(/);
  assert.match(pagination, /parsed\.searchParams\.set\("scope", scope\)/);
  assert.match(pagination, /scope === "shipping"/);
  assert.match(pagination, /data-shipping-pager/);
  assert.match(pagination, /data-returns-pager/);
  assert.match(pagination, /function scheduleFilteredReload\(scope\)/);
  assert.match(pagination, /resetScopeToFirstPage\(scope\)/);
  assert.match(pagination, /setTimeout\(\(\) => reloadScope\(scope\), 250\)/);
  assert.match(pagination, /state\.pending \|\| state\.page <= 1/);
  assert.match(pagination, /state\.pending \|\| !state\.hasMore/);
  assert.match(pagination, /const shouldTimeout = method === "GET"/);
  assert.match(pagination, /searchTruncated/);
  assert.match(pagination, /일부 결과만 확인됨/);

  assert.match(ordersPage, /SHIPPING_STATUSES/);
  assert.match(ordersPage, /RETURN_STATUSES/);
  assert.match(ordersPage, /applyScopeStatus\(params, scope, requestedStatus\)/);
  assert.match(ordersPage, /limit: String\(pageSize \+ 1\)/);
  assert.match(ordersPage, /hasMore: fetched\.length > pageSize/);
  assert.match(ordersPage, /searchTruncated/);
  assert.match(ordersPage, /admin_order_notes_page_v1/);

  assert.match(adminAssets, /store-manager-pagination\.mjs/);
  assert.match(adminAssets, /data-admin-pagination-assets/);
  assert.doesNotMatch(build, /injectStoreManagerReleaseAssets/);
  assert.match(build, /injectAdminConsoleAssets/);
  assert.match(devServer, /injectAdminConsoleAssets/);

  assert.match(envExample, /AUTH_CAPTCHA_PROVIDER=\n/);
  assert.match(envExample, /AUTH_CAPTCHA_SITE_KEY=\n/);
});
