import { HttpError, cleanString, sha256Hex } from "../_shared/core.ts";
import {
  assertAllowedOrigin,
  jsonResponse,
  optionsResponse,
  publicErrorResponse,
  readJson,
  safeLog,
} from "../_shared/http.ts";
import { assertMockPaymentProviderAllowed } from "../_shared/payments.ts";
import { configuredPaymentCallbackUrl, configuredTossClientKey } from "../_shared/payment-config.ts";
import { enforceRateLimit } from "../_shared/security.ts";
import { rpc, sessionUser } from "../_shared/supabase.ts";

const CONTRACTED_PAYMENT_METHODS = new Set(["card", "transfer", "easy_pay"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try { return optionsResponse(req); } catch (error) { return publicErrorResponse(req, error); }
  }
  try {
    assertAllowedOrigin(req);
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");
    const body = await readJson(req, 16 * 1024);
    const user = await sessionUser(req);
    if (req.headers.has("authorization") && !user) throw new HttpError(401, "AUTH_REQUIRED", "로그인 상태를 확인해 주세요.");
    const orderNo = cleanString(body.orderNo ?? body.orderId, 64).toUpperCase();
    const guestToken = cleanString(body.guestLookupToken, 200);
    const guestTokenHash = guestToken ? await sha256Hex(guestToken) : null;
    if (!/^[A-Z0-9_-]{6,64}$/.test(orderNo) || (!user && !guestTokenHash)) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "주문을 확인할 수 없습니다.");
    }
    await enforceRateLimit(req, "payment_prepare", `${user?.id || guestTokenHash}:${orderNo}`, 20, 900, 900);
    const order = await rpc<Record<string, unknown> | null>("get_order_v1", {
      p_order_no: orderNo,
      p_actor_user_id: user?.id || null,
      p_guest_token_hash: guestTokenHash,
    });
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "주문을 확인할 수 없습니다.");
    if (order.status !== "payment_ready") {
      throw new HttpError(409, "ORDER_NOT_PAYMENT_READY", "현재 결제할 수 없는 주문입니다.");
    }
    if (!CONTRACTED_PAYMENT_METHODS.has(String(order.paymentMethod))) {
      throw new HttpError(400, "UNSUPPORTED_PAYMENT_METHOD", "지원하지 않는 결제수단입니다.");
    }
    const reservationExpiresAt = cleanString(order.reservationExpiresAt, 80);
    const reservationExpiry = Date.parse(reservationExpiresAt);
    if (reservationExpiresAt && (!Number.isFinite(reservationExpiry) || reservationExpiry <= Date.now() + 30_000)) {
      throw new HttpError(409, "ORDER_EXPIRED", "주문의 결제 가능 시간이 만료되었습니다.");
    }
    if (order.paymentProvider === "mock") assertMockPaymentProviderAllowed();
    const clientKey = order.paymentProvider === "toss_payments" ? configuredTossClientKey() : "";
    const method = {
      card: "CARD",
      transfer: "TRANSFER",
      virtual_account: "VIRTUAL_ACCOUNT",
      easy_pay: "CARD",
    }[String(order.paymentMethod)] || "CARD";
    const successUrl = configuredPaymentCallbackUrl("TOSS_SUCCESS_URL", "/payment/success");
    const failUrl = configuredPaymentCallbackUrl("TOSS_FAIL_URL", "/payment/fail");
    return jsonResponse(req, {
      orderId: order.orderNo,
      orderName: order.orderName,
      amount: order.totalKrw,
      paymentMethod: order.paymentMethod,
      provider: order.paymentProvider,
      reservationExpiresAt: reservationExpiresAt || null,
      clientKey: order.paymentProvider === "toss_payments" ? clientKey : null,
      successUrl,
      failUrl,
      customerKey: user?.id || `guest_${guestTokenHash?.slice(0, 40)}`,
      payment: {
        method,
        amount: { currency: "KRW", value: Number(order.totalKrw) },
        orderId: order.orderNo,
        orderName: order.orderName,
        successUrl,
        failUrl,
      },
    });
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("prepare-payment", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "결제 준비 요청을 처리하지 못했습니다.");
  }
});
