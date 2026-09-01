import { HttpError, cleanString, isExplicitNonProductionRuntime, sha256Hex } from "../_shared/core.ts";
import {
  assertAllowedOrigin,
  jsonResponse,
  optionsResponse,
  publicErrorResponse,
  readJson,
  safeLog,
} from "../_shared/http.ts";
import { assertMockPaymentProviderAllowed } from "../_shared/payments.ts";
import { enforceRateLimit } from "../_shared/security.ts";
import { rpc, sessionUser } from "../_shared/supabase.ts";

function safeConfiguredUrl(name: string): string {
  const value = Deno.env.get(name) || "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !(isExplicitNonProductionRuntime() && url.protocol === "http:")) throw new Error("protocol");
    return url.toString();
  } catch {
    throw new HttpError(503, "PAYMENT_CONFIG_MISSING", "결제 설정을 확인할 수 없습니다.");
  }
}

function withPaymentReturnCapability(rawUrl: string, orderNo: string, returnToken: string): string {
  if (!returnToken) return rawUrl;
  const url = new URL(rawUrl);
  url.searchParams.set("orderId", orderNo);
  url.searchParams.set("paymentReturnToken", returnToken);
  return url.toString();
}

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
    let guestTokenHash = guestToken ? await sha256Hex(guestToken) : null;
    const paymentReturnToken = cleanString(body.paymentReturnToken, 200).toLowerCase();

    if (!/^[A-Z0-9_-]{6,64}$/.test(orderNo)) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "주문을 확인할 수 없습니다.");
    }

    // Mobile card-app round trips may resume in a fresh browser context where the
    // guest sessionStorage token is gone. A scoped payment-return capability can
    // restore only the server-side guest-token hash needed for payment retry.
    if (!user && !guestTokenHash && /^[0-9a-f]{64}$/.test(paymentReturnToken)) {
      guestTokenHash = await rpc<string | null>("resolve_payment_return_capability_v1", {
        p_order_no: orderNo,
        p_return_token: paymentReturnToken,
      });
    }

    if (!user && !guestTokenHash) {
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
    if (order.paymentProvider === "mock") assertMockPaymentProviderAllowed();

    const clientKey = Deno.env.get("TOSS_PAYMENTS_CLIENT_KEY") || "";
    if (order.paymentProvider === "toss_payments" && !/^(test|live)_(g?ck)_/.test(clientKey)) {
      throw new HttpError(503, "PAYMENT_CONFIG_MISSING", "결제 설정을 확인할 수 없습니다.");
    }

    const method = {
      card: "CARD",
      transfer: "TRANSFER",
      virtual_account: "VIRTUAL_ACCOUNT",
      easy_pay: "CARD",
    }[String(order.paymentMethod)] || "CARD";

    const returnToken = !user && guestTokenHash
      ? await sha256Hex(`payment-return-v1:${guestTokenHash}:${orderNo}`)
      : "";
    const successUrl = withPaymentReturnCapability(
      safeConfiguredUrl("TOSS_SUCCESS_URL"),
      orderNo,
      returnToken,
    );
    const failUrl = withPaymentReturnCapability(
      safeConfiguredUrl("TOSS_FAIL_URL"),
      orderNo,
      returnToken,
    );

    return jsonResponse(req, {
      orderId: order.orderNo,
      orderName: order.orderName,
      amount: order.totalKrw,
      paymentMethod: order.paymentMethod,
      provider: order.paymentProvider,
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
