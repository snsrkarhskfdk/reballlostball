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
import { assertMockPaymentProviderAllowed } from "../_shared/payments.ts";
import { enforceRateLimit } from "../_shared/security.ts";
import { rpc, serviceSelect, sessionUser } from "../_shared/supabase.ts";

const serviceDatabase = { rpc };
type SessionUser = { id: string; email?: string } | null;
type ExistingOrder = {
  order_no?: string | null;
  profile_id?: string | null;
  request_fingerprint?: string | null;
  guest_lookup_token_hash?: string | null;
};

const DEFAULT_ENABLED_PAYMENT_METHODS = ["card", "transfer", "easy_pay"];

function enabledPaymentMethods(): Set<string> {
  const configured = cleanString(Deno.env.get("ENABLED_PAYMENT_METHODS"), 160)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ENABLED_PAYMENT_METHODS);
}

async function existingOrderRow(idempotencyKey: string): Promise<ExistingOrder | null> {
  const params = new URLSearchParams({
    select: "order_no,profile_id,request_fingerprint,guest_lookup_token_hash",
    idempotency_key: `eq.${idempotencyKey}`,
    limit: "1",
  });
  const rows = await serviceSelect<ExistingOrder[]>(`/rest/v1/orders?${params}`);
  return rows[0] || null;
}

async function recoverExistingOrder(idempotencyKey: string, user: SessionUser): Promise<Record<string, unknown> | null> {
  const existing = await existingOrderRow(idempotencyKey);
  if (!existing) return null;

  const orderNo = cleanString(existing.order_no, 64).toUpperCase();
  const existingProfileId = typeof existing.profile_id === "string" ? existing.profile_id : null;
  const actorProfileId = user?.id || null;
  if (!orderNo || existingProfileId !== actorProfileId) {
    throw new HttpError(409, "IDEMPOTENCY_ACTOR_MISMATCH", "이전 주문 시도의 로그인 상태를 다시 확인해 주세요.");
  }

  let guestLookupToken: string | null = null;
  let guestTokenHash: string | null = null;
  if (!user) {
    const fingerprint = cleanString(existing.request_fingerprint, 64).toLowerCase();
    const storedHash = cleanString(existing.guest_lookup_token_hash, 64).toLowerCase();
    const secret = Deno.env.get("GUEST_ORDER_TOKEN_SECRET") || "";
    if (!/^[0-9a-f]{64}$/.test(fingerprint) || !/^[0-9a-f]{64}$/.test(storedHash) || secret.length < 16) {
      throw new HttpError(503, "ORDER_RECOVERY_UNAVAILABLE", "기존 주문을 안전하게 복구할 수 없습니다.");
    }
    guestLookupToken = await hmacSha256Base64Url(secret, `guest-order:${idempotencyKey}:${fingerprint}`);
    guestTokenHash = await sha256Hex(guestLookupToken);
    if (guestTokenHash !== storedHash) {
      throw new HttpError(503, "ORDER_RECOVERY_INTEGRITY_FAILED", "기존 주문을 안전하게 복구할 수 없습니다.");
    }
  }

  const order = await rpc<Record<string, unknown> | null>("get_order_v1", {
    p_order_no: orderNo,
    p_actor_user_id: actorProfileId,
    p_guest_token_hash: guestTokenHash,
  });
  if (!order) return null;

  const status = cleanString(order.status, 40).toLowerCase();
  return {
    ...order,
    duplicate: true,
    recovered: true,
    lookupToken: guestLookupToken,
    guestLookupToken,
    skipPayment: status !== "payment_ready",
  };
}

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

    const idempotencyKey = cleanString(req.headers.get("idempotency-key") || body.idempotencyKey, 128);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      // Never silently invent a server key. A request that can be retried by a
      // browser/network boundary must carry a stable client capability or it can
      // create duplicate orders and reservations after an ambiguous response.
      throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "주문 요청 키를 확인해 주세요.");
    }
    await enforceRateLimit(req, "commerce_create_order", user?.id || idempotencyKey, 12, 900, 900);

    // The stable idempotency key is recovery authority. Resolve an earlier
    // committed attempt before reading mutable cart/address fields, because live
    // stock may already have changed after a timed-out first response.
    const recoveredBeforeCreate = await recoverExistingOrder(idempotencyKey, user);
    if (recoveredBeforeCreate) return jsonResponse(req, recoveredBeforeCreate, 200);

    const items = normalizeItems(body.items).map(({ variantId, quantity }) => ({ variantId, quantity }));
    const address = normalizeAddress(body.address ?? body.customer);
    const paymentMethod = normalizePaymentMethod(body.paymentMethod);
    if (!enabledPaymentMethods().has(paymentMethod)) {
      throw new HttpError(400, "PAYMENT_METHOD_UNAVAILABLE", "현재 사용할 수 없는 결제수단입니다.");
    }

    const providerName = cleanString(Deno.env.get("PAYMENT_PROVIDER") || "toss_payments", 40);
    if (!new Set(["toss_payments", "mock"]).has(providerName)) {
      throw new HttpError(503, "PAYMENT_CONFIG_MISSING", "결제 설정을 확인할 수 없습니다.");
    }
    if (providerName === "mock") assertMockPaymentProviderAllowed();

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
    let order: Record<string, unknown>;
    try {
      order = await serviceDatabase.rpc<Record<string, unknown>>("create_order_v1", {
        p_profile_id: user?.id || null,
        p_idempotency_key: idempotencyKey,
        p_request_fingerprint: fingerprint,
        p_items: items,
        p_address: address,
        p_payment_method: paymentMethod,
        p_payment_provider: providerName,
        p_guest_token_hash: guestTokenHash,
      });
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        const racedRecovery = await recoverExistingOrder(idempotencyKey, user);
        if (racedRecovery) return jsonResponse(req, racedRecovery, 200);
      }
      throw error;
    }

    const successUrl = Deno.env.get("TOSS_SUCCESS_URL") || "";
    const failUrl = Deno.env.get("TOSS_FAIL_URL") || "";
    const tossMethod = {
      card: "CARD",
      transfer: "TRANSFER",
      virtual_account: "VIRTUAL_ACCOUNT",
      easy_pay: "CARD",
    }[paymentMethod];
    const payment = providerName === "toss_payments" && successUrl && failUrl
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
