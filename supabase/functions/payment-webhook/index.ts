import {
  HttpError,
  cleanString,
  safeIsoDate,
  sha256Hex,
  stableStringify,
} from "../_shared/core.ts";
import { jsonResponse, publicErrorResponse, readJson, safeLog } from "../_shared/http.ts";
import { normalizedProviderResult, paymentProvider } from "../_shared/payments.ts";
import { enforceRateLimit } from "../_shared/security.ts";
import { rpc } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  let eventId = "";
  if (req.method !== "POST") return jsonResponse(req, { message: "Method not allowed" }, 405);
  try {
    const body = await readJson(req, 256 * 1024);
    const eventType = cleanString(body.eventType || (body.transactionKey ? "DEPOSIT_CALLBACK" : ""), 100).toUpperCase();
    if (!new Set(["PAYMENT_STATUS_CHANGED", "DEPOSIT_CALLBACK", "CANCEL_STATUS_CHANGED"]).has(eventType)) {
      throw new HttpError(400, "UNSUPPORTED_WEBHOOK", "Unsupported webhook event");
    }

    const embedded = body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? body.data as Record<string, unknown>
      : body;
    let orderNo = cleanString(embedded.orderId || body.orderId, 64).toUpperCase();
    let paymentKey = cleanString(embedded.paymentKey, 200);

    const envelopeRateSubject = eventType === "DEPOSIT_CALLBACK" ? orderNo : paymentKey;
    if (!envelopeRateSubject) {
      throw new HttpError(400, "INVALID_WEBHOOK", "Webhook payment identity is missing");
    }
    // Bound unauthenticated traffic before either the deposit-secret lookup or
    // the more expensive authoritative provider re-query.
    await enforceRateLimit(req, "payment_webhook", envelopeRateSubject, 180, 60, 300);

    if (eventType === "DEPOSIT_CALLBACK") {
      const secret = cleanString(body.secret, 500);
      if (!orderNo || !secret) throw new HttpError(403, "WEBHOOK_VERIFICATION_FAILED", "Webhook verification failed");
      const verification = await rpc<{ valid?: boolean; paymentKey?: string; amount?: number } | null>("verify_payment_webhook_secret_v1", {
        p_order_no: orderNo,
        p_secret_hash: await sha256Hex(secret),
      });
      if (!verification?.valid || !verification.paymentKey) {
        throw new HttpError(403, "WEBHOOK_VERIFICATION_FAILED", "Webhook verification failed");
      }
      paymentKey = verification.paymentKey;
    }
    if (!paymentKey) throw new HttpError(400, "INVALID_WEBHOOK", "Webhook payment key is missing");

    // General payment webhooks do not carry a payment HMAC signature. Re-query Toss
    // with the server secret and use that authoritative object.
    const provider = paymentProvider();
    if (provider.name === "toss_payments"
        && !Deno.env.get("TOSS_SECRET_KEY")
        && !Deno.env.get("TOSS_PAYMENTS_SECRET_KEY")) {
      throw new HttpError(503, "TOSS_WEBHOOK_CONFIG_MISSING", "Webhook verification is unavailable");
    }
    const authoritative = provider.name === "mock"
      ? normalizedProviderResult({
          ...embedded,
          paymentKey,
          orderId: orderNo,
          totalAmount: embedded.totalAmount ?? embedded.amount ?? body.amount,
        })
      : normalizedProviderResult(await provider.get(paymentKey));
    orderNo = authoritative.orderId || orderNo;
    if (!orderNo || authoritative.paymentKey !== paymentKey || !Number.isSafeInteger(authoritative.amount) || authoritative.amount < 1) {
      throw new HttpError(403, "WEBHOOK_VERIFICATION_FAILED", "Webhook verification failed");
    }
    if (!new Set(["READY", "IN_PROGRESS", "WAITING_FOR_DEPOSIT", "DONE", "CANCELED", "PARTIAL_CANCELED", "ABORTED", "EXPIRED"]).has(authoritative.status)) {
      throw new HttpError(422, "UNSUPPORTED_PAYMENT_STATUS", "Unsupported payment status");
    }
    const secretHash = authoritative.secret ? await sha256Hex(authoritative.secret) : null;
    const transmissionId = cleanString(req.headers.get("tosspayments-webhook-transmission-id"), 240);
    const dedupeKey = transmissionId
      ? `${eventType}:${transmissionId}`
      : `${eventType}:${await sha256Hex(stableStringify({ orderNo, paymentKey, status: authoritative.status, body }))}`;
    const claim = await rpc<{ eventId?: string; processed?: boolean; processing?: boolean }>("claim_payment_webhook_v1", {
      p_order_no: orderNo,
      p_event_type: eventType,
      p_dedupe_key: dedupeKey,
      p_safe_payload: authoritative.safePayload,
    });
    eventId = cleanString(claim.eventId, 36);
    if (claim.processed) return jsonResponse(req, { received: true, duplicate: true });
    // A 2xx while another worker owns the lease would tell Toss to stop retrying. Return a
    // retryable status so a crashed worker can be reclaimed after the database lease expires.
    if (claim.processing) {
      throw new HttpError(503, "WEBHOOK_PROCESSING", "Webhook processing is already in progress", 60);
    }
    if (!eventId) throw new HttpError(500, "WEBHOOK_CLAIM_FAILED", "Webhook could not be claimed");

    const order = await rpc<Record<string, unknown>>("apply_payment_webhook_v1", {
      p_event_id: eventId,
      p_order_no: orderNo,
      p_payment_key: paymentKey,
      p_amount: authoritative.amount,
      p_canceled_amount: authoritative.canceledAmount,
      p_provider_status: authoritative.status,
      p_transaction_id: authoritative.transactionId || null,
      p_approval_no: authoritative.approvalNo || null,
      p_approved_at: safeIsoDate(authoritative.approvedAt),
      p_virtual_due_at: safeIsoDate(authoritative.virtualDueAt),
      p_webhook_secret_hash: secretHash,
      p_safe_payload: authoritative.safePayload,
    });
    return jsonResponse(req, { received: true, duplicate: false, status: order.paymentStatus });
  } catch (error) {
    if (eventId) {
      await rpc("mark_payment_webhook_failed_v1", {
        p_event_id: eventId,
        p_error_code: error instanceof HttpError ? error.code : "WEBHOOK_PROCESSING_FAILED",
      }).catch(() => undefined);
    }
    if (!(error instanceof HttpError)) safeLog("payment-webhook", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "Webhook processing failed");
  }
});
