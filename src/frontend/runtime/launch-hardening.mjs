import { loadGuestLookupSession } from "../core/storage.mjs";
import { createIdempotencyKey } from "../commerce/order-client.mjs";
import { loadTossSdk, prepareTossPayment } from "../payments/toss-client.mjs";
import { paymentProfile, shippingPolicy } from "../catalog/content.mjs";

const metaConfig = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
const SUPABASE_URL = metaConfig("reball-supabase-url").replace(/\/$/, "");
const SUPABASE_KEY = metaConfig("reball-supabase-publishable-key");
const AUTH_STORAGE_KEY = "reballlostball.auth";
const MAX_DELIVERY_COPY = "배송은 결제일로부터 최대 7일 이내 완료를 기준으로 운영합니다.";
const preparedPayments = new Map();
const preparingPayments = new Map();
const orderSnapshots = new Map();
const loadingOrders = new Map();
let hardenQueued = false;

// Keep the visible payment contract aligned with the currently applied Toss MID.
paymentProfile.methods.splice(0, paymentProfile.methods.length, "카드", "계좌이체", "간편결제");
paymentProfile.transferLabel = "토스페이먼츠 결제 안내";
shippingPolicy.maxLeadTime = "결제일로부터 최대 7일";

function accessTokenFromStorage() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    const stack = [parsed];
    const visited = new Set();
    while (stack.length) {
      const value = stack.shift();
      if (!value || typeof value !== "object" || visited.has(value)) continue;
      visited.add(value);
      if (typeof value.access_token === "string" && value.access_token.length > 20) return value.access_token;
      for (const child of Object.values(value)) {
        if (child && typeof child === "object") stack.push(child);
      }
    }
  } catch {}
  return "";
}

function guestLookupFor(orderId) {
  const lookup = loadGuestLookupSession(globalThis.sessionStorage);
  return lookup?.orderId === orderId ? lookup : null;
}

function apiHeaders({ accessToken = "", idempotencyKey = "" } = {}) {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_KEY,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}

async function postFunction(name, body, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("온라인 주문 설정을 확인할 수 없습니다.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: apiHeaders(options),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || "요청을 처리하지 못했습니다.");
    error.code = payload?.code || "REQUEST_FAILED";
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setInlineStatus(anchor, message, tone = "info") {
  if (!anchor) return;
  const host = anchor.closest(".complete-page, .admin-modal-card, .checkout-main-card") || anchor.parentElement;
  if (!host) return;
  let node = host.querySelector("[data-launch-hardening-status]");
  if (!node) {
    node = document.createElement("p");
    node.dataset.launchHardeningStatus = "true";
    node.setAttribute("role", "status");
    const actions = host.querySelector(".action-row, footer");
    (actions || host).insertAdjacentElement(actions ? "beforebegin" : "beforeend", node);
  }
  node.dataset.tone = tone;
  node.textContent = message;
}

async function primePayment(orderId) {
  const safeOrderId = String(orderId || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{6,64}$/.test(safeOrderId)) throw new Error("주문번호를 확인해 주세요.");
  if (preparedPayments.has(safeOrderId)) return preparedPayments.get(safeOrderId);
  if (preparingPayments.has(safeOrderId)) return preparingPayments.get(safeOrderId);

  const lookup = guestLookupFor(safeOrderId);
  const promise = Promise.all([
    prepareTossPayment(
      {
        baseUrl: SUPABASE_URL,
        anonKey: SUPABASE_KEY,
        accessToken: accessTokenFromStorage(),
      },
      safeOrderId,
      lookup?.lookupToken || ""
    ),
    loadTossSdk(),
  ]).then(([prepared]) => {
    if (!prepared?.payment || !prepared?.clientKey || !prepared?.customerKey) {
      throw new Error("결제 준비 정보를 확인할 수 없습니다.");
    }
    preparedPayments.set(safeOrderId, prepared);
    return prepared;
  }).finally(() => preparingPayments.delete(safeOrderId));

  preparingPayments.set(safeOrderId, promise);
  return promise;
}

function requestPreparedPayment(orderId) {
  const safeOrderId = String(orderId || "").trim().toUpperCase();
  const prepared = preparedPayments.get(safeOrderId);
  if (!prepared) throw new Error("결제 준비가 아직 끝나지 않았습니다.");
  if (typeof globalThis.TossPayments !== "function") throw new Error("토스페이먼츠 결제 모듈을 불러오지 못했습니다.");
  const client = globalThis.TossPayments(prepared.clientKey);
  const checkout = client.payment({ customerKey: prepared.customerKey });
  // Deliberately invoke requestPayment synchronously inside the user's click.
  // This avoids browser popup/user-activation loss after server awaits.
  return checkout.requestPayment(prepared.payment);
}

function decoratePaymentRetry(button) {
  if (!(button instanceof HTMLButtonElement)) return;
  const orderId = String(button.dataset.paymentRetry || "").trim().toUpperCase();
  if (!orderId || button.dataset.launchPaymentBound === "true") return;
  button.dataset.launchPaymentBound = "true";
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "토스 결제 준비 중…";
  loadTossSdk().catch(() => undefined);
  primePayment(orderId)
    .then(() => {
      if (!button.isConnected) return;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = "토스 결제하기";
      setInlineStatus(button, "결제 준비가 완료되었습니다. 아래 버튼을 눌러 토스 결제창을 여세요.");
    })
    .catch((error) => {
      if (!button.isConnected) return;
      button.disabled = true;
      button.removeAttribute("aria-busy");
      button.textContent = "현재 결제할 수 없습니다";
      setInlineStatus(button, error?.message || "결제 준비 상태를 확인해 주세요.", "error");
    });
}

async function fetchOrderSnapshot(orderId, { force = false } = {}) {
  const safeOrderId = String(orderId || "").trim().toUpperCase();
  if (!force && orderSnapshots.has(safeOrderId)) return orderSnapshots.get(safeOrderId);
  if (!force && loadingOrders.has(safeOrderId)) return loadingOrders.get(safeOrderId);
  const lookup = guestLookupFor(safeOrderId);
  const promise = postFunction(
    "get-order",
    { orderNo: safeOrderId, ...(lookup?.lookupToken ? { guestLookupToken: lookup.lookupToken } : {}) },
    { accessToken: accessTokenFromStorage() }
  ).then((payload) => {
    const order = payload?.order;
    if (!order || typeof order !== "object") throw new Error("주문 정보를 확인할 수 없습니다.");
    orderSnapshots.set(safeOrderId, order);
    return order;
  }).finally(() => loadingOrders.delete(safeOrderId));
  loadingOrders.set(safeOrderId, promise);
  return promise;
}

function valueForOrderField(order, name) {
  if (name === "배송상태") {
    return {
      shipping_ready: "배송 준비중",
      shipped: "배송중",
      delivered: "배송완료",
    }[String(order?.status || "")] || "배송 준비 전";
  }
  if (name === "택배사") return order?.shippingCarrier || "아직 등록되지 않았습니다.";
  if (name === "송장번호") return order?.trackingNumber || "아직 등록되지 않았습니다.";
  return "";
}

function updateDefinitionField(root, name, value) {
  const dt = [...root.querySelectorAll("dt")].find((node) => node.textContent.trim() === name);
  const dd = dt?.nextElementSibling;
  if (dd && value) dd.textContent = value;
}

function maskGuestToken(root, orderId) {
  const box = root.querySelector(".order-lookup-token");
  if (!box || box.dataset.launchTokenMasked === "true") return;
  const lookup = guestLookupFor(orderId);
  if (!lookup?.lookupToken) return;
  box.dataset.launchTokenMasked = "true";
  const code = box.querySelector("code");
  if (code) code.textContent = `••••••••••••${lookup.lookupToken.slice(-6)}`;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "secondary-btn compact";
  copy.dataset.copyGuestOrderToken = orderId;
  copy.textContent = "조회 토큰 복사";
  code?.insertAdjacentElement("afterend", copy);
  const span = box.querySelector("span");
  if (span) span.textContent = "조회 토큰은 화면에 전체 노출하지 않습니다. 필요할 때 복사해 안전한 곳에 보관하세요.";
}

// order.status uses the order_status enum ('paid'); order.paymentStatus uses the
// payment_status enum, whose settled value is 'done'. 'paid' is not a payment_status
// member, so comparing against it here never matched a real server response.
function canCustomerCancel(order) {
  return String(order?.status || "") === "paid" && String(order?.paymentStatus || "") === "done";
}

function installCancelAction(root, orderId, order) {
  const actions = root.querySelector(".action-row.center");
  if (!actions || actions.querySelector("[data-payment-cancel-order]")) return;
  if (!canCustomerCancel(order)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-btn";
  button.dataset.paymentCancelOrder = orderId;
  button.textContent = "결제 취소";
  actions.insertAdjacentElement("afterbegin", button);
}

async function hydrateOrderPage(root) {
  const orderId = [...root.querySelectorAll("dt")]
    .find((node) => node.textContent.trim() === "주문번호")
    ?.nextElementSibling?.textContent?.trim().toUpperCase();
  if (!orderId || root.dataset.launchOrderHydrated === orderId) return;
  root.dataset.launchOrderHydrated = orderId;
  maskGuestToken(root, orderId);
  try {
    const order = await fetchOrderSnapshot(orderId);
    if (!root.isConnected) return;
    updateDefinitionField(root, "배송상태", valueForOrderField(order, "배송상태"));
    updateDefinitionField(root, "택배사", valueForOrderField(order, "택배사"));
    updateDefinitionField(root, "송장번호", valueForOrderField(order, "송장번호"));
    installCancelAction(root, orderId, order);
  } catch {
    // The existing app page remains usable if the enrichment lookup is unavailable.
  }
}

function hardenCheckout(root = document) {
  root.querySelectorAll('input[name="payment"][value="virtual"], input[name="payment"][value="virtual_account"]').forEach((input) => {
    input.closest(".checkout-method")?.remove();
  });

  root.querySelectorAll(".checkout-policy-card").forEach((card) => {
    const title = card.querySelector("strong")?.textContent?.trim() || "";
    if (!/입금 계좌|계좌이체/.test(title) || card.dataset.launchPaymentPolicy === "true") return;
    card.dataset.launchPaymentPolicy = "true";
    const strong = card.querySelector("strong");
    const body = card.querySelector("p");
    const caption = card.querySelector("small");
    if (strong) strong.textContent = "토스페이먼츠 결제 안내";
    if (body) body.textContent = "카드·계좌이체·간편결제는 토스페이먼츠 결제창에서 안전하게 진행됩니다.";
    if (caption) caption.textContent = `기본 배송비 ${Number(shippingPolicy.baseFee || 0).toLocaleString("ko-KR")}원 · ${MAX_DELIVERY_COPY}`;
  });

  root.querySelectorAll(".checkout-main-card, .detail-info-card, .detail-check-grid").forEach((host) => {
    if (host.querySelector("[data-max-delivery-note]")) return;
    const text = host.textContent || "";
    if (!/배송|출고/.test(text)) return;
    const note = document.createElement("p");
    note.dataset.maxDeliveryNote = "true";
    note.className = "launch-max-delivery-note";
    note.textContent = `최대 배송기간: ${shippingPolicy.maxLeadTime}. ${MAX_DELIVERY_COPY}`;
    host.appendChild(note);
  });
}

function configureAdminShippingForm(form) {
  if (!(form instanceof HTMLFormElement) || form.dataset.launchShippingBound === "true") return;
  form.dataset.launchShippingBound = "true";
  const orderNo = String(form.dataset.orderId || "").trim().toUpperCase();
  const orderStatus = form.querySelector('[name="status"]');
  const paymentStatus = form.querySelector('[name="paymentStatus"]');
  const delivery = form.querySelector('[name="delivery"]');
  if (orderStatus) {
    orderStatus.disabled = true;
    orderStatus.title = "주문상태는 결제/배송 서버 상태로 자동 관리됩니다.";
  }
  if (paymentStatus) {
    paymentStatus.disabled = true;
    paymentStatus.title = "결제상태는 토스 승인 결과로만 변경됩니다.";
  }
  if (delivery) {
    delivery.innerHTML = `
      <option value="shipping_ready">배송 준비중</option>
      <option value="shipped">배송중</option>
      <option value="delivered">배송완료</option>
    `;
  }
  const primary = document.querySelector('[data-admin-modal-action="orderDetail"]');
  if (primary) {
    primary.disabled = true;
    primary.setAttribute("aria-busy", "true");
    primary.textContent = "배송정보 확인 중…";
  }

  fetchOrderSnapshot(orderNo, { force: true })
    .then((order) => {
      if (!form.isConnected) return;
      form.dataset.orderDbId = String(order.id || "");
      form.dataset.currentShippingStatus = String(order.status || "");
      const carrier = form.querySelector('[name="trackingCompany"]');
      const tracking = form.querySelector('[name="trackingNumber"]');
      if (carrier) carrier.value = order.shippingCarrier || "";
      if (tracking) tracking.value = order.trackingNumber || "";
      if (delivery) {
        const target = ["shipping_ready", "shipped", "delivered"].includes(String(order.status))
          ? String(order.status)
          : "shipping_ready";
        delivery.value = target;
      }
      const helper = form.querySelector(".admin-modal-helper");
      if (helper) helper.textContent = "주문/결제 상태는 수정할 수 없으며 배송 준비·송장·배송완료만 서버에 저장합니다.";
      if (primary) {
        primary.disabled = false;
        primary.removeAttribute("aria-busy");
        primary.textContent = "배송정보 저장";
        primary.removeAttribute("title");
      }
    })
    .catch((error) => {
      if (primary) {
        primary.disabled = true;
        primary.removeAttribute("aria-busy");
        primary.textContent = "배송정보 저장 불가";
      }
      setInlineStatus(form, error?.message || "배송정보를 불러오지 못했습니다.", "error");
    });
}

async function saveAdminShipping(form, button) {
  const orderId = String(form.dataset.orderDbId || "").trim();
  const status = String(form.querySelector('[name="delivery"]')?.value || "").trim();
  const carrier = String(form.querySelector('[name="trackingCompany"]')?.value || "").trim();
  const trackingNumber = String(form.querySelector('[name="trackingNumber"]')?.value || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error("주문 DB 정보를 확인할 수 없습니다.");
  if (!["shipping_ready", "shipped", "delivered"].includes(status)) throw new Error("배송 상태를 확인해 주세요.");
  if (status === "shipped" && (!carrier || !/^[A-Za-z0-9-]{4,80}$/.test(trackingNumber))) {
    throw new Error("배송중 처리에는 택배사와 영문·숫자·하이픈 송장번호가 필요합니다.");
  }
  const accessToken = accessTokenFromStorage();
  if (!accessToken) throw new Error("관리자 로그인 상태를 확인해 주세요.");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "저장 중…";
  try {
    await postFunction("admin-shipping", { orderId, status, carrier, trackingNumber }, { accessToken });
    const orderNo = String(form.dataset.orderId || "").trim().toUpperCase();
    orderSnapshots.delete(orderNo);
    await fetchOrderSnapshot(orderNo, { force: true }).catch(() => undefined);
    setInlineStatus(form, "배송정보가 서버에 저장되었습니다. 목록을 새로고침합니다.", "success");
    window.setTimeout(() => location.reload(), 450);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = "배송정보 저장";
  }
}

async function cancelPayment(orderId, button) {
  const safeOrderId = String(orderId || "").trim().toUpperCase();
  if (!confirm("이 주문의 결제를 전액 취소할까요?")) return;
  const lookup = guestLookupFor(safeOrderId);
  const idempotencyKey = button.dataset.cancelIdempotencyKey || createIdempotencyKey().replace(/^order_/, "cancel_");
  button.dataset.cancelIdempotencyKey = idempotencyKey;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "취소 처리 중…";
  try {
    const result = await postFunction(
      "payment-cancel",
      {
        orderId: safeOrderId,
        reason: "고객 요청",
        ...(lookup?.lookupToken ? { guestLookupToken: lookup.lookupToken } : {}),
      },
      { accessToken: accessTokenFromStorage(), idempotencyKey }
    );
    const order = result?.order;
    if (order && typeof order === "object") orderSnapshots.set(safeOrderId, order);
    const root = button.closest(".complete-page") || document;
    updateDefinitionField(root, "주문상태", "주문 취소");
    updateDefinitionField(root, "결제상태", "환불 완료");
    button.remove();
    setInlineStatus(root.querySelector(".action-row") || root, "결제가 취소되었습니다. 결제 및 재고 상태도 서버에서 함께 반영되었습니다.", "success");
  } catch (error) {
    setInlineStatus(button, error?.message || "결제 취소를 처리하지 못했습니다.", "error");
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = "결제 취소";
  }
}

function hardenDom() {
  hardenQueued = false;
  hardenCheckout();
  document.querySelectorAll("[data-payment-retry]").forEach(decoratePaymentRetry);
  document.querySelectorAll(".complete-page").forEach((root) => hydrateOrderPage(root));
  document.querySelectorAll("[data-admin-order-detail-form]").forEach(configureAdminShippingForm);
}

function queueHardenDom() {
  if (hardenQueued) return;
  hardenQueued = true;
  queueMicrotask(hardenDom);
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const paymentButton = target.closest("[data-payment-retry]");
  if (paymentButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const orderId = String(paymentButton.dataset.paymentRetry || "").trim().toUpperCase();
    if (!preparedPayments.has(orderId)) {
      paymentButton.disabled = true;
      paymentButton.textContent = "토스 결제 준비 중…";
      primePayment(orderId)
        .then(() => {
          paymentButton.disabled = false;
          paymentButton.textContent = "토스 결제하기";
          setInlineStatus(paymentButton, "준비가 완료되었습니다. 결제 버튼을 한 번 더 눌러주세요.");
        })
        .catch((error) => setInlineStatus(paymentButton, error?.message || "결제 준비에 실패했습니다.", "error"));
      return;
    }
    try {
      paymentButton.disabled = true;
      paymentButton.setAttribute("aria-busy", "true");
      paymentButton.textContent = "토스 결제창 여는 중…";
      const request = requestPreparedPayment(orderId);
      Promise.resolve(request).catch((error) => {
        if (!paymentButton.isConnected) return;
        paymentButton.disabled = false;
        paymentButton.removeAttribute("aria-busy");
        paymentButton.textContent = "토스 결제하기";
        setInlineStatus(paymentButton, error?.message || "토스 결제창을 열지 못했습니다.", "error");
      });
    } catch (error) {
      paymentButton.disabled = false;
      paymentButton.removeAttribute("aria-busy");
      paymentButton.textContent = "토스 결제하기";
      setInlineStatus(paymentButton, error?.message || "토스 결제창을 열지 못했습니다.", "error");
    }
    return;
  }

  const copyToken = target.closest("[data-copy-guest-order-token]");
  if (copyToken) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const lookup = guestLookupFor(String(copyToken.dataset.copyGuestOrderToken || "").toUpperCase());
    if (!lookup?.lookupToken) return;
    navigator.clipboard?.writeText(lookup.lookupToken)
      .then(() => setInlineStatus(copyToken, "비회원 주문 조회 토큰을 복사했습니다.", "success"))
      .catch(() => setInlineStatus(copyToken, "브라우저에서 클립보드 복사를 허용해 주세요.", "error"));
    return;
  }

  const cancelButton = target.closest("[data-payment-cancel-order]");
  if (cancelButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelPayment(cancelButton.dataset.paymentCancelOrder, cancelButton);
    return;
  }

  const adminSave = target.closest('[data-admin-modal-action="orderDetail"]');
  if (adminSave) {
    const form = document.querySelector("[data-admin-order-detail-form]");
    if (!form || !form.dataset.orderDbId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    saveAdminShipping(form, adminSave).catch((error) => {
      setInlineStatus(form, error?.message || "배송정보를 저장하지 못했습니다.", "error");
      adminSave.disabled = false;
      adminSave.removeAttribute("aria-busy");
      adminSave.textContent = "배송정보 저장";
    });
  }
}, true);

new MutationObserver(queueHardenDom).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("hashchange", queueHardenDom);
window.addEventListener("pageshow", queueHardenDom);
queueHardenDom();
