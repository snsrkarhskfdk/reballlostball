const ORDER_STATUS_LABELS = {
  draft: "주문 접수",
  payment_ready: "결제 대기",
  payment_auth_started: "결제 진행 중",
  waiting_for_deposit: "입금 대기",
  paid: "결제 완료",
  payment_failed: "결제 실패",
  cancel_requested: "취소 요청",
  canceled: "주문 취소",
  partially_canceled: "부분 취소",
  refunded: "환불 완료",
  shipping_ready: "상품 준비중",
  shipped: "배송중",
  delivered: "배송완료",
};

const PAYMENT_METHOD_LABELS = {
  card: "카드",
  transfer: "계좌이체",
  virtual: "가상계좌",
  easy: "간편결제",
  virtual_account: "가상계좌",
  easy_pay: "간편결제",
};

const PAYMENT_STATUS_LABELS = {
  ready: "결제 대기",
  in_progress: "결제 진행 중",
  waiting_for_deposit: "입금 대기",
  done: "결제 완료",
  canceled: "결제 취소",
  partial_canceled: "부분 취소",
  failed: "결제 실패",
  expired: "결제 만료",
};

export function normalizeNotifications(notifications, defaults = {}) {
  return {
    ...defaults,
    ...(notifications && typeof notifications === "object" && !Array.isArray(notifications) ? notifications : {}),
  };
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function stringOrEmpty(value) {
  return value == null ? "" : String(value);
}

export function asYesNo(value) {
  return value ? "yes" : "no";
}

export function boolFromYesNo(value) {
  return String(value || "").toLowerCase() === "yes";
}

export function formatDateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric" }).format(date);
}

export function formatAccountAddress(address) {
  return [address.zipCode, address.roadAddress, address.detailAddress].filter(Boolean).join(" ").trim();
}

export function translateOrderStatus(status) {
  return ORDER_STATUS_LABELS[status] ?? status ?? "주문 접수";
}

export function translatePaymentMethod(method) {
  return PAYMENT_METHOD_LABELS[method] ?? method ?? "결제수단 미정";
}

export function translatePaymentStatus(status) {
  return PAYMENT_STATUS_LABELS[status] ?? ORDER_STATUS_LABELS[status] ?? status ?? "결제 대기";
}

export function translateDeliveryStatus(orderStatus) {
  if (!orderStatus) return "배송 준비 전";
  if (["shipping_ready", "shipped", "delivered"].includes(orderStatus)) {
    return translateOrderStatus(orderStatus);
  }
  if (Object.hasOwn(ORDER_STATUS_LABELS, orderStatus)) return "배송 준비 전";
  return String(orderStatus);
}
