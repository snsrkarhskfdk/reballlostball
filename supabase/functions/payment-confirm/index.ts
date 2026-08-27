import {
  HttpError,
  ProviderError,
  cleanString,
  normalizePaymentMethod,
  safeIsoDate,
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
  paymentConfirmationDisposition,
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
    const body = await readJson(req, 32 * 1024);
    const user = await sessionUser(req);
    if (req.headers.has("authorization") && !user) throw new HttpError(401, "AUTH_REQUIRED", "로그인 상태를 확인해 주세요.");

    orderNo = cleanString(body.orderId ?? body.orderNo, 64).toUpperCase();
    const paymentKey = cleanString(body.paymentKey, 200);
    const amount = Number(body.amount);
    const guestToken = cleanString(body.guestLookupToken, 200);
    const guestTokenHash = guestToken ? await sha256Hex(guestToken) : null;
    if (!/^[A-Z0-9_-]{6,64}$/.test(orderNo) || paymentKey.length < 6
        || !Number.isSafeInteger(amount) || amount < 1) {
      throw new HttpError(400, "INVALID_PAYMENT_CONFIRMATION", "결제 승인 정보를 확인해 주세요.");
    }
    if (!user && !guestTokenHash) throw new HttpError(403, "ORDER_ACCESS_DENIED", "주문을 확인할 수 없습니다.");
    await enforceRateLimit(req, "payment_confirm", `${user?.id || guestTokenHash}:${orderNo}`, 12, 900, 900);
    // Validate provider credentials before the database claim mutates an attempt.
    const provider = paymentProvider();

    const paymentKeyHash = await sha256Hex(paymentKey);
    attemptKey = `confirm_${await sha256Hex(`${orderNo}:${paymentKeyHash}`)}`;
    const requestHash = await sha256Hex(stableStringify({ orderNo, paymentKeyHash, amount }));
    const claim = await rpc<Record<string, unknown>>("claim_payment_confirmation_v1", {
      p_order_no: orderNo,
      p_actor_user_id: user?.id || null,
      p_guest_token_hash: guestTokenHash,
      p_payment_key: paymentKey,
      p_amount: amount,
      p_idempotency_key: attemptKey,
      p_request_hash: requestHash,
    });
    if (claim.expired === true) throw new HttpError(409, "ORDER_EXPIRED", "주문의 결제 가능 시간이 만료되었습니다.");
    if (claim.paymentTerminated === true) {
      throw new HttpError(409, "ORDER_PAYMENT_TERMINATED", "이미 취소 또는 환불된 주문입니다.");
    }
    if (claim.cancellationPending === true) {
      throw new HttpError(409, "ORDER_CANCELLATION_PENDING", "취소 처리 중인 주문입니다.");
    }
    if (claim.alreadyFinalized === true || claim.attemptStatus === "succeeded") {
      const paymentStatus = String(claim.paymentStatus || "");
      return jsonResponse(req, {
        order: claim,
        duplicate: true,
        paid: paymentStatus === "done",
        waitingForDeposit: paymentStatus === "waiting_for_deposit",
      });
    }
    if (claim.attemptStatus === "failed") {
      throw new HttpError(409, "PAYMENT_RETRY_REQUIRES_NEW_ORDER", "실패한 주문은 재고를 다시 확인한 뒤 새 주문으로 결제해 주세요.");
    }

    const expectedAmount = Number(claim.totalKrw);
    if (!Number.isSafeInteger(expectedAmount) || expectedAmount !== amount) {
      throw new HttpError(409, "PAYMENT_AMOUNT_MISMATCH", "결제 금액이 주문과 일치하지 않습니다.");
    }

    let payment;
    try {
      payment = await provider.confirm({
        paymentKey,
        orderId: orderNo,
        amount,
        idempotencyKey: attemptKey,
        scenario: cleanString(body.mockScenario, 40),
      });
    } catch (error) {
      if (error instanceof ProviderError) {
        // A timeout or 5xx can occur after Toss accepted the confirmation. Query before deciding.
        if (!error.definitive) {
          try {
            const queried = await provider.get(paymentKey);
            const normalizedQuery = normalizedProviderResult(queried);
            if (normalizedQuery.orderId && normalizedQuery.amount > 0) payment = queried;
          } catch {
            // Remain unknown; the stable provider idempotency key makes retry safe.
          }
        }
        if (!payment) {
          await rpc("fail_payment_confirmation_v1", {
            p_order_no: orderNo,
            p_idempotency_key: attemptKey,
            p_error_code: error.code,
            p_safe_error: error.definitive ? "결제가 승인되지 않았습니다." : "결제 승인 결과를 확인 중입니다.",
            p_definitive: error.definitive,
            p_expired: error.code.toUpperCase().includes("EXPIRED"),
          });
          throw new HttpError(error.definitive ? 402 : 502,
            error.definitive ? "PAYMENT_REJECTED" : "PAYMENT_RESULT_UNKNOWN",
            error.definitive ? "결제가 승인되지 않았습니다." : "결제 승인 결과를 확인 중입니다. 같은 주문으로 다시 확인해 주세요.");
        }
      } else {
        throw error;
      }
    }

    const normalized = normalizedProviderResult(payment!);
    if (normalized.paymentKey !== paymentKey || normalized.orderId !== orderNo || normalized.amount !== amount) {
      await rpc("fail_payment_confirmation_v1", {
        p_order_no: orderNo,
        p_idempotency_key: attemptKey,
        p_error_code: "PROVIDER_RESPONSE_MISMATCH",
        p_safe_error: "결제 승인 결과를 확인 중입니다.",
        p_definitive: false,
        p_expired: false,
      });
      throw new HttpError(409, "PAYMENT_RESPONSE_MISMATCH", "결제 승인 결과를 확인 중입니다.");
    }
    const disposition = paymentConfirmationDisposition(normalized.status);
    if (disposition !== "success") {
      const definitive = disposition === "terminal_failure";
      await rpc("fail_payment_confirmation_v1", {
        p_order_no: orderNo,
        p_idempotency_key: attemptKey,
        p_error_code: normalized.status,
        p_safe_error: definitive ? "결제가 완료되지 않았습니다." : "결제 상태를 재확인하고 있습니다.",
        p_definitive: definitive,
        p_expired: normalized.status === "EXPIRED",
      });
      throw new HttpError(
        definitive ? 402 : 409,
        definitive ? "PAYMENT_NOT_COMPLETED" : "PAYMENT_RECONCILIATION_PENDING",
        definitive ? "결제가 완료되지 않았습니다." : "결제 상태를 재확인하고 있습니다.",
      );
    }

    const secretHash = normalized.secret ? await sha256Hex(normalized.secret) : null;
    const method = normalizePaymentMethod(claim.paymentMethod);
    const order = await rpc<Record<string, unknown>>("finalize_payment_confirmation_v1", {
      p_order_no: orderNo,
      p_idempotency_key: attemptKey,
      p_payment_key: paymentKey,
      p_amount: amount,
      p_provider_status: normalized.status,
      p_method: method,
      p_transaction_id: normalized.transactionId || null,
      p_approval_no: normalized.approvalNo || null,
      p_approved_at: safeIsoDate(normalized.approvedAt),
      p_webhook_secret_hash: secretHash,
      p_virtual_due_at: safeIsoDate(normalized.virtualDueAt),
      p_safe_payload: normalized.safePayload,
    });
    if (order.paymentTerminated === true
        || new Set(["canceled", "partially_canceled", "refunded"]).has(String(order.status || ""))) {
      throw new HttpError(409, "ORDER_PAYMENT_TERMINATED", "이미 취소 또는 환불된 주문입니다.");
    }
    if (order.status === "cancel_requested") {
      throw new HttpError(409, "ORDER_CANCELLATION_PENDING", "취소 처리 중인 주문입니다.");
    }
    if (order.status === "paid" && normalized.status !== "DONE") {
      throw new HttpError(500, "INVALID_PAID_TRANSITION", "결제 상태를 확정하지 못했습니다.");
    }
    return jsonResponse(req, { order, paid: normalized.status === "DONE", waitingForDeposit: normalized.status === "WAITING_FOR_DEPOSIT" });
  } catch (error) {
    if (!(error instanceof HttpError || error instanceof ProviderError)) safeLog("payment-confirm", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "결제 승인 요청을 처리하지 못했습니다.");
  }
});
