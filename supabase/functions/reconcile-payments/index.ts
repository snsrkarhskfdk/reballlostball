import {
  HttpError,
  ProviderError,
  cleanString,
  constantTimeEqual,
  decryptSensitiveJson,
  safeIsoDate,
  sha256Hex,
  stableStringify,
} from "../_shared/core.ts";
import { jsonResponse, publicErrorResponse, readJson, safeLog } from "../_shared/http.ts";
import {
  normalizedProviderResult,
  normalizeRefundReceiveAccount,
  paymentProvider,
} from "../_shared/payments.ts";
import { rpc } from "../_shared/supabase.ts";

type ReconcileJob = {
  paymentId?: string;
  leaseToken?: string;
  orderNo?: string;
  paymentKey?: string;
  amount?: number;
  orderStatus?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  hasActiveCancel?: boolean;
  cancelAttemptKey?: string;
  cancelReason?: string;
  cancelSensitiveCiphertext?: string;
  cancelAmount?: number;
  canceledAmountBefore?: number;
  cancelReconcileAttempts?: number;
  paymentReconcileAttempts?: number;
};

type NormalizedProviderPayment = ReturnType<typeof normalizedProviderResult>;
type AppliedProviderState = "applied" | "processed" | "busy";

const MAX_CANCEL_RECONCILE_ATTEMPTS = 8;
const MAX_PAYMENT_RECONCILE_ATTEMPTS = 12;

async function finish(job: ReconcileJob, nextSeconds: number, errorCode: string | null = null): Promise<void> {
  await rpc("complete_payment_reconciliation_v1", {
    p_payment_id: job.paymentId,
    p_lease_token: job.leaseToken,
    p_next_seconds: nextSeconds,
    p_error_code: errorCode,
  });
}

function cancelBackoffSeconds(attempts: number): number {
  return Math.min(1800, 60 * (2 ** Math.max(0, Math.min(5, attempts - 1))));
}

async function markCancellationReview(job: ReconcileJob, errorCode: string): Promise<void> {
  await rpc("mark_payment_cancellation_review_v1", {
    p_payment_id: job.paymentId,
    p_lease_token: job.leaseToken,
    p_idempotency_key: job.cancelAttemptKey,
    p_error_code: errorCode,
  });
}

async function markConfirmationReview(job: ReconcileJob, errorCode: string): Promise<void> {
  await rpc("mark_payment_confirmation_review_v1", {
    p_payment_id: job.paymentId,
    p_lease_token: job.leaseToken,
    p_error_code: errorCode,
  });
}

async function applyAuthoritativeState(
  job: ReconcileJob,
  authoritative: NormalizedProviderPayment,
): Promise<AppliedProviderState> {
  const orderNo = cleanString(job.orderNo, 64).toUpperCase();
  const paymentKey = cleanString(job.paymentKey, 200);
  const fingerprint = await sha256Hex(stableStringify({
    paymentKey,
    status: authoritative.status,
    amount: authoritative.amount,
    canceledAmount: authoritative.canceledAmount,
    transactionId: authoritative.transactionId,
    approvedAt: authoritative.approvedAt,
    virtualDueAt: authoritative.virtualDueAt,
    orderStatus: cleanString(job.orderStatus, 40),
    paymentStatus: cleanString(job.paymentStatus, 40),
    hasActiveCancel: Boolean(job.hasActiveCancel),
  }));
  const claim = await rpc<{ eventId?: string; processed?: boolean; processing?: boolean }>("claim_payment_webhook_v1", {
    p_order_no: orderNo,
    p_event_type: "PAYMENT_STATUS_RECONCILE",
    p_dedupe_key: `reconcile:${fingerprint}`,
    p_safe_payload: authoritative.safePayload,
  });
  if (claim.processing) return "busy";
  if (claim.processed) return "processed";
  const eventId = cleanString(claim.eventId, 36);
  if (!eventId) throw new HttpError(500, "RECONCILE_EVENT_CLAIM_FAILED", "Reconciliation event claim failed");
  await rpc("apply_payment_webhook_v1", {
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
    p_webhook_secret_hash: authoritative.secret ? await sha256Hex(authoritative.secret) : null,
    p_safe_payload: authoritative.safePayload,
  });
  return "applied";
}

function assertSchedulerSecret(req: Request): void {
  const expected = Deno.env.get("PAYMENT_RECONCILE_SECRET") || "";
  const supplied = req.headers.get("x-reball-reconcile-secret") || "";
  if (expected.length < 32) throw new HttpError(503, "RECONCILE_NOT_CONFIGURED", "Payment reconciliation is not configured");
  if (!constantTimeEqual(expected, supplied)) throw new HttpError(403, "RECONCILE_DENIED", "Payment reconciliation access denied");
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "POST required");
    assertSchedulerSecret(req);
    const body = await readJson(req, 4 * 1024);
    const requestedLimit = Number(body.limit ?? 10);
    const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(25, requestedLimit)) : 10;
    // Fail before acquiring any database lease when provider credentials are invalid.
    const provider = paymentProvider();
    const jobs = await rpc<ReconcileJob[]>("claim_payment_reconciliation_v1", {
      p_limit: limit,
      p_lease_seconds: 300,
    });
    let reconciled = 0;
    let deferred = 0;
    let failed = 0;

    for (const job of Array.isArray(jobs) ? jobs : []) {
      const orderNo = cleanString(job.orderNo, 64).toUpperCase();
      const paymentKey = cleanString(job.paymentKey, 200);
      const amount = Number(job.amount);
      try {
        if (!job.paymentId || !job.leaseToken || !orderNo || paymentKey.length < 6
            || !Number.isSafeInteger(amount) || amount < 1) {
          throw new HttpError(422, "INVALID_RECONCILE_JOB", "Invalid reconciliation job");
        }
        let authoritative = normalizedProviderResult(await provider.get(paymentKey));
        if (authoritative.paymentKey !== paymentKey || authoritative.orderId !== orderNo
            || authoritative.amount !== amount) {
          throw new HttpError(409, "RECONCILE_PROVIDER_MISMATCH", "Provider reconciliation mismatch");
        }

        const cancelAttempts = Number(job.cancelReconcileAttempts) || 0;
        const paymentAttempts = (Number(job.paymentReconcileAttempts) || 0) + 1;
        if (new Set(["READY", "IN_PROGRESS"]).has(authoritative.status)) {
          if (job.hasActiveCancel && cancelAttempts >= MAX_CANCEL_RECONCILE_ATTEMPTS) {
            await markCancellationReview(job, "CANCELLATION_PROVIDER_NOT_SETTLED");
          } else if (!job.hasActiveCancel && paymentAttempts >= MAX_PAYMENT_RECONCILE_ATTEMPTS) {
            await markConfirmationReview(job, "PAYMENT_PROVIDER_NOT_SETTLED");
          } else {
            await finish(job, 120);
          }
          deferred += 1;
          continue;
        }
        if (job.hasActiveCancel && new Set(["DONE", "WAITING_FOR_DEPOSIT"]).has(authoritative.status)) {
          const attemptKey = cleanString(job.cancelAttemptKey, 300);
          const cancelReason = cleanString(job.cancelReason, 200);
          const cancelAmount = Number(job.cancelAmount);
          const canceledAmountBefore = Number(job.canceledAmountBefore) || 0;
          const sensitiveCiphertext = cleanString(job.cancelSensitiveCiphertext, 4096);
          const requiresRefundAccount = job.paymentMethod === "virtual_account"
            && authoritative.status === "DONE";
          let refundReceiveAccount: ReturnType<typeof normalizeRefundReceiveAccount> = null;
          if (sensitiveCiphertext) {
            const decrypted = await decryptSensitiveJson(
              Deno.env.get("PAYMENT_REFUND_DATA_KEY") || "",
              sensitiveCiphertext,
            );
            refundReceiveAccount = normalizeRefundReceiveAccount(decrypted);
          }
          if (requiresRefundAccount && !refundReceiveAccount) {
            const applied = await applyAuthoritativeState(job, authoritative);
            if (applied === "busy") {
              await finish(job, 60, "WEBHOOK_EVENT_BUSY");
              deferred += 1;
              continue;
            }
            await markCancellationReview(job, "REFUND_ACCOUNT_REQUIRED_AFTER_DEPOSIT");
            deferred += 1;
            continue;
          }
          if (attemptKey.length < 16 || cancelReason.length < 2
              || !Number.isSafeInteger(cancelAmount) || cancelAmount < 1
              || !Number.isSafeInteger(canceledAmountBefore) || canceledAmountBefore < 0) {
            await markCancellationReview(job, "INVALID_CANCELLATION_RETRY_STATE");
            deferred += 1;
            continue;
          }
          try {
            const retried = normalizedProviderResult(await provider.cancel({
              paymentKey,
              orderId: orderNo,
              amount,
              cancelReason,
              cancelAmount,
              idempotencyKey: attemptKey,
              refundReceiveAccount: refundReceiveAccount || undefined,
            }));
            if (retried.paymentKey !== paymentKey || retried.orderId !== orderNo || retried.amount !== amount) {
              throw new HttpError(409, "CANCEL_RETRY_PROVIDER_MISMATCH", "Provider cancellation retry mismatch");
            }
            if (retried.status === "CANCELED") {
              await rpc("finalize_payment_cancellation_v1", {
                p_order_no: orderNo,
                p_idempotency_key: attemptKey,
                p_cancel_amount: cancelAmount,
                p_expected_canceled_total: canceledAmountBefore + cancelAmount,
                p_reason: cancelReason,
                p_safe_payload: retried.safePayload,
              });
              reconciled += 1;
              continue;
            }
            authoritative = retried;
          } catch (error) {
            const code = error instanceof ProviderError ? error.code : error instanceof HttpError ? error.code : "CANCEL_RETRY_UNKNOWN";
            if (error instanceof ProviderError && error.definitive) {
              await rpc("fail_payment_cancellation_v1", {
                p_order_no: orderNo,
                p_idempotency_key: attemptKey,
                p_error_code: code,
                p_safe_error: "결제 취소가 거절되었습니다.",
                p_definitive: true,
              });
              reconciled += 1;
              continue;
            }
            if (cancelAttempts >= MAX_CANCEL_RECONCILE_ATTEMPTS) {
              await markCancellationReview(job, code);
            } else {
              await finish(job, cancelBackoffSeconds(cancelAttempts), code);
            }
            deferred += 1;
            continue;
          }
          if (new Set(["READY", "IN_PROGRESS", "DONE", "WAITING_FOR_DEPOSIT"]).has(authoritative.status)) {
            if (cancelAttempts >= MAX_CANCEL_RECONCILE_ATTEMPTS) {
              await markCancellationReview(job, "CANCELLATION_NOT_FINAL");
            } else {
              await finish(job, cancelBackoffSeconds(cancelAttempts), "CANCELLATION_NOT_FINAL");
            }
            deferred += 1;
            continue;
          }
        }

        const applied = await applyAuthoritativeState(job, authoritative);
        if (applied === "busy") {
          await finish(job, 60, "WEBHOOK_EVENT_BUSY");
          deferred += 1;
          continue;
        }
        if (applied === "processed") {
          const nextSeconds = authoritative.status === "WAITING_FOR_DEPOSIT"
            ? 900
            : job.hasActiveCancel && authoritative.status === "PARTIAL_CANCELED" ? 120 : 0;
          await finish(job, nextSeconds).catch(() => undefined);
        }
        reconciled += 1;
      } catch (error) {
        failed += 1;
        const code = error instanceof HttpError || error instanceof ProviderError
          ? error.code
          : "RECONCILE_PROVIDER_ERROR";
        const cancelAttempts = Number(job.cancelReconcileAttempts) || 0;
        const paymentAttempts = (Number(job.paymentReconcileAttempts) || 0) + 1;
        if (job.hasActiveCancel && cancelAttempts >= MAX_CANCEL_RECONCILE_ATTEMPTS) {
          await markCancellationReview(job, code).catch(() => undefined);
        } else if (!job.hasActiveCancel && paymentAttempts >= MAX_PAYMENT_RECONCILE_ATTEMPTS) {
          await markConfirmationReview(job, code).catch(() => undefined);
        } else {
          await finish(job, job.hasActiveCancel ? cancelBackoffSeconds(cancelAttempts) : 300, code).catch(() => undefined);
        }
      }
    }

    return jsonResponse(req, { claimed: Array.isArray(jobs) ? jobs.length : 0, reconciled, deferred, failed });
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("reconcile-payments", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "Payment reconciliation failed");
  }
});
