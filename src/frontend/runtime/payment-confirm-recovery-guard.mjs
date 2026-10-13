import { pendingTossConfirmation } from "../payments/toss-client.mjs";

function safeOrderId(value) {
  const orderId = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9_-]{6,64}$/.test(orderId) ? orderId : "";
}

function recoveryLocation(pending) {
  const params = new URLSearchParams({
    payment: "success",
    paymentKey: pending.paymentKey,
    orderId: pending.orderId,
    amount: String(pending.amount),
  });
  return `/?${params}#/payment/success`;
}

function currentOrderRouteId() {
  const raw = String(location.hash || "").replace(/^#/, "").split("?", 1)[0];
  const match = raw.match(/^\/order\/([A-Z0-9_-]{6,64})$/i);
  return safeOrderId(match?.[1]);
}

function replaceWithRecoveryButton(button) {
  if (!(button instanceof HTMLButtonElement)) return;
  const orderId = safeOrderId(button.dataset.paymentRetry);
  if (!orderId) return;
  const pending = pendingTossConfirmation(orderId, globalThis.sessionStorage);
  if (!pending) return;

  // launch-hardening owns [data-payment-retry] for a genuinely payment-ready
  // order and primes a new Toss checkout. That behavior is unsafe after an
  // ambiguous payment-confirm result because the order can already be charged
  // or payment_auth_started. Replace the node and remove that selector entirely
  // so any in-flight primePayment callbacks still reference the detached old
  // node, while this button becomes confirmation-recovery-only authority.
  const replacement = button.cloneNode(true);
  replacement.removeAttribute("data-payment-retry");
  replacement.removeAttribute("data-launch-payment-bound");
  replacement.dataset.paymentConfirmRecovery = orderId;
  replacement.disabled = false;
  replacement.removeAttribute("aria-busy");
  replacement.textContent = "결제 결과 다시 확인";
  button.replaceWith(replacement);
}

function ensureOrderRouteRecoveryButton(root = document) {
  const orderId = currentOrderRouteId();
  if (!orderId) return;
  const pending = pendingTossConfirmation(orderId, globalThis.sessionStorage);
  if (!pending) return;
  // safeOrderId restricts the value to selector-safe ASCII.
  if (root.querySelector?.(`[data-payment-confirm-recovery="${orderId}"]`)) return;

  // An expired authenticated session can send the customer through login before
  // they revisit the order. app.js does not normally render a payment button for
  // payment_auth_started, so make the preserved confirmation tuple reachable
  // again from the authoritative order screen after re-authentication.
  const actions = root.querySelector?.(".complete-page .action-row, .payment-return-page .complete-actions");
  if (!actions) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary-btn";
  button.dataset.paymentConfirmRecovery = orderId;
  button.textContent = "결제 결과 다시 확인";
  actions.prepend(button);
}

function reconcileRecoveryButtons(root = document) {
  root.querySelectorAll?.("[data-payment-retry]").forEach(replaceWithRecoveryButton);
  ensureOrderRouteRecoveryButton(root);
}

let queued = false;
function queueReconcile() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    reconcileRecoveryButtons(document);
  });
}

document.addEventListener("click", (event) => {
  const button = event.target instanceof Element
    ? event.target.closest("[data-payment-confirm-recovery]")
    : null;
  if (!button) return;
  const orderId = safeOrderId(button.dataset.paymentConfirmRecovery);
  const pending = pendingTossConfirmation(orderId, globalThis.sessionStorage);
  if (!pending) {
    button.disabled = true;
    button.textContent = "다시 확인할 승인 정보가 없습니다";
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "결제 결과 확인 중…";
  location.assign(recoveryLocation(pending));
}, true);

new MutationObserver(queueReconcile).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("hashchange", queueReconcile);
window.addEventListener("pageshow", queueReconcile);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", queueReconcile, { once: true });
else queueReconcile();
