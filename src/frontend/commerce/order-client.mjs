function endpoint(baseUrl, name) {
  return `${String(baseUrl).replace(/\/$/, "")}/functions/v1/${name}`;
}

export const MAX_ORDER_LINES = 10;
export const MAX_ORDER_LINE_QUANTITY = 10;
export const MAX_ORDER_TOTAL_QUANTITY = 20;

async function requestJson(fetchImpl, url, { anonKey, accessToken, body, headers = {} }) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || "요청을 처리하지 못했습니다.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function createIdempotencyKey(cryptoRef = globalThis.crypto) {
  if (typeof cryptoRef?.randomUUID === "function") {
    return `order_${cryptoRef.randomUUID().replaceAll("-", "")}`;
  }
  if (typeof cryptoRef?.getRandomValues === "function") {
    const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
    return `order_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  }
  throw new Error("안전한 주문 요청 키를 생성할 수 없습니다.");
}

export function orderLinePayload(cart) {
  if (!Array.isArray(cart) || !cart.length) throw new Error("주문할 상품이 없습니다.");
  if (cart.length > MAX_ORDER_LINES) {
    throw new Error(`한 주문에는 최대 ${MAX_ORDER_LINES}개 옵션만 담을 수 있습니다.`);
  }
  const seenVariantIds = new Set();
  let totalQuantity = 0;
  const lines = cart.map((item) => {
    const variantId = String(item?.variantId ?? item?.variant?.id ?? "").trim();
    const quantity = Number(item?.quantity);
    if (!variantId || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error("주문 상품 정보가 올바르지 않습니다.");
    }
    if (seenVariantIds.has(variantId)) throw new Error("같은 상품 옵션이 중복되었습니다.");
    if (quantity > MAX_ORDER_LINE_QUANTITY) {
      throw new Error(`상품 옵션별 수량은 최대 ${MAX_ORDER_LINE_QUANTITY}개입니다.`);
    }
    seenVariantIds.add(variantId);
    totalQuantity += quantity;
    return { variantId, quantity };
  });
  if (totalQuantity > MAX_ORDER_TOTAL_QUANTITY) {
    throw new Error(`한 주문의 총수량은 최대 ${MAX_ORDER_TOTAL_QUANTITY}개입니다.`);
  }
  return lines;
}

export function createOrderRequest(config, payload) {
  const idempotencyKey = String(config.idempotencyKey ?? "").trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    throw new Error("안전한 주문 요청 키가 필요합니다.");
  }
  return requestJson(config.fetchImpl ?? fetch, endpoint(config.baseUrl, "create-order"), {
    anonKey: config.anonKey,
    accessToken: config.accessToken,
    body: payload,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export function lookupGuestOrderRequest(config, payload) {
  return requestJson(config.fetchImpl ?? fetch, endpoint(config.baseUrl, "guest-order-lookup"), {
    anonKey: config.anonKey,
    accessToken: "",
    body: payload,
  });
}

export function getOrderRequest(config, orderId, guestLookupToken = "") {
  return requestJson(config.fetchImpl ?? fetch, endpoint(config.baseUrl, "get-order"), {
    anonKey: config.anonKey,
    accessToken: config.accessToken,
    body: {
      orderNo: orderId,
      ...(guestLookupToken ? { guestLookupToken } : {}),
    },
  });
}

export function normalizeServerOrder(payload) {
  const source = payload?.order ?? payload;
  if (!source || typeof source !== "object") return null;
  const id = String(source.orderNo ?? source.order_no ?? source.id ?? "").trim().toUpperCase();
  // Order numbers are later used in hash routes and data attributes. Keep the
  // browser model on the same narrow identifier contract enforced by the API.
  if (!/^[A-Z0-9_-]{6,64}$/.test(id)) return null;
  const status = String(source.status ?? "payment_ready");
  const address = source.address && typeof source.address === "object" ? source.address : {};
  const items = Array.isArray(source.items) ? source.items.map((item, index) => {
    const productName = String(item?.productName ?? item?.product_name ?? "주문 상품");
    const variantName = String(item?.variantName ?? item?.variant_name ?? "");
    const quantity = Number(item?.quantity ?? item?.qty ?? 0);
    const price = Number(item?.unitPriceKrw ?? item?.unit_price_krw ?? 0);
    return {
      key: `${id}-${String(item?.variantId ?? item?.variant_id ?? index)}`,
      variantId: String(item?.variantId ?? item?.variant_id ?? ""),
      name: productName,
      brandName: productName.split(" ")[0] || "REBALL",
      selection: { model: variantName },
      price,
      quantity,
      lineTotal: Number(item?.lineTotalKrw ?? item?.line_total_krw ?? price * quantity),
    };
  }) : [];
  const delivery = ["shipping_ready", "shipped", "delivered"].includes(status)
    ? status
    : "배송 준비 전";
  return {
    id,
    dbId: source.id ?? "",
    date: source.createdAt ?? source.created_at ?? new Date().toLocaleString("ko-KR"),
    status,
    paymentStatus: source.paymentStatus ?? source.payment_status ?? "ready",
    delivery: source.deliveryStatus ?? source.delivery_status ?? delivery,
    shippingCarrier: String(source.shippingCarrier ?? source.shipping_carrier ?? ""),
    trackingNumber: String(source.trackingNumber ?? source.tracking_number ?? ""),
    shippedAt: source.shippedAt ?? source.shipped_at ?? null,
    deliveredAt: source.deliveredAt ?? source.delivered_at ?? null,
    total: Number(source.totalKrw ?? source.total_krw ?? 0),
    customer: source.customer ?? {
      name: String(address.receiverName ?? address.receiver_name ?? "고객"),
      phone: String(address.receiverPhone ?? address.receiver_phone ?? ""),
      address: [address.zipCode ?? address.zip_code, address.roadAddress ?? address.road_address, address.detailAddress ?? address.detail_address]
        .filter(Boolean).join(" "),
      memo: String(address.memo ?? ""),
      payment: String(source.paymentMethod ?? source.payment_method ?? ""),
    },
    items,
  };
}
