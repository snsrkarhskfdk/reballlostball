import { loadGuestLookupSession } from "../core/storage.mjs";
import { lookupGuestOrderRequest, normalizeServerOrder } from "../commerce/order-client.mjs";
import { escapeHtml } from "../ui/components.mjs";
import {
  translateDeliveryStatus,
  translateOrderStatus,
  translatePaymentStatus,
} from "../account/presentation.mjs";
import { formatOrderDateTime, orderCompletionCopy } from "../account/order-summary.mjs";

const metaConfig = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
const SUPABASE_URL = metaConfig("reball-supabase-url").replace(/\/$/, "");
const SUPABASE_KEY = metaConfig("reball-supabase-publishable-key");
const inFlight = new Map();
let queued = false;

function currentOrderId() {
  const match = String(location.hash || "").match(/^#\/order\/([A-Za-z0-9_-]{6,64})(?:[/?#]|$)/);
  return match ? decodeURIComponent(match[1]).trim().toUpperCase() : "";
}

function missingOrderCard(orderId) {
  if (!orderId) return null;
  const heading = [...document.querySelectorAll("#app .empty-card h1")]
    .find((node) => node.textContent.trim() === "주문을 찾을 수 없습니다.");
  return heading?.closest(".empty-card") || null;
}

function iconCheck() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>`;
}

function tokenNotice(orderId, lookupToken) {
  const last = String(lookupToken || "").slice(-6);
  return `
    <aside class="order-lookup-token" data-launch-token-masked="true" aria-label="비회원 주문 조회 정보">
      <strong>비회원 주문 조회 토큰</strong>
      <code>••••••••••••${escapeHtml(last)}</code>
      <button type="button" class="secondary-btn compact" data-copy-guest-order-token="${escapeHtml(orderId)}">조회 토큰 복사</button>
      <span>조회 토큰은 화면에 전체 노출하지 않습니다. 필요할 때 복사해 안전한 곳에 보관하세요.</span>
    </aside>`;
}

function renderRecoveredOrder(card, order, lookupToken) {
  const orderStatus = translateOrderStatus(order.status);
  const paymentStatus = translatePaymentStatus(order.paymentStatus);
  const deliveryStatus = order.delivery === "배송 준비 전"
    ? order.delivery
    : translateDeliveryStatus(order.delivery || order.status);
  const copy = orderCompletionCopy(orderStatus, paymentStatus);
  const retryable = ["payment_ready", "ready", "결제 대기"].includes(
    String(order.paymentStatus || order.status || "").toLowerCase()
  );
  const customerName = String(order.customer?.name || "고객");
  const formattedDate = formatOrderDateTime(order.date);

  const section = document.createElement("section");
  section.className = "complete-page";
  section.dataset.guestOrderRecovered = order.id;
  section.innerHTML = `
    <div class="complete-icon">${iconCheck()}</div>
    <h1>${escapeHtml(copy.title)}</h1>
    <p>${escapeHtml(copy.body || `${customerName}님의 주문은 ${paymentStatus} 상태입니다.`)}</p>
    <dl>
      <div><dt>주문번호</dt><dd>${escapeHtml(order.id)}</dd></div>
      <div><dt>주문일</dt><dd>${escapeHtml(formattedDate)}</dd></div>
      <div><dt>주문상태</dt><dd>${escapeHtml(orderStatus)}</dd></div>
      <div><dt>결제상태</dt><dd>${escapeHtml(paymentStatus)}</dd></div>
      <div><dt>배송상태</dt><dd>${escapeHtml(deliveryStatus)}</dd></div>
      <div><dt>택배사</dt><dd>${escapeHtml(order.shippingCarrier || "아직 등록되지 않았습니다.")}</dd></div>
      <div><dt>송장번호</dt><dd>${escapeHtml(order.trackingNumber || "아직 등록되지 않았습니다.")}</dd></div>
      <div><dt>결제금액</dt><dd>₩${Number(order.total || 0).toLocaleString("ko-KR")}</dd></div>
    </dl>
    ${tokenNotice(order.id, lookupToken)}
    <p class="order-privacy-note">비회원 주문조회는 주문번호와 주문 생성 시 발급된 무작위 조회 토큰으로만 확인할 수 있습니다.</p>
    <div class="action-row center">
      ${retryable ? `<button class="primary-btn" type="button" data-payment-retry="${escapeHtml(order.id)}">결제 다시 시도</button>` : ""}
      <a class="primary-btn" href="#/mypage">주문내역 보기</a>
      <a class="secondary-btn" href="#/">메인으로 이동</a>
    </div>`;
  card.replaceWith(section);
}

async function recover(orderId, card, lookup) {
  if (!lookup?.lookupToken) return;
  if (inFlight.has(orderId)) return inFlight.get(orderId);
  card.dataset.guestOrderRecovery = "loading";
  const heading = card.querySelector("h1");
  if (heading) heading.textContent = "주문 정보를 다시 불러오는 중입니다.";

  const promise = lookupGuestOrderRequest(
    { baseUrl: SUPABASE_URL || location.origin, anonKey: SUPABASE_KEY },
    { orderId, lookupToken: lookup.lookupToken }
  ).then((payload) => {
    if (currentOrderId() !== orderId) return;
    const order = normalizeServerOrder(payload);
    if (!order || order.id !== orderId) throw new Error("주문 정보를 확인할 수 없습니다.");
    if (card?.isConnected) renderRecoveredOrder(card, order, lookup.lookupToken);
  }).catch(() => {
    if (!card.isConnected) return;
    card.dataset.guestOrderRecovery = "failed";
    const currentHeading = card.querySelector("h1");
    if (currentHeading) currentHeading.textContent = "주문을 찾을 수 없습니다.";
  }).finally(() => inFlight.delete(orderId));

  inFlight.set(orderId, promise);
  return promise;
}

function inspect() {
  queued = false;
  const orderId = currentOrderId();
  if (!orderId) return;
  const card = missingOrderCard(orderId);
  if (!card || ["loading", "failed"].includes(card.dataset.guestOrderRecovery || "")) return;
  const lookup = loadGuestLookupSession(globalThis.sessionStorage);
  if (!lookup || String(lookup.orderId || "").toUpperCase() !== orderId || !lookup.lookupToken) return;
  recover(orderId, card, lookup);
}

function queueInspect() {
  if (queued) return;
  queued = true;
  queueMicrotask(inspect);
}

new MutationObserver(queueInspect).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("hashchange", queueInspect);
window.addEventListener("pageshow", queueInspect);
queueInspect();
