import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260711055444_production_commerce_security.sql", import.meta.url),
  "utf8",
);

test("browser roles cannot write trusted order/payment state", () => {
  assert.match(migration, /drop policy if exists orders_self_insert/i);
  assert.match(migration, /revoke insert, update, delete on public\.orders[\s\S]+from anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.create_order_v1[\s\S]+to service_role/i);
  assert.match(migration, /revoke insert, update, delete on public\.brands, public\.products, public\.product_variants[\s\S]+from anon, authenticated/i);
});

test("stock reservation uses row locks, guarded decrement, and one-time release", () => {
  assert.match(migration, /for update of v/i);
  assert.match(migration, /set stock_qty = stock_qty - v_item\.qty[\s\S]+stock_qty >= v_item\.qty/i);
  assert.match(migration, /status = 'reserved' or \(p_include_consumed and status = 'consumed'\)/i);
  assert.match(migration, /set stock_qty = stock_qty \+ v_reservation\.qty/i);
  assert.match(migration, /product_variants_stock_nonnegative/i);
});

test("guest lookup remains hash-only and RLS has no anonymous order policy", () => {
  assert.match(migration, /guest_lookup_token_hash text/i);
  assert.doesNotMatch(migration, /guest_lookup_token\s+text/i);
  const orderPolicies = migration.split(";").filter((statement) => /create policy[\s\S]+on public\.orders/i.test(statement));
  assert.equal(orderPolicies.some((statement) => /to anon/i.test(statement)), false);
});

test("non-CS operational roles cannot select full-order shipping PII", () => {
  const orderPolicy = migration.match(/create policy orders_self_select[\s\S]+?\);/i)?.[0] || "";
  const itemPolicy = migration.match(/create policy order_items_self_select[\s\S]+?\);/i)?.[0] || "";
  const shippingPolicy = migration.match(/create policy shipping_snapshots_self_select[\s\S]+?\);/i)?.[0] || "";
  const trustedLookup = migration.match(
    /create or replace function private\.can_access_order[\s\S]+?\$\$;/i,
  )?.[0] || "";
  assert.ok(orderPolicy);
  assert.ok(itemPolicy);
  assert.ok(shippingPolicy);
  assert.ok(trustedLookup);
  for (const role of ["payments_manager", "inventory_manager"]) {
    for (const policy of [orderPolicy, itemPolicy, shippingPolicy]) {
      assert.doesNotMatch(policy, new RegExp(role, "i"), `${role} must not select full-order PII tables`);
    }
    assert.doesNotMatch(
      trustedLookup,
      new RegExp(`user_has_role\\(p_actor_user_id, '${role}'\\)`, "i"),
      `${role} must not bypass redacted views through the full-order security-definer RPC`,
    );
  }
  assert.match(trustedLookup, /user_has_role\(p_actor_user_id, 'cs_manager'\)/i);
  assert.match(trustedLookup, /user_has_role\(p_actor_user_id, 'owner_admin'\)/i);
  assert.match(migration, /refund_amount = greatest\(refund_amount, v_refund_total\)/i);
});

test("payment operators receive a redacted cancellation payload without shipping or item PII", () => {
  const redactedPayload = migration.match(
    /create or replace function private\.payment_operation_payload[\s\S]+?\$\$;/i,
  )?.[0] || "";
  const cancellationFunctions = migration.slice(
    migration.indexOf("create or replace function public.claim_payment_cancellation_v1"),
    migration.indexOf("-- Provider-backed reconciliation queue"),
  );
  assert.ok(redactedPayload);
  assert.match(redactedPayload, /'paymentStatus'[\s\S]+'refundAmount'[\s\S]+'totalKrw'/i);
  assert.doesNotMatch(redactedPayload, /'address'|'items'|address_snapshot|order_items/i);
  assert.match(cancellationFunctions, /user_has_role\(p_actor_user_id, 'payments_manager'\)/i);
  assert.match(cancellationFunctions, /private\.payment_operation_payload\(v_order\.id\)/i);
  assert.doesNotMatch(cancellationFunctions, /private\.order_payload\(v_order\.id\)/i);
});

test("auth metadata excludes browser-persisted profile and address PII", () => {
  assert.match(migration, /raw_user_meta_data[\s\S]+- array\[[\s\S]+'name'[\s\S]+'default_address_road'/i);
  assert.match(migration, /complete_signup_profile_v1/i);
  const signup = readFileSync(
    new URL("../../supabase/functions/signup-with-login-id/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(signup, /user_metadata:\s*\{\s*login_id:\s*loginId\s*\}/i);
  assert.doesNotMatch(signup, /user_metadata:\s*\{[\s\S]{0,500}\b(?:phone|default_address|contact_email)\b/i);
});

test("confirmation and webhook functions require idempotent server finalization", () => {
  assert.match(migration, /claim_payment_confirmation_v1/i);
  assert.match(migration, /finalize_payment_confirmation_v1/i);
  assert.match(migration, /when 'DONE' then[\s\S]+v_target_order := 'paid'/i);
  assert.match(migration, /payment_events_provider_dedupe_unique/i);
  assert.match(migration, /claim_payment_webhook_v1/i);
  assert.match(migration, /processing_status = 'processed'/i);
});

test("payment confirmation owns a stock lease and webhook workers remain retryable", () => {
  assert.match(migration, /payment_auth_started[\s\S]+payment_attempts[\s\S]+interval '15 minutes'/i);
  assert.match(migration, /inventory_reservations[\s\S]+greatest\(expires_at, now\(\) \+ interval '15 minutes'\)/i);
  const webhook = readFileSync(
    new URL("../../supabase/functions/payment-webhook/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(webhook, /claim\.processing[\s\S]+HttpError\(503,[\s\S]+WEBHOOK_PROCESSING/i);
  assert.match(webhook, /enforceRateLimit\(req, "payment_webhook", envelopeRateSubject/i);
  assert.ok(
    webhook.indexOf("enforceRateLimit(req, \"payment_webhook\"") <
      webhook.indexOf("verify_payment_webhook_secret_v1"),
    "deposit-secret lookup occurs before the unauthenticated webhook rate limit",
  );
  assert.doesNotMatch(webhook, /claim\.processed\s*\|\|\s*claim\.processing[\s\S]+jsonResponse/i);
});

test("test-only payment and CAPTCHA paths fail closed when DENO_ENV is absent", () => {
  const core = readFileSync(
    new URL("../../supabase/functions/_shared/core.ts", import.meta.url),
    "utf8",
  );
  const payments = readFileSync(
    new URL("../../supabase/functions/_shared/payments.ts", import.meta.url),
    "utf8",
  );
  const security = readFileSync(
    new URL("../../supabase/functions/_shared/security.ts", import.meta.url),
    "utf8",
  );
  const prepare = readFileSync(
    new URL("../../supabase/functions/prepare-payment/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(core, /\["development", "dev", "local", "test"\]/i);
  assert.match(payments, /assertMockPaymentProviderAllowed[\s\S]+!isExplicitNonProductionRuntime\(\)/i);
  assert.match(security, /mode === "test" && isExplicitNonProductionRuntime\(\)/i);
  assert.match(prepare, /isExplicitNonProductionRuntime\(\) && url\.protocol === "http:"/i);
  for (const source of [payments, security, prepare]) {
    assert.doesNotMatch(source, /DENO_ENV[\s\S]{0,80}!={1,2}[\s\S]{0,40}production/i);
  }
});

test("provider reconciliation, virtual-account polling, and partial ledgers are explicit", () => {
  assert.match(migration, /claim_payment_reconciliation_v1/i);
  assert.match(migration, /complete_payment_reconciliation_v1/i);
  const expiryFunction = migration.match(/create or replace function public\.expire_order_reservations_v1[\s\S]+?\$\$;/i)?.[0] || "";
  assert.doesNotMatch(expiryFunction, /o\.status in \([^)]*payment_auth_started/i);
  assert.doesNotMatch(expiryFunction, /o\.status in \([^)]*waiting_for_deposit/i);
  assert.match(migration, /PARTIAL_CANCELED[\s\S]+canceled_amount = v_new_canceled_amount/i);
  assert.match(migration, /refund_amount = greatest\(refund_amount, v_refund_total\)/i);
  assert.match(migration, /next_reconcile_at = case[\s\S]{0,240}interval '15 minutes'/i);
});

test("cancel retries and webhook-first completion are idempotent", () => {
  assert.match(migration, /attemptStatus[\s\S]+canceledAmountBefore[\s\S]+order cannot be canceled/i);
  assert.match(migration, /v_order\.status = 'canceled'[\s\S]+v_payment\.canceled_amount >= p_expected_canceled_total[\s\S]+status = 'succeeded'/i);
  assert.match(migration, /canceled_amount = greatest\(canceled_amount, p_expected_canceled_total\)/i);
  assert.match(migration, /'canceledAmountBefore', v_payment\.canceled_amount[\s\S]+'cancelAmount', v_cancel_amount/i);
  assert.match(migration, /partially_succeeded/i);
  const cancellation = migration.match(
    /create or replace function public\.finalize_payment_cancellation_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  assert.match(cancellation, /v_claim_canceled_before[\s\S]+v_claim_cancel_amount/i);
  assert.match(cancellation, /p_expected_canceled_total <> v_claim_canceled_before \+ v_claim_cancel_amount/i);
  assert.doesNotMatch(cancellation, /p_cancel_amount > greatest\(0,[\s\S]+v_payment\.canceled_amount/i);
});

test("late provider responses cannot downgrade settled or canceled payment state", () => {
  const confirmation = migration.match(
    /create or replace function public\.finalize_payment_confirmation_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  const webhook = migration.match(
    /create or replace function public\.apply_payment_webhook_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  assert.match(confirmation, /v_payment\.status = 'done'[\s\S]+upper\(p_provider_status\) = 'WAITING_FOR_DEPOSIT'[\s\S]+v_target_payment := 'done'/i);
  assert.match(webhook, /v_payment\.status = 'done'[\s\S]+v_status in \('READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT'\)[\s\S]+v_target_payment := 'done'/i);
  assert.match(webhook, /v_payment\.status = 'partial_canceled'[\s\S]+v_status in \('READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'DONE'\)[\s\S]+v_target_payment := 'partial_canceled'/i);
  assert.match(webhook, /v_payment\.status = 'canceled'[\s\S]+v_target_payment := 'canceled'/i);
});

test("confirmation and webhook keep fulfillment blocked during an active cancellation", () => {
  const confirmation = migration.match(
    /create or replace function public\.finalize_payment_confirmation_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  const webhook = migration.match(
    /create or replace function public\.apply_payment_webhook_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";

  for (const body of [confirmation, webhook]) {
    assert.match(body, /operation = 'cancel'[\s\S]+status in \('started', 'in_progress', 'unknown'\)[\s\S]+v_active_cancel/i);
    assert.match(body, /v_active_cancel[\s\S]+v_target_order := 'cancel_requested'/i);
    assert.match(body, /v_active_cancel[\s\S]+next_reconcile_at = case[\s\S]+interval '2 minutes'/i);
  }
  assert.match(webhook, /v_status = 'PARTIAL_CANCELED' and v_blocking_cancel[\s\S]+v_partial_blocking_unresolved[\s\S]+v_target_order := 'cancel_requested'/i);
  assert.match(webhook, /greatest\(v_payment\.canceled_amount, coalesce\(p_canceled_amount, 0\)\)[\s\S]+canceledAmountBefore/i);
  assert.match(confirmation, /if v_target_payment = 'done' then[\s\S]+consume_order_inventory/i);
  assert.match(webhook, /v_status = 'DONE' and v_target_payment = 'done'[\s\S]+consume_order_inventory/i);
});

test("additional cancellation blocks partially canceled orders until a definitive outcome", () => {
  assert.match(migration, /when 'partially_canceled' then p_to in \('cancel_requested'/i);
  const claim = migration.match(
    /create or replace function public\.claim_payment_cancellation_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  const failure = migration.match(
    /create or replace function public\.fail_payment_cancellation_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  assert.match(claim, /v_order\.status in \('paid', 'waiting_for_deposit', 'payment_auth_started', 'partially_canceled'\)[\s\S]+status = 'cancel_requested'/i);
  assert.match(failure, /when 'partial_canceled' then 'partially_canceled'/i);
});

test("cancellation completion supersedes late confirmation results without downgrading refunds", () => {
  const claim = migration.match(
    /create or replace function public\.claim_payment_confirmation_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  const confirmationFailure = migration.match(
    /create or replace function public\.fail_payment_confirmation_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  const cancellation = migration.match(
    /create or replace function public\.finalize_payment_cancellation_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  const webhook = migration.match(
    /create or replace function public\.apply_payment_webhook_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";

  assert.match(claim, /v_order\.status in \('canceled', 'partially_canceled', 'refunded'\)[\s\S]+superseded_by_cancellation[\s\S]+paymentTerminated/i);
  assert.match(claim, /v_order\.status = 'cancel_requested' or exists[\s\S]+cancellationPending/i);
  assert.match(confirmationFailure, /v_attempt\.status in \('succeeded', 'superseded_by_cancellation'\)/i);
  assert.match(confirmationFailure, /v_order\.status in \('canceled', 'partially_canceled', 'refunded'\)[\s\S]+paymentTerminated/i);
  assert.match(confirmationFailure, /v_order\.status = 'cancel_requested' or v_cancel_blocking[\s\S]+payment_result_deferred_during_cancellation/i);
  assert.match(cancellation, /operation = 'confirm'[\s\S]+superseded_by_cancellation/i);
  assert.match(webhook, /v_target_order = 'canceled'[\s\S]+superseded_by_cancellation/i);
});

test("nonterminal confirmation results stay reconciliable and unknown cancellations retry finitely", () => {
  const confirm = readFileSync(
    new URL("../../supabase/functions/payment-confirm/index.ts", import.meta.url),
    "utf8",
  );
  const reconcile = readFileSync(
    new URL("../../supabase/functions/reconcile-payments/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(confirm, /paymentConfirmationDisposition\(normalized\.status\)/i);
  assert.match(confirm, /disposition === "terminal_failure"[\s\S]+p_definitive: definitive/i);
  assert.match(reconcile, /provider\.cancel\([\s\S]+idempotencyKey: attemptKey/i);
  assert.match(reconcile, /MAX_CANCEL_RECONCILE_ATTEMPTS\s*=\s*8/i);
  assert.match(reconcile, /mark_payment_cancellation_review_v1/i);
  assert.match(migration, /add column if not exists reconcile_attempts integer not null default 0/i);
  assert.match(migration, /payment_cancel_manual_review/i);
});

test("deposited virtual-account cancellation uses encrypted one-purpose refund data", () => {
  const cancel = readFileSync(
    new URL("../../supabase/functions/payment-cancel/index.ts", import.meta.url),
    "utf8",
  );
  const payments = readFileSync(
    new URL("../../supabase/functions/_shared/payments.ts", import.meta.url),
    "utf8",
  );
  const reconcile = readFileSync(
    new URL("../../supabase/functions/reconcile-payments/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(migration, /sensitive_request_ciphertext text/i);
  assert.match(migration, /payment_method = 'virtual_account'[\s\S]+status in \('done', 'partial_canceled'\)[\s\S]+refund account is required/i);
  assert.doesNotMatch(migration, /jsonb_build_object\([\s\S]{0,500}(?:accountNumber|holderName)/i);
  assert.match(cancel, /encryptSensitiveJson[\s\S]+p_sensitive_request_ciphertext/i);
  assert.match(payments, /body\.refundReceiveAccount = input\.refundReceiveAccount/i);
  assert.match(reconcile, /decryptSensitiveJson[\s\S]+refundReceiveAccount/i);
  assert.match(reconcile, /paymentMethod === "virtual_account"[\s\S]+authoritative\.status === "DONE"[\s\S]+REFUND_ACCOUNT_REQUIRED_AFTER_DEPOSIT/i);
  assert.match(reconcile, /requiresRefundAccount && !refundReceiveAccount[\s\S]+applyAuthoritativeState\(job, authoritative\)[\s\S]+markCancellationReview\(job, "REFUND_ACCOUNT_REQUIRED_AFTER_DEPOSIT"\)/i);
  assert.match(migration, /sensitive_request_ciphertext = null/i);
  assert.match(migration, /operation = 'cancel' and status = 'manual_review'/i);
  assert.match(migration, /status in \('started', 'in_progress', 'unknown', 'manual_review'\)/i);
});

test("manual-review cancellations remain fulfillment blockers and stale workers are fenced", () => {
  const confirmation = migration.match(
    /create or replace function public\.finalize_payment_confirmation_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  const webhook = migration.match(
    /create or replace function public\.apply_payment_webhook_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  const cancelFailure = migration.match(
    /create or replace function public\.fail_payment_cancellation_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  const manualReview = migration.match(
    /create or replace function public\.mark_payment_cancellation_review_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";

  for (const body of [confirmation, webhook]) {
    assert.match(body, /status in \('started', 'in_progress', 'unknown', 'manual_review'\)[\s\S]+v_blocking_cancel/i);
    assert.match(body, /v_blocking_cancel[\s\S]+v_target_order := 'cancel_requested'/i);
  }
  assert.match(cancelFailure, /select \* into v_attempt[\s\S]+for update[\s\S]+status not in \('started', 'in_progress', 'unknown'\)[\s\S]+stale/i);
  assert.match(cancelFailure, /not v_other_blocking[\s\S]+set status = v_to_status/i);
  assert.match(manualReview, /select \* into v_attempt[\s\S]+for update[\s\S]+not found or v_attempt\.status not in[\s\S]+stale/i);
});

test("security-definer public RPCs are revoked then service-only granted", () => {
  const publicFunctions = [...migration.matchAll(/create or replace function public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
  assert.ok(publicFunctions.length >= 10);
  for (const name of publicFunctions) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(`, "i"), `${name} lacks revoke`);
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]+?to service_role`, "i"), `${name} lacks service grant`);
  }
});

// ---------------------------------------------------------------------------
// Adversarial payment audit regressions (20260828 confirm/webhook race repair)
// ---------------------------------------------------------------------------

const raceRepair = readFileSync(
  new URL("../../supabase/migrations/20260828043000_payment_confirm_webhook_race.sql", import.meta.url),
  "utf8",
);

test("a provider webhook that lands before the browser callback cannot strand the payment", () => {
  const claim = raceRepair.match(
    /create or replace function public\.claim_payment_confirmation_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  assert.ok(claim, "the repair migration must recreate claim_payment_confirmation_v1");

  // A webhook re-queried as IN_PROGRESS moves the order to payment_auth_started before the
  // browser returns. Re-confirming the SAME payment key has to stay possible, because
  // prepare-payment only re-issues for 'payment_ready' and there is no other recovery path.
  assert.match(
    claim,
    /v_order\.status = 'payment_auth_started'\s+and v_payment\.toss_payment_key is not null\s+and v_payment\.toss_payment_key <> p_payment_key then\s+raise exception using errcode = '55P03'/i,
  );
  assert.doesNotMatch(
    claim,
    /if v_order\.status = 'payment_auth_started' then\s+raise exception using errcode = '55P03'/i,
  );
  assert.match(claim, /v_order\.status not in \('payment_ready', 'payment_auth_started'\) then\s+raise exception using errcode = 'P0001'/i);

  // The relaxed guard must not weaken the checks that run before it.
  assert.match(claim, /v_order\.status in \('canceled', 'partially_canceled', 'refunded'\)[\s\S]+paymentTerminated/i);
  assert.match(claim, /v_order\.status = 'cancel_requested' or exists[\s\S]+cancellationPending/i);
  assert.match(claim, /operation = 'confirm'\s+and status in \('started', 'in_progress', 'unknown'\)\s+\) then\s+raise exception using errcode = '55P03'/i);
  assert.match(claim, /reservation_expires_at <= now\(\)[\s\S]+jsonb_build_object\('expired', true\)/i);
});

test("an aborted or expired cancellation returns stock that a confirmation already consumed", () => {
  const webhook = raceRepair.match(
    /create or replace function public\.apply_payment_webhook_v1[\s\S]+?\$\$;/i,
  )?.[0] || "";
  assert.ok(webhook, "the repair migration must recreate apply_payment_webhook_v1");

  assert.match(
    webhook,
    /v_status in \('ABORTED', 'EXPIRED'\)[\s\S]+?release_order_inventory\([\s\S]+?v_target_order = 'canceled',\s+v_status = 'EXPIRED'/i,
  );
  // Fulfilled orders must still never have their stock returned by a provider event.
  assert.match(webhook, /v_order\.status not in \('paid', 'shipping_ready', 'shipped', 'delivered'\)/i);
  assert.match(webhook, /v_status = 'CANCELED' and v_target_order = 'canceled'[\s\S]+?v_order\.status not in \('shipping_ready', 'shipped', 'delivered'\)/i);
});

test("repaired security-definer RPCs stay revoked and service-only", () => {
  const repaired = [...raceRepair.matchAll(/create or replace function public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
  assert.ok(repaired.length >= 2);
  for (const name of repaired) {
    assert.match(raceRepair, new RegExp(`revoke all on function public\\.${name}\\(`, "i"), `${name} lacks revoke`);
    assert.match(raceRepair, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]+?to service_role`, "i"), `${name} lacks service grant`);
  }
});

test("a webhook worker never marks an event owned by another worker as failed", () => {
  const webhookFunction = readFileSync(
    new URL("../../supabase/functions/payment-webhook/index.ts", import.meta.url),
    "utf8",
  );
  // eventId must only be captured after the processing lease is won, otherwise the shared
  // catch block calls mark_payment_webhook_failed_v1 on the owning worker's event.
  assert.match(
    webhookFunction,
    /if \(claim\.processing\) \{[\s\S]+?\}\s+eventId = cleanString\(claim\.eventId, 36\);/,
  );
  assert.doesNotMatch(
    webhookFunction,
    /eventId = cleanString\(claim\.eventId, 36\);[\s\S]{0,400}if \(claim\.processing\)/,
  );
  assert.match(webhookFunction, /if \(eventId\) \{\s+await rpc\("mark_payment_webhook_failed_v1"/);
});

test("the payment return page boots from a path redirect and reads the settled payment status", () => {
  const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const hardening = readFileSync(
    new URL("../../src/frontend/runtime/launch-hardening.mjs", import.meta.url),
    "utf8",
  );
  const router = readFileSync(
    new URL("../../src/frontend/core/router.mjs", import.meta.url),
    "utf8",
  );

  // Both hosts rewrite unknown paths to index.html, so a TOSS_SUCCESS_URL of
  // https://host/payment/success would otherwise resolve ./app.js to /payment/app.js.
  assert.match(indexHtml, /<base href="\/"\s*\/?>/i);
  assert.match(router, /pathname\.endsWith\("\/payment\/success"\)/);

  // order.paymentStatus carries the payment_status enum, whose settled value is 'done'.
  assert.match(hardening, /=== "paid" && String\(order\?\.paymentStatus \|\| ""\) === "done"/);
  assert.doesNotMatch(hardening, /paymentStatus \|\| ""\) === "paid"/);
});

const rateLimitRepair = readFileSync(
  new URL("../../supabase/migrations/20260911000000_edge_rate_limit_insert_race.sql", import.meta.url),
  "utf8",
);

test("creating a rate-limit bucket survives a concurrent first request", () => {
  // `select ... for update` cannot lock a row that does not exist yet, so two
  // simultaneous first requests for one bucket both reach the insert. Without
  // conflict handling the loser raises 23505, which the Edge layer maps to HTTP 409
  // and the caller is rejected before CAPTCHA despite the bucket having quota.
  assert.match(rateLimitRepair, /create or replace function public\.consume_edge_rate_limit_v1/i);
  assert.match(rateLimitRepair, /on conflict \(scope, key_hash\) do update/i);
  assert.match(rateLimitRepair, /set hit_count = r\.hit_count \+ 1/i);

  // Losing the race must still count the hit and still be able to block, otherwise
  // the race would silently hand out a free request.
  assert.match(rateLimitRepair, /when r\.hit_count \+ 1 > p_limit then v_now \+ make_interval/i);
  assert.match(rateLimitRepair, /if v_row\.hit_count > p_limit then[\s\S]{0,200}v_allowed := false/i);

  // The original argument validation must survive the replacement.
  assert.match(rateLimitRepair, /errcode = '22023'/);
  assert.match(rateLimitRepair, /security definer/i);
  assert.match(rateLimitRepair, /set search_path = ''/);
});

test("the guest token rotation gate agrees across the Edge Function and the RPC", () => {
  // The Edge gate is advisory; rotate_guest_lookup_token_after_payment_v2 is the
  // authority. Widening only the TypeScript side is a silent no-op, which is exactly
  // how the first attempt at this fix shipped. Compare the two lists directly.
  const edgeSource = readFileSync(
    new URL("../../supabase/functions/payment-confirm/index.ts", import.meta.url),
    "utf8",
  );
  const rotationSql = readFileSync(
    new URL("../../supabase/migrations/20260911001000_guest_token_rotation_settled_states.sql", import.meta.url),
    "utf8",
  );

  const edgeBlock = edgeSource.match(/const SETTLED_ORDER_STATUSES = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(edgeBlock, "payment-confirm must declare SETTLED_ORDER_STATUSES.");
  const edgeStatuses = [...edgeBlock[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]).sort();

  const sqlBlock = rotationSql.match(/v_order\.status not in \(([^)]*)\)/);
  assert.ok(sqlBlock, "The rotation RPC must gate on an order status list.");
  const sqlStatuses = [...sqlBlock[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();

  assert.deepEqual(
    sqlStatuses,
    edgeStatuses,
    "The RPC status list and SETTLED_ORDER_STATUSES must match, or one layer silently overrides the other.",
  );
  assert.ok(edgeStatuses.includes("shipped"), "Fulfilment states must be rotatable.");
  for (const terminal of ["canceled", "partially_canceled", "refunded"]) {
    assert.ok(!sqlStatuses.includes(terminal), `${terminal} must not be rotatable.`);
  }
});

test("cancellation authorization cannot evaluate to NULL for a guest order", () => {
  // PL/pgSQL `if not NULL then` does not take its branch, so an authorization
  // expression that yields NULL fails open. A guest order has profile_id NULL, which
  // is exactly how `v_order.profile_id = p_actor_user_id` produced NULL for an
  // unrelated signed-in member and let them cancel someone else's order.
  //
  // Limitation: this reads SQL text. Without a live PostgreSQL the three-valued
  // evaluation itself is not executed here; a concurrent/DB-level test is still owed.
  const cancelRepair = readFileSync(
    new URL("../../supabase/migrations/20260911002000_payment_cancel_null_authorization.sql", import.meta.url),
    "utf8",
  );

  assert.match(cancelRepair, /create or replace function public\.claim_payment_cancellation_v1/i);

  const assignment = cancelRepair.match(/v_allowed := ([\s\S]*?);\s*\n\s*if not/);
  assert.ok(assignment, "The authorization assignment must be present.");
  const expression = assignment[1];

  // The member branch must not compare a possibly-NULL profile_id bare.
  assert.match(
    expression,
    /v_order\.profile_id is not null\s*\n?\s*and v_order\.profile_id = p_actor_user_id/i,
    "The member branch must establish profile_id is not null before comparing it.",
  );
  // And the whole expression must collapse to a definite boolean.
  assert.match(expression, /^\s*coalesce\(/i, "The authorization expression must be wrapped in coalesce.");
  assert.match(expression, /,\s*false\)\s*$/i, "The coalesce fallback must be false, never true.");

  // The test itself must be definite too.
  assert.match(cancelRepair, /if not coalesce\(v_allowed, false\) then/i);
  assert.match(cancelRepair, /errcode = '42501'/, "The deny path must still raise 42501.");

  // The exact vulnerable shape must not reappear.
  assert.doesNotMatch(
    cancelRepair,
    /v_allowed := \(\s*\n\s*p_actor_user_id is not null and v_order\.profile_id = p_actor_user_id/i,
    "The original NULL-producing assignment must not return.",
  );
});

test("a confirmation finalizing after fulfilment advanced reports success, not failure", () => {
  // The payment is already authoritative at that point. Targeting 'paid' from
  // shipping_ready is a backwards transition, which raised P0001 -> 422 and made the
  // browser discard the confirmation tuple for a payment that had succeeded.
  const finalizeRepair = readFileSync(
    new URL("../../supabase/migrations/20260911003000_finalize_confirmation_after_fulfilment.sql", import.meta.url),
    "utf8",
  );

  assert.match(finalizeRepair, /create or replace function public\.finalize_payment_confirmation_v1/i);

  const guard = finalizeRepair.match(
    /if v_payment\.status in \('done', 'partial_canceled'\) and upper\(p_provider_status\) = 'DONE'[\s\S]{0,420}?end if;/i,
  );
  assert.ok(guard, "The already-done DONE guard must be present.");
  assert.match(guard[0], /v_order\.status in \('shipping_ready', 'shipped', 'delivered'\)/i);
  assert.match(guard[0], /not v_blocking_cancel/i, "An unresolved cancellation must still win.");
  assert.match(guard[0], /v_target_order := v_order\.status;/i, "Fulfilment state must be preserved, not rewritten.");

  // The duplicate short-circuit is what turns the preserved state into a success
  // response, so it must still be reachable.
  assert.match(finalizeRepair, /if v_order\.status = v_target_order and v_payment\.status = v_target_payment then/i);
  assert.match(finalizeRepair, /'duplicate', true/);

  // The pre-existing stale-WAITING_FOR_DEPOSIT protection must survive the replacement.
  assert.match(finalizeRepair, /if v_payment\.status = 'done' and upper\(p_provider_status\) = 'WAITING_FOR_DEPOSIT' then/i);
  assert.match(finalizeRepair, /errcode = 'P0001'/, "Genuinely invalid transitions must still raise.");
});

test("a partially cancelled order shipped before confirmation keeps its ledger", () => {
  // An administrator can partially cancel and then ship between the provider's DONE
  // and this finalizer. Rewriting payments.status back to 'done' would erase the
  // partial cancellation, and targeting 'paid' would raise P0001 as before.
  const finalizeRepair = readFileSync(
    new URL("../../supabase/migrations/20260911003000_finalize_confirmation_after_fulfilment.sql", import.meta.url),
    "utf8",
  );
  const guard = finalizeRepair.match(
    /if v_payment\.status in \('done', 'partial_canceled'\)[\s\S]{0,420}?end if;/i,
  );
  assert.ok(guard, "The already-settled guard must accept a partially cancelled ledger.");
  assert.match(guard[0], /v_target_payment := v_payment\.status;/i, "The existing ledger must be preserved, not rewritten.");
  assert.match(guard[0], /not v_blocking_cancel/i);
});
