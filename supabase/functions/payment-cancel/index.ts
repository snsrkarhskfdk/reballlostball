import {
  HttpError,
  ProviderError,
  cleanString,
  encryptSensitiveJson,
  hmacSha256Hex,
  sha256Hex,
  stableStringify,
} from "../_shared/core.ts";
import {
  assertAllowedOrigin,
  jsonResponse,
  optionsResponse,
  publicErrorResponse,
  readJson,
  safeLog,
} from "../_shared/http.ts";
import {
  normalizedProviderResult,
  normalizeRefundReceiveAccount,
  paymentProvider,
} from "../_shared/payments.ts";
import { enforceRateLimit } from "../_shared/security.ts";
import { rpc, sessionUser } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try { return optionsResponse(req); } catch (error) { return publicErrorResponse(req, error); }
  }
  let orderNo = "";
  let attemptKey = "";
  try {
    assertAllowedOrigin(req);
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");
    const body = await readJson(req, 24 * 1024);
    const user = await sessionUser(req);
    if (req.headers.has("authorization") && !user) throw new HttpError(401, "AUTH_REQUIRED", "로그인 상태를 확인해 주세요.");
    orderNo = cleanString(body.orderNo ?? body.orderId, 64).toUpperCase();
    const reason = cleanString(body.reason, 200);
    const requestId = cleanString(req.headers.get("idempotency-key") || body.idempotencyKey, 128);
    const guestToken = cleanString(body.guestLookupToken, 200);
    const refundReceiveAccount = normalizeRefundReceiveAccount(body.refundReceiveAccount);
    const refundDataKey = Deno.env.get("PAYMENT_REFUND_DATA_KEY") || "";
    const refundAccountFingerprint = refundReceiveAccount
      ? await hmacSha256Hex(refundDataKey, stableStringify(refundReceiveAccount))
      : null;
    const sensitiveRequestCiphertext = refundReceiveAccount
      ? await encryptSensitiveJson(refundDataKey, refundReceiveAccount)
      : null;
    const guestTokenHash = guestToken ? await sha256Hex(guestToken) : null;
    if (!/^[A-Z0-9_-]{6,64}$/.test(orderNo) || reason.length < 2 || !/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) {
      throw new HttpError(400, "INVALID_CANCELLATION", "취소 요청 정보를 확인해 주세요.");
    }
    if (!user && !guestTokenHash) throw new HttpError(403, "ORDER_ACCESS_DENIED", "주문을 확인할 수 없습니다.");
    await enforceRateLimit(req, "payment_cancel", `${user?.id || guestTokenHash}:${orderNo}`, 8, 900, 900);

    attemptKey = `cancel_${await sha256Hex(`${orderNo}:${requestId}`)}`;
    const requestHash = await sha256Hex(stableStringify({ orderNo, reason, refundAccountFingerprint }));
    const claim = await rpc<Record<string, unknown>>("claim_payment_cancellation_v1", {
      p_order_no: orderNo,
      p_actor_user_id: user?.id || null,
      p_guest_token_hash: guestTokenHash,
      p_idempotency_key: attemptKey,
      p_request_hash: requestHash,
      p_reason: reason,
      p_sensitive_request_ciphertext: sensitiveRequestCiphertext,
    });
    if (new Set(["succeeded", "partially_succeeded"]).has(String(claim.attemptStatus)) || claim.status === "canceled") {
      return jsonResponse(req, {
        order: claim,
        duplicate: true,
        partial: claim.attemptStatus === "partially_succeeded",
        retryRequiresNewKey: claim.attemptStatus === "partially_succeeded",
      });
    }
    const cancelAmount = Number(claim.cancelAmount) || 0;
    const canceledAmountBefore = Number(claim.canceledAmountBefore) || 0;
    const requiresRefundAccount = claim.paymentMethod === "virtual_account"
      && new Set(["done", "partial_canceled"]).has(String(claim.paymentStatus));
    if (requiresRefundAccount && !refundReceiveAccount) {
      throw new HttpError(400, "REFUND_ACCOUNT_REQUIRED", "입금 완료된 가상계좌 결제는 환불 계좌가 필요합니다.");
    }
    let safePayload: Record<string, unknown> = {};
    if (claim.localOnly !== true) {
      const paymentKey = cleanString(claim.paymentKey, 200);
      if (!paymentKey || cancelAmount < 1) throw new HttpError(409, "PAYMENT_NOT_CANCELABLE", "결제를 취소할 수 없습니다.");
      try {
        const result = await paymentProvider().cancel({
          paymentKey,
          cancelReason: reason,
          cancelAmount,
          idempotencyKey: attemptKey,
          scenario: cleanString(body.mockScenario, 40),
          refundReceiveAccount: refundReceiveAccount || undefined,
        });
        const normalized = normalizedProviderResult(result);
        if (normalized.status !== "CANCELED"
            || normalized.canceledAmount < canceledAmountBefore + cancelAmount) {
          // This endpoint requests the entire remaining balance. A partial provider result
          // must be reconciled by the authoritative webhook instead of being booked as full.
          throw new ProviderError(409, "CANCEL_NOT_FULL", "Cancellation did not finish in full", false, result);
        }
        safePayload = normalized.safePayload;
      } catch (error) {
        if (error instanceof ProviderError) {
          await rpc("fail_payment_cancellation_v1", {
            p_order_no: orderNo,
            p_idempotency_key: attemptKey,
            p_error_code: error.code,
            p_safe_error: error.definitive ? "결제 취소가 거절되었습니다." : "결제 취소 결과를 확인 중입니다.",
            p_definitive: error.definitive,
          });
          throw new HttpError(error.definitive ? 409 : 502,
            error.definitive ? "CANCELLATION_REJECTED" : "CANCELLATION_RESULT_UNKNOWN",
            error.definitive ? "결제 취소가 거절되었습니다." : "결제 취소 결과를 확인 중입니다.");
        }
        throw error;
      }
    }

    const order = await rpc<Record<string, unknown>>("finalize_payment_cancellation_v1", {
      p_order_no: orderNo,
      p_idempotency_key: attemptKey,
      p_cancel_amount: cancelAmount,
      p_expected_canceled_total: canceledAmountBefore + cancelAmount,
      p_reason: reason,
      p_safe_payload: safePayload,
    });
    return jsonResponse(req, { order, canceled: true });
  } catch (error) {
    if (!(error instanceof HttpError || error instanceof ProviderError)) safeLog("payment-cancel", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "결제 취소 요청을 처리하지 못했습니다.");
  }
});
