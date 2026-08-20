import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  ROOT,
  absolute,
  assertAnyMatch,
  assertMatch,
  assertNoMatch,
  combined,
  exists,
  filesUnder,
  localModuleSpecifiers,
  parseEnvExample,
  read,
  reachableFunctionSources,
  resolveLocalImport,
} from "./helpers.mjs";

const appSource = read("app.js");
const cssSource = read("styles.css");
const indexSource = read("index.html");
const frontendFiles = filesUnder("src/frontend", (file) => /\.(?:m?js|ts)$/.test(file));
const browserSource = combined(["app.js", "index.html", ...frontendFiles]);

async function importFromRoot(relativePath) {
  return import(`${pathToFileURL(absolute(relativePath)).href}?contract=${Date.now()}-${Math.random()}`);
}

test("catalog variants fail closed and never fabricate orderable stock", async () => {
  assertNoMatch(
    combined(["app.js", ...frontendFiles]),
    /\bstock\s*:\s*99\b/i,
    "Production browser code must not fabricate stock: 99 when a DB variant is missing."
  );
  assertNoMatch(
    combined(["app.js", ...frontendFiles]),
    /(?:function\s+is(?:Variant)?OptionSelectable\s*\([^)]*\)|\bis(?:Variant)?OptionSelectable\s*=\s*[^=]*=>)\s*\{?\s*return\s+true\s*;?\s*\}?/i,
    "Option-selectability must be derived from active, priced DB variants instead of always returning true."
  );

  assert.ok(exists("src/frontend/catalog/variants.mjs"), "A catalog variant module is required.");
  const variants = await importFromRoot("src/frontend/catalog/variants.mjs");
  const product = {
    variants: [{ id: "fallback", stock: 999, price: 1, active: true }],
    dbVariants: [
      { id: "ok", model: "V1", grade: "A", pack: "10", color: "white", stock: 2, price: 18000, active: true },
      { id: "sold", model: "V1X", grade: "A", pack: "10", color: "white", stock: 0, price: 19000, active: true },
      { id: "off", model: "V1", grade: "B", pack: "10", color: "yellow", stock: 5, price: 12000, active: false },
      { id: "free", model: "V1", grade: "B", pack: "30", color: "white", stock: 5, price: 0, active: true },
    ],
  };
  assert.deepEqual(variants.orderableVariants(product).map(({ id }) => id), ["ok"]);
  assert.equal(variants.isVariantOptionSelectable(product, "model", "V1X"), false, "A sold-out option was selectable.");
  assert.equal(variants.isVariantOptionSelectable(product, "grade", "B"), false, "Inactive/unpriced options were selectable.");
  assert.equal(variants.findExactOrderableVariant(product, { model: "V1", grade: "A", pack: "10", color: "white" })?.id, "ok");
  assert.equal(variants.findExactOrderableVariant(product, { model: "missing", grade: "A", pack: "10", color: "white" }), null);
  assert.equal(variants.orderableVariants({ variants: product.variants }).length, 0, "Exploration fallback data became orderable.");
  assert.throws(() => variants.assertOrderableQuantity(product.dbVariants[0], 3), /최대|stock|재고/i);
});

test("orders send only variant identity and quantity from the browser", async () => {
  assert.ok(exists("src/frontend/commerce/order-client.mjs"), "A server-order client module is required.");
  const orders = await importFromRoot("src/frontend/commerce/order-client.mjs");
  const payload = orders.orderLinePayload([
    { variantId: "variant-1", quantity: 2, price: 1, total: 2, customer: { phone: "01012345678" } },
  ]);
  assert.deepEqual(payload, [{ variantId: "variant-1", quantity: 2 }], "Client order lines leaked client price or customer fields.");
  assert.throws(() => orders.orderLinePayload([{ variantId: "", quantity: 1 }]), /올바르|variant|상품/i);

  let requestBody;
  await orders.createOrderRequest(
    {
      baseUrl: "https://example.test",
      anonKey: "public",
      idempotencyKey: "order_contract_1234567890",
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ order: { id: "order-1" } }), { status: 200 });
      },
    },
    { items: payload, shipping: { name: "홍길동" } }
  );
  assert.deepEqual(requestBody.items, payload);
});

test("payment preparation sends only the server order identity", async () => {
  const payments = await importFromRoot("src/frontend/payments/toss-client.mjs");
  let captured;
  await payments.prepareTossPayment(
    {
      baseUrl: "https://example.test",
      anonKey: "public",
      fetchImpl: async (url, init) => {
        captured = { url, init, body: JSON.parse(init.body) };
        return new Response(JSON.stringify({ orderId: "server-order", amount: 18000 }), { status: 200 });
      },
    },
    "order-1"
  );
  assert.match(captured.url, /\/functions\/v1\/prepare-payment$/);
  assert.deepEqual(captured.body, { orderId: "order-1" }, "Payment preparation must not send a browser amount/orderName.");
  assert.equal(/secret/i.test(JSON.stringify(captured.init.headers)), false, "Browser payment headers contain a secret-named field.");
});

test("legacy PII orders and local administrator trust are absent from the runtime entry", async () => {
  for (const [pattern, message] of [
    [/\bstock\s*:\s*99\b/i, "fabricated stock fallback remains"],
    [/\bstate\.ephemeralOrders\b|reball\.ephemeralOrders/i, "ephemeralOrders remains an order source"],
    [/(?:guestPassword|orderPassword)[\s\S]{0,160}(?:phone|telephone)[\s\S]{0,100}\.slice\s*\(\s*-?4\s*\)/i, "phone last-four guest password remains"],
    [/\bdefaultAdminCredentials\b|\bstate\.adminCredentials\b|\blocalPasswordMatches\b/i, "local credentials still authorize administrators"],
    [/reball\.(?:adminUser|adminCredentials|adminProfile)/i, "local admin identity keys remain in the runtime entry"],
  ]) assertNoMatch(appSource, pattern, `app.js security regression: ${message}.`);

  assertMatch(appSource, /clearLegacySensitiveStorage\s*\(/, "Startup must actively remove sensitive legacy localStorage keys.");
  const storage = await importFromRoot("src/frontend/core/storage.mjs");
  const data = new Map(storage.LEGACY_SENSITIVE_KEYS.map((key) => [key, "sensitive"]));
  const memoryStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  storage.clearLegacySensitiveStorage(memoryStorage);
  assert.equal(data.size, 0, "Sensitive legacy keys were not all removed.");
  assert.deepEqual(
    storage.sanitizeCartEntries([{ variantId: "v1", quantity: 1, name: "이름", phone: "010", address: "주소", price: 500 }]),
    [{ variantId: "v1", quantity: 1 }],
    "Persisted cart state contains more than variantId and quantity."
  );
});

test("admin module enforces the four server roles and least privilege", async () => {
  const permissions = await importFromRoot("src/frontend/auth/admin-permissions.mjs");
  assert.deepEqual(
    [...permissions.ADMIN_ROLES].sort(),
    ["cs_manager", "inventory_manager", "owner_admin", "payments_manager"]
  );
  assert.equal(permissions.hasAdminRole(["customer"]), false);
  assert.equal(permissions.canAccessAdminTab(["inventory_manager"], "product"), true);
  assert.equal(permissions.canAccessAdminTab(["inventory_manager"], "settlement"), false);
  assert.equal(permissions.canAccessAdminTab(["payments_manager"], "settlement"), true);
  assert.equal(permissions.canAccessAdminTab(["cs_manager"], "inquiry"), true);
  assert.equal(permissions.canAccessAdminTab(["cs_manager"], "settings"), false);
  assert.throws(() => permissions.requireAdminTab(["customer"], "dashboard"), /권한|admin/i);

  assertAnyMatch(appSource, [/\.auth\.getSession\s*\(/, /\.auth\.getUser\s*\(/], "Admin rendering must be preceded by a real Supabase session check.");
  assertMatch(appSource, /user_roles/i, "Admin authorization must load actual user_roles, not a browser flag.");
  assertMatch(appSource, /(?:hasAdminRole|requireAdminTab|canAccessAdminTab)\s*\(/, "Admin UI must consume the role permission module.");
});

test("browser sources contain no server secret names or credential-shaped values", () => {
  for (const name of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "TOSS_SECRET_KEY",
    "CAPTCHA_SECRET_KEY",
    "AUTH_CAPTCHA_SECRET_KEY",
    "GUEST_ORDER_TOKEN_PEPPER",
    "AUTH_RATE_LIMIT_SALT",
    "AUTH_RATE_LIMIT_PEPPER",
  ]) assertNoMatch(browserSource, new RegExp(`\\b${name}\\b`), `Server-only environment name ${name} leaked into browser code.`);
  assertNoMatch(browserSource, /\b(?:live|test)_sk_[A-Za-z0-9_-]{10,}\b|\bsb_secret_[A-Za-z0-9_-]{10,}\b/, "A server credential-shaped value is embedded in browser code.");
});

test("environment schema is complete and example secrets are blank", () => {
  const env = parseEnvExample(read(".env.example"));
  const required = [
    "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "TOSS_CLIENT_KEY", "TOSS_SECRET_KEY", "TOSS_MID", "APP_ORIGIN",
    "TOSS_SUCCESS_URL", "TOSS_FAIL_URL", "TOSS_WEBHOOK_VERIFY_BY_API",
    "GUEST_ORDER_TOKEN_PEPPER",
    "PAYMENT_PROVIDER", "ALLOW_MOCK_PAYMENTS",
  ];
  for (const name of required) assert.ok(env.has(name), `.env.example is missing ${name}.`);
  for (const [purpose, alternatives] of [
    ["auth rate-limit pepper/salt", ["AUTH_RATE_LIMIT_PEPPER", "AUTH_RATE_LIMIT_SALT"]],
    ["CAPTCHA provider", ["AUTH_CAPTCHA_PROVIDER", "CAPTCHA_PROVIDER"]],
    ["CAPTCHA browser site key", ["AUTH_CAPTCHA_SITE_KEY", "CAPTCHA_SITE_KEY"]],
    ["CAPTCHA server secret", ["AUTH_CAPTCHA_SECRET_KEY", "CAPTCHA_SECRET_KEY"]],
    ["CAPTCHA enforcement mode", ["AUTH_CAPTCHA_MODE", "CAPTCHA_REQUIRED"]],
  ]) assert.ok(alternatives.some((name) => env.has(name)), `.env.example is missing ${purpose}.`);
  const secretNames = [
    "SUPABASE_SERVICE_ROLE_KEY", "TOSS_SECRET_KEY", "GUEST_ORDER_TOKEN_PEPPER",
    "AUTH_RATE_LIMIT_PEPPER", "AUTH_RATE_LIMIT_SALT", "AUTH_CAPTCHA_SECRET_KEY", "CAPTCHA_SECRET_KEY",
  ].filter((name) => env.has(name));
  for (const name of secretNames)
    assert.equal(env.get(name), "", `.env.example must not contain a value for ${name}.`);
});

test("development and build use the exact production entry", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts?.dev, "node scripts/dev-server.mjs", "npm run dev must use scripts/dev-server.mjs exactly.");
  assert.equal(pkg.scripts?.build, "node scripts/build.mjs", "npm run build must use scripts/build.mjs exactly.");
  assertMatch(indexSource, /<script\s+type=["']module["']\s+src=["']\.\/app\.js(?:\?[^"']*)?["']\s*>/i, "index.html must load app.js as its module entry.");
  const dev = read("scripts/dev-server.mjs");
  assertNoMatch(dev, /index-current\.html|app-current\.js/i, "The development server must not prefer a stale *-current entry.");
  assertMatch(dev, /["']index\.html["']/, "The development root must serve index.html.");
  assertNoMatch(combined(["index.html", "scripts/dev-server.mjs", "scripts/build.mjs"]), /(?:index|app)-current\.(?:html|js)/i, "No executable path may reference the legacy current copy.");
});

test("frontend modules are real entry dependencies and the build copies their import graph", () => {
  const imports = localModuleSpecifiers(appSource);
  const joined = imports.join("\n");
  for (const [label, pattern] of [
    ["catalog/variant", /(?:catalog|variant)/i], ["core/storage/state", /(?:core|storage|state)/i],
    ["commerce/order/checkout", /(?:commerce|order|checkout)/i], ["payments", /payment/i], ["auth/admin", /(?:auth|admin)/i],
  ]) assert.match(joined, pattern, `app.js must use a ${label} module.`);

  const build = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  assert.equal(build.status, 0, `Build failed while verifying deploy copy.\nSTDOUT:\n${build.stdout}\nSTDERR:\n${build.stderr}`);
  for (const file of ["index.html", "app.js", "styles.css"])
    assert.equal(readFileSync(absolute(`dist/${file}`), "utf8"), read(file), `dist/${file} is not an exact copy of the production entry.`);

  const queue = ["app.js"];
  const visited = new Set();
  while (queue.length) {
    const importer = queue.shift();
    if (visited.has(importer)) continue;
    visited.add(importer);
    for (const specifier of localModuleSpecifiers(read(importer))) {
      const dependency = resolveLocalImport(importer, specifier);
      assert.ok(exists(dependency), `${importer} imports missing local module ${specifier}.`);
      assert.ok(exists(`dist/${dependency}`), `Build omitted browser module ${dependency}; deployment would fail.`);
      assert.equal(read(`dist/${dependency}`), read(dependency), `Built module differs from ${dependency}.`);
      if (/\.(?:m?js)$/.test(dependency)) queue.push(dependency);
    }
  }
});

test("home has one reachable h1 and the five conversion stages in order", () => {
  assertMatch(
    appSource,
    /import\s*\{[^}]*\bgradeConditionGuide\b[^}]*\}\s*from\s*["']\.\/src\/frontend\/catalog\/content\.mjs["']/s,
    "Home grade guide must import gradeConditionGuide from the catalog content module."
  );
  const reachable = reachableFunctionSources(
    appSource,
    "renderHome",
    (name) => !/^(?:layout|bind|renderHeader|renderFooter|renderAdmin|renderAuth|renderLogin|renderMypage|renderOrder)/u.test(name)
  );
  assert.ok(reachable.length > 0, "Could not locate renderHome for the static heading contract.");
  const h1Count = (reachable.join("\n").match(/<h1\b/gi) ?? []).length;
  assert.equal(h1Count, 1, `Home render graph contains ${h1Count} literal <h1> elements; exactly one is allowed.`);

  const renderHome = reachable[0];
  const layoutStart = renderHome.search(/\blayout\s*\(/);
  const composition = renderHome.slice(Math.max(0, layoutStart)).toLowerCase();
  const stages = [
    ["representative hero", ["flighttransitionsection", "renderhomehero", "home-hero"]],
    ["grade/inspection trust", ["renderhomegrade", "renderhomeinspection", "home-trust", "home-stage--trust"]],
    ["best products", ["bestseller-section", "featured-products-section", "home-best", "home-stage--products"]],
    ["shipping/returns", ["home-shipping", "shipping-section", "delivery-return"]],
    ["final commerce CTA", ["home-bottom-cta", "final-cta"]],
  ];
  let previous = -1;
  for (const [label, markers] of stages) {
    const positions = markers.map((marker) => composition.indexOf(marker)).filter((position) => position >= 0);
    assert.ok(positions.length, `Home is missing a static marker for ${label}.`);
    const position = Math.min(...positions);
    assert.ok(position > previous, `Home stage ${label} is out of the required conversion order.`);
    previous = position;
  }

  const footerSource = reachableFunctionSources(appSource, "renderFooter").join("\n");
  assert.match(footerSource, /footer-store-business/u, "Store and business disclosure must remain in the footer.");
  assert.doesNotMatch(renderHome, /home-stage--store/u, "Store and business disclosure must not render as a home content stage.");
});

test("button system exposes four variants, two heights, one radius, and interaction states", () => {
  for (const [value, label] of [["44px", "compact height"], ["52px", "large height"], ["10px", "shared radius"]])
    assertMatch(cssSource, new RegExp(`--(?:(?:button|btn)[\\w-]*|[\\w-]*(?:button|btn))\\s*:\\s*${value.replace(".", "\\.")}`, "i"), `Button tokens must define a ${label} of ${value}.`);
  for (const [variant, pattern] of [
    ["primary", /(?:button|btn)[^,{\n]*primary|primary[^,{\n]*(?:button|btn)/i],
    ["secondary", /(?:button|btn)[^,{\n]*secondary|secondary[^,{\n]*(?:button|btn)/i],
    ["tertiary/ghost", /(?:button|btn)[^,{\n]*(?:tertiary|ghost)|(?:tertiary|ghost)[^,{\n]*(?:button|btn)/i],
    ["icon", /(?:button|btn)[^,{\n]*icon|icon[^,{\n]*(?:button|btn)/i],
  ]) assertMatch(cssSource, pattern, `Button system is missing the ${variant} variant.`);
  for (const state of [":hover", ":focus-visible", ":active", ":disabled"])
    assertMatch(cssSource, new RegExp(state.replace(":", "\\:"), "i"), `Button styles are missing ${state}.`);
  assertAnyMatch(cssSource, [/\.is-loading/i, /\[aria-busy=["']true["']\]/i, /data-loading/i], "Button system needs a loading state.");
  assertMatch(cssSource, /(?:icon[^,{\n]*(?:button|btn)|(?:button|btn)[^,{\n]*icon)[\s\S]{0,900}(?:min-(?:width|inline-size)|width)\s*:\s*(?:44px|var\(--(?:button|btn)-height-(?:sm|small|compact)\))[\s\S]{0,500}(?:min-(?:height|block-size)|height)\s*:\s*(?:44px|var\(--(?:button|btn)-height-(?:sm|small|compact)\))/i, "Icon buttons must have a minimum 44x44 target.");
  assertNoMatch(appSource, />\s*(?:WISH|ADD)\s*</i, "Visible mixed-language WISH/ADD actions must be Korean user actions.");
});
