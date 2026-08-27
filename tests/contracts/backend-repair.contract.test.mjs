import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAnyMatch,
  assertMatch,
  assertNoMatch,
  combined,
  filesUnder,
  parseEnvExample,
  read,
  stripSqlComments,
} from "./helpers.mjs";

const migrationFiles = filesUnder("supabase/migrations", (file) => /\.sql$/i.test(file));
const allMigrationSource = stripSqlComments(combined(migrationFiles));
const productionMigrationFiles = migrationFiles.filter((file) => /(?:202607|production|commerce|security)/i.test(file));
const migrationSource = stripSqlComments(combined(productionMigrationFiles.length ? productionMigrationFiles : migrationFiles));
const allFunctionFiles = filesUnder("supabase/functions", (file) => /\.ts$/i.test(file));
const functionFiles = allFunctionFiles.filter((file) => /\/index\.ts$/i.test(file));
const sharedFunctionFiles = allFunctionFiles.filter((file) => /\/_shared\//i.test(file));
const sharedEdgeSource = combined(sharedFunctionFiles);
const edgeFunctions = functionFiles.map((file) => ({ file, name: file.split("/").at(-2), source: read(file) }));
const allEdgeSource = edgeFunctions.map(({ file, source }) => `\n/* ${file} */\n${source}`).join("\n");
const allTrustedFunctionSource = combined(allFunctionFiles);

function edgeByCapability(label, namePatterns, sourcePatterns) {
  const candidate = edgeFunctions.find(({ name }) => namePatterns.some((pattern) => pattern.test(name)))
    ?? edgeFunctions.find(({ source }) => sourcePatterns.every((pattern) => pattern.test(source)));
  assert.ok(candidate, `${label} Edge Function is missing. Found: ${edgeFunctions.map(({ name }) => name).join(", ") || "none"}`);
  return candidate;
}

test("production migration is non-empty and implements atomic reservation/release", () => {
  assert.ok(productionMigrationFiles.length, "A timestamped production commerce/security migration is required.");
  assert.ok(migrationSource.trim().length > 1000, "The production migration is empty or only a placeholder.");
  assertMatch(migrationSource, /create\s+(?:or\s+replace\s+)?function[\s\S]{0,1200}(?:reserve|create[_\s]?order)/i, "Migration needs a transactional order/reservation RPC.");
  assertAnyMatch(migrationSource, [/\bfor\s+(?:no\s+key\s+)?update\b/i, /\bpg_advisory_xact_lock\s*\(/i], "Reservation must lock inventory inside the DB transaction.");
  assertMatch(migrationSource, /update\s+(?:public\.)?(?:product_variants|variants|inventory)\b[\s\S]{0,1200}(?:stock|reserved)/i, "Reservation must update authoritative variant inventory.");
  assertAnyMatch(migrationSource, [/(?:stock|stock_qty|available_stock)\s*=\s*[^;]+?\s-\s*/i, /reserved_(?:stock|quantity|qty)\s*=\s*[^;]+?\s\+\s*/i], "Reservation must atomically consume or reserve stock.");
  assertAnyMatch(migrationSource, [/(?:stock|stock_qty|available_stock)\s*(?:>=|<)\s*(?:p_)?(?:quantity|qty)/i, /check\s*\([^)]*(?:stock|quantity|qty)[^)]*>=\s*0/i], "Reservation must reject insufficient stock and prevent negative inventory.");
  assertMatch(migrationSource, /(?:release|restore|cancel)[_\w]*(?:reservation|inventory|stock)|(?:reservation|inventory|stock)[_\w]*(?:release|restore)/i, "Migration needs a reservation release/restore path.");
  assertAnyMatch(migrationSource, [/(?:stock|stock_qty|available_stock)\s*=\s*[^;]+?\s\+\s*/i, /reserved_(?:stock|quantity|qty)\s*=\s*[^;]+?\s-\s*/i], "Failed/canceled orders must restore reserved stock.");
});

test("migration enforces order states, transitions, snapshots, and audit events", () => {
  for (const state of ["draft", "payment_ready", "payment_auth_started", "waiting_for_deposit", "paid", "payment_failed", "canceled"])
    assertMatch(migrationSource, new RegExp(`['\"]${state}['\"]`, "i"), `Order state ${state} is missing.`);
  assertAnyMatch(migrationSource, [/['"]shipping_ready['"]/i, /['"]preparing_shipment['"]/i, /['"]fulfillment_ready['"]/i], "A shipment-preparation state is missing.");
  assertMatch(migrationSource, /['"](?:shipped|in_transit)['"]/i, "A shipped/in-transit state is missing.");
  assertMatch(migrationSource, /['"]delivered['"]/i, "A delivered state is missing.");
  assertMatch(migrationSource, /(?:transition|state_change)/i, "State changes need an explicit transition validator.");
  assertAnyMatch(migrationSource, [/raise\s+exception[\s\S]{0,300}(?:transition|status)/i, /create\s+(?:constraint\s+)?trigger[\s\S]{0,500}(?:transition|status)/i], "Invalid order transitions must be rejected by the DB.");
  for (const snapshot of ["product_name", "variant", "unit_price", "quantity", "shipping", "total"])
    assertMatch(migrationSource, new RegExp(`(?:snapshot|order_items|orders)[\\s\\S]{0,2500}${snapshot}`, "i"), `Order snapshot is missing ${snapshot}.`);
  assertMatch(migrationSource, /(?:order_events|audit_events|commerce_events)/i, "Order/payment/inventory audit event storage is required.");
});

test("guest lookup is hash-only and order RLS/role grants fail closed", () => {
  assertMatch(migrationSource, /guest[_\w]*(?:lookup|order)?[_\w]*token[_\w]*hash|guest[_\w]*hash/i, "Guest lookup tokens must be stored as hashes.");
  assertAnyMatch(`${migrationSource}\n${allTrustedFunctionSource}`, [/\bdigest\s*\(/i, /\bhmac\s*\(/i, /\bcrypt\s*\(/i, /subtle\.digest\s*\(/i, /hmacSha256/i], "Guest lookup token hashing is missing from the trusted DB/Edge boundary.");
  assertNoMatch(migrationSource, /(?:add\s+column\s+|\n\s*)guest_(?:lookup_)?token\s+(?:text|varchar|uuid)\b/i, "A raw guest lookup token column is forbidden.");
  assertMatch(allMigrationSource, /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?orders\s+enable\s+row\s+level\s+security/i, "RLS must be enabled on orders across the applied migration chain.");
  const policyStatements = allMigrationSource.split(";").filter((statement) => /create\s+policy/i.test(statement));
  const broadAnonOrderPolicy = policyStatements.find((statement) => /\bon\s+(?:public\.)?orders\b/i.test(statement) && /\bto\s+anon\b/i.test(statement) && /\bfor\s+select\b/i.test(statement));
  assert.equal(broadAnonOrderPolicy, undefined, `Guest orders must not have an anon SELECT policy:\n${broadAnonOrderPolicy ?? ""}`);
  assertMatch(migrationSource, /auth\.uid\s*\(\s*\)[\s\S]{0,300}(?:user_id|customer_id|member_id)/i, "Members need a self-only order RLS condition tied to auth.uid().");
  for (const role of ["owner_admin", "inventory_manager", "payments_manager", "cs_manager"])
    assertMatch(migrationSource, new RegExp(`['\"]${role}['\"]`, "i"), `Database role ${role} is missing.`);
  assertMatch(migrationSource, /revoke\s+(?:all|execute)[\s\S]{0,500}\bfrom\s+public/i, "Security-definer commerce RPCs must revoke PUBLIC execution.");
  assertMatch(migrationSource, /grant\s+execute[\s\S]{0,500}\bto\s+(?:service_role|authenticated)/i, "Commerce RPC execution must be granted only to intended roles.");
});

test("full-order PII access is limited to the member, CS, and owner roles", () => {
  const policies = [
    migrationSource.match(/create\s+policy\s+orders_self_select[\s\S]+?\);/i)?.[0] || "",
    migrationSource.match(/create\s+policy\s+order_items_self_select[\s\S]+?\);/i)?.[0] || "",
    migrationSource.match(/create\s+policy\s+shipping_snapshots_self_select[\s\S]+?\);/i)?.[0] || "",
  ];
  const trustedLookup = migrationSource.match(
    /create\s+or\s+replace\s+function\s+private\.can_access_order[\s\S]+?\$\$;/i,
  )?.[0] || "";
  for (const policy of policies) {
    assert.ok(policy, "A full-order PII policy is missing.");
    assertNoMatch(policy, /payments_manager|inventory_manager/i, "Non-CS operational roles must not select full-order PII.");
    assertMatch(policy, /cs_manager/i, "CS needs the explicit full-order support role.");
    assertMatch(policy, /owner_admin/i, "The owner role needs full-order access.");
  }
  assert.ok(trustedLookup, "The trusted full-order lookup helper is missing.");
  assertNoMatch(
    trustedLookup,
    /user_has_role\(p_actor_user_id,\s*'(?:payments_manager|inventory_manager)'\)/i,
    "A service-role RPC must not turn a payment or inventory role into a full-order PII reader.",
  );
});

test("server order creation and guest lookup Edge Functions use database authority", () => {
  const createOrder = edgeByCapability("Create order", [/create.*order|order.*create/i], [/variant/i, /quantity/i, /(?:rpc|reserve)/i]);
  assertMatch(createOrder.source, /\bPOST\b/, `${createOrder.name} must accept POST only.`);
  assertMatch(createOrder.source, /(?:variantId|variant_id)/, `${createOrder.name} must accept variant IDs.`);
  assertMatch(createOrder.source, /quantity/, `${createOrder.name} must accept quantities.`);
  assertMatch(createOrder.source, /\.rpc\s*\(/, `${createOrder.name} must delegate atomic reservation/order creation to a DB RPC.`);
  assertAnyMatch(createOrder.source, [/crypto\.getRandomValues/i, /randomUUID\s*\(/i, /randomBytes/i], `${createOrder.name} must issue a cryptographically random guest lookup token.`);
  assertMatch(createOrder.source, /(?:guest[\w]*hash|hash[\w]*guest|hmacSha256)/i, `${createOrder.name} must persist only a guest-token hash.`);
  assertNoMatch(createOrder.source, /(?:const|let|var)\s+(?:total|amount|price)\s*=\s*body\.(?:total|amount|price)|\bbody\.(?:totalKrw|total_krw|unitPrice|unit_price)\b/i, `${createOrder.name} must not trust a client total or price.`);

  const lookup = edgeByCapability("Guest order lookup", [/guest.*order.*lookup|order.*lookup|lookup.*order/i], [/guest/i, /token/i, /order/i]);
  assertMatch(lookup.source, /token/i, `${lookup.name} must require a high-entropy guest token.`);
  assertAnyMatch(lookup.source, [/\.rpc\s*\(/i, /(?:digest|hmac|subtle\.digest)\s*\(/i], `${lookup.name} must hash/verify the guest token server-side.`);
  assertMatch(lookup.source, /(?:guest[\w]*hash|hash[\w]*guest|hmacSha256)/i, `${lookup.name} must derive a guest-token hash before trusted lookup.`);
  assertNoMatch(lookup.source, /Authorization\s*:\s*`Bearer\s*\$\{(?:anon|publishable)/i, `${lookup.name} must not query guest orders with an anonymous token.`);
});

test("payment prepare/confirm never trusts success URL and confirms DONE server-side", () => {
  const prepare = edgeByCapability("Prepare payment", [/prepare.*payment|payment.*prepare/i], [/payment_ready/i, /order/i, /amount/i]);
  assertMatch(prepare.source, /payment_ready/i, `${prepare.name} must allow payment only for payment_ready orders.`);
  assertNoMatch(prepare.source, /\bbody\.(?:amount|orderName|order_name|total)\b/i, `${prepare.name} must use server order ID/name/amount, not browser values.`);

  const confirm = edgeByCapability("Confirm payment", [/(?:confirm|approve).*payment|payment.*(?:confirm|approve)/i], [/paymentKey/i, /orderId/i, /amount/i]);
  assertMatch(sharedEdgeSource, /api\.tosspayments\.com[\s\S]+\/v1\/payments\/confirm/i, `${confirm.name} must call Toss's server confirm endpoint.`);
  assertMatch(sharedEdgeSource, /TOSS_SECRET_KEY/, `${confirm.name} must authenticate with the server-only Toss secret.`);
  assertMatch(confirm.source, /paymentProvider\s*\(\s*\)/, `${confirm.name} must use the shared fail-closed provider.`);
  assertMatch(confirm.source, /paymentKey[\s\S]{0,2000}orderId[\s\S]{0,2000}amount/i, `${confirm.name} must validate paymentKey, orderId, and amount.`);
  assertMatch(confirm.source, /(?:expected|order|db)[_\w.\s\[\]'"?]*(?:amount|total)[\s\S]{0,500}(?:!==|!=|===|=|eq)/i, `${confirm.name} must compare amount to the DB order.`);
  assertMatch(confirm.source, /['"]DONE['"]/i, `${confirm.name} may mark paid only for Toss DONE.`);
  assertMatch(confirm.source, /(?:status|payment_status)[\s\S]{0,500}['"]paid['"]/i, `${confirm.name} must persist paid only after server confirmation.`);
  assertAnyMatch(confirm.source, [/Idempotency-Key/i, /idempotenc/i], `${confirm.name} needs an idempotency key/claim.`);
});

test("Toss webhook verification, state mapping, and duplicate handling are explicit", () => {
  const webhook = edgeByCapability("Toss webhook", [/webhook/i], [/payment/i, /event/i]);
  assertMatch(webhook.source, /TOSS_SECRET_KEY|TOSS_WEBHOOK/i, `${webhook.name} must verify events using server configuration.`);
  assertAnyMatch(webhook.source, [/api\.tosspayments\.com\/v1\/payments\//i, /verifyWebhook|verify_webhook|signature/i], `${webhook.name} must verify webhook authenticity before mutation.`);
  for (const state of ["DONE", "CANCELED", "WAITING_FOR_DEPOSIT"])
    assertMatch(webhook.source, new RegExp(`['\"]${state}['\"]`, "i"), `${webhook.name} does not map Toss ${state}.`);
  assertAnyMatch(webhook.source, [/idempotenc/i, /duplicate/i, /onConflict|on_conflict/i], `${webhook.name} must make duplicate events harmless.`);
  assertMatch(webhook.source, /(?:event|webhook)[_\w]*(?:id|key)/i, `${webhook.name} must persist a stable event identity.`);
  assertMatch(webhook.source, /paymentProvider\s*\(\s*\)/, `${webhook.name} must obtain the provider through the shared fail-closed factory.`);
  assertMatch(sharedEdgeSource, /if\s*\(\s*provider\s*===\s*["']mock["']\s*\)[\s\S]{0,160}assertMockPaymentProviderAllowed\s*\(\s*\)/i, "The shared provider factory must guard every mock provider selection.");
  assertMatch(sharedEdgeSource, /function\s+assertMockPaymentProviderAllowed[\s\S]{0,220}!isExplicitNonProductionRuntime\s*\(\s*\)/i, "Mock payments must fail closed unless the runtime is explicitly non-production.");
  assertMatch(sharedEdgeSource, /function\s+isExplicitNonProductionRuntime[\s\S]{0,220}DENO_ENV[\s\S]{0,220}(?:development|local|test)/i, "The non-production runtime allowlist must be driven by an explicit DENO_ENV value.");
});

test("auth Edge Functions rate-limit, verify CAPTCHA, and never auto-confirm email", () => {
  const authNames = ["signup-with-login-id", "login-with-identifier", "auth-assist"];
  for (const name of authNames) {
    const fn = edgeFunctions.find((candidate) => candidate.name === name);
    assert.ok(fn, `Required auth Edge Function is missing: ${name}`);
    assertMatch(fn.source, /(?:enforceRateLimit|rate[_-]?limit|consume[_\w]*limit|auth_rate)/i, `${name} has no server-side rate-limit check.`);
    assertMatch(fn.source, /(?:verifyCaptcha|captcha)/i, `${name} has no CAPTCHA verification/fail-closed hook.`);
  }
  assertMatch(sharedEdgeSource, /(?:AUTH_)?CAPTCHA_(?:SECRET_KEY|REQUIRED|MODE)/i, "Shared CAPTCHA verification does not read server enforcement configuration.");
  const signup = edgeFunctions.find(({ name }) => name === "signup-with-login-id");
  assertNoMatch(signup.source, /email_confirm\s*:\s*true/i, "signup-with-login-id must not bypass email ownership verification.");
  assertAnyMatch(signup.source, [/signUp\s*\(/i, /email_confirm\s*:\s*false/i, /emailRedirectTo|redirect_to/i], "Signup must use an unconfirmed/email-verification flow.");
  assertNoMatch(allTrustedFunctionSource, /console\.(?:log|error|warn)\s*\([^\n]*(?:password|lookupToken|accessToken|refreshToken)/i, "Security logs must not print passwords or tokens.");
});

test("every explicit Edge Function environment variable is represented by the schema", () => {
  const env = parseEnvExample(read(".env.example"));
  const platformProvided = new Set(["SUPABASE_ANON_KEY", "SUPABASE_DB_URL"]);
  const referenced = new Set([...allTrustedFunctionSource.matchAll(/Deno\.env\.get\s*\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g)].map((match) => match[1]));
  for (const name of referenced)
    assert.ok(env.has(name) || platformProvided.has(name), `Edge Functions reference ${name}, but .env.example does not document it.`);
});
