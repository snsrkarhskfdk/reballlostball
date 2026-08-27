import {
  HttpError,
  cleanString,
  hmacSha256Base64Url,
  normalizeAddress,
  normalizeItems,
  normalizePaymentMethod,
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
import { assertMockPaymentProviderAllowed, paymentProvider } from "../_shared/payments.ts";
import { configuredPaymentCallbackUrl, configuredTossClientKey } from "../_shared/payment-config.ts";
import { enforceRateLimit } from "../_shared/security.ts";
import { rpc, sessionUser } from "../_shared/supabase.ts";

const serviceDatabase = { rpc };
const CONTRACTED_PAYMENT_METHODS = new Set(["card", "transfer", "easy_pay"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try { return optionsResponse(req); } catch (error) { return publicErrorResponse(req, error); }
  }
  try {
    assertAllowedOrigin(req);
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");
    const body = await readJson(req, 96 * 1024);
    const user = await sessionUser(req);
    if (req.headers.has("authorization") && !user) {
      throw new HttpError(401, "AUTH_REQUIRED", "로그인 상태를 확인해 주세요.");
    }

    const suppliedIdempotencyKey = cleanString(req.headers.get("idempotency-key") || body.idempotencyKey, 128);
    const idempotencyKey = suppliedIdempotencyKey || crypto.randomUUID();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "주문 요청 키를 확인해 주세요.");
    }
    const items = normalizeItems(body.items).map(({ variantId, quantity }) => ({ variantId, quantity }));
    const address = normalizeAddress(body.address ?? body.customer);
    const paymentMethod = normalizePaymentMethod(body.paymentMethod);
    if (!CONTRACTED_PAYMENT_METHODS.has(paymentMethod)) {
      throw new HttpError(400, "UNSUPPORTED_PAYMENT_METHOD", "지원하지 않는 결제수단입니다.");
    }
    await enforceRateLimit(req, "commerce_create_order", user?.id || idempotencyKey, 12, 900, 900);

    const providerName = cleanString(Deno.env.get("PAYMENT_PROVIDER") || "toss_payments", 40);
    if (!new Set(["toss_payments", "mock"]).has(providerName)) {
      throw new HttpError(503, "PAYMENT_CONFIG_MISSING", "결제 설정을 확인할 수 없습니다.");
    }
    if (providerName === "mock") assertMockPaymentProviderAllowed();
    paymentProvider();
    if (providerName === "toss_payments") configuredTossClientKey();
    const successUrl = providerName === "toss_payments"
      ? configuredPaymentCallbackUrl("TOSS_SUCCESS_URL", "/payment/success")
      : "";
    const failUrl = providerName === "toss_payments"
      ? configuredPaymentCallbackUrl("TOSS_FAIL_URL", "/payment/fail")
      : "";

    const fingerprint = await sha256Hex(stableStringify({ items, address, paymentMethod, providerName, profileId: user?.id || null }));
    let guestLookupToken: string | null = null;
    let guestTokenHash: string | null = null;
    if (!user) {
      guestLookupToken = await hmacSha256Base64Url(
        Deno.env.get("GUEST_ORDER_TOKEN_SECRET") || "",
        `guest-order:${idempotencyKey}:${fingerprint}`,
      );
      guestTokenHash = await sha256Hex(guestLookupToken);
    }

    await serviceDatabase.rpc("expire_order_reservations_v1", { p_limit: 25 }).catch(() => undefined);
    const order = await serviceDatabase.rpc<Record<string, unknown>>("create_order_v1", {
      p_profile_id: user?.id || null,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_items: items,
      p_address: address,
      p_payment_method: paymentMethod,
      p_payment_provider: providerName,
      p_guest_token_hash: guestTokenHash,
    });
    const tossMethod = {
      card: "CARD",
      transfer: "TRANSFER",
      virtual_account: "VIRTUAL_ACCOUNT",
      easy_pay: "CARD",
    }[paymentMethod];
    const payment = providerName === "toss_payments"
      ? {
          customerKey: user?.id || `guest_${guestTokenHash?.slice(0, 40)}`,
          payment: {
            method: tossMethod,
            amount: { currency: "KRW", value: Number(order.totalKrw) },
            orderId: order.orderNo,
            orderName: order.orderName,
            successUrl,
            failUrl,
            customerName: address.receiverName,
          },
        }
      : null;
    return jsonResponse(req, {
      ...order,
      lookupToken: guestLookupToken,
      guestLookupToken,
      payment,
      skipPayment: !payment,
    }, 201);
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("create-order", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "주문을 생성하지 못했습니다.");
  }
});
