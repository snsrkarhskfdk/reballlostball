import { defaultCoupons, noticeItems } from "../catalog/content.mjs";
import { checkLoginIdAvailability } from "../auth/login-id-client.mjs";
import { resetCaptchaControl } from "../auth/captcha-client.mjs";
import { PENDING_ORDER_ATTEMPT_SESSION_KEY } from "../core/storage.mjs";
import { pendingTossConfirmation } from "../payments/toss-client.mjs";

const RETIRED_PROMO_MESSAGE = "현재 운영 중인 신규회원 할인 쿠폰은 없습니다. 새 혜택은 공지사항에서 별도로 안내합니다.";
const EDGE_TIMEOUT_MS = 15_000;
const CAPTCHA_CONSUMING_AUTH_PATHS = [
  "/functions/v1/signup-with-login-id",
  "/functions/v1/login-with-identifier",
  "/functions/v1/auth-assist",
];
const DEFERRED_MY_TABS = new Set([
  "points", "coupons", "receipts", "recent", "posts", "inquiry", "inquiries", "reviews", "review-write", "payments", "notifications",
]);
let patchQueued = false;

function metaContent(name) {
  return document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
}

function retireExpiredWelcomePromotion() {
  defaultCoupons.splice(0, defaultCoupons.length, {
    id: "NO_ACTIVE_SIGNUP_PROMO", title: "신규회원 할인 미운영", benefit: "현재 적용 가능한 할인 없음", benefitAmount: 0, period: "", status: "미운영", useCount: 0,
  });
  for (let index = noticeItems.length - 1; index >= 0; index -= 1) {
    const notice = noticeItems[index];
    if (/3,?000원|WELCOME3000|신규 회원.*쿠폰/i.test(`${notice?.title || ""} ${notice?.body || ""}`)) noticeItems.splice(index, 1);
  }
  try { localStorage.setItem("reball.coupons", "[]"); } catch {}
}

function requestMethod(input, init) {
  return String(init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
}

function consumesAuthCaptcha(url) {
  return CAPTCHA_CONSUMING_AUTH_PATHS.some((path) => url.includes(path));
}

async function resetRenderedAuthCaptchas() {
  const controls = [...document.querySelectorAll("form [data-captcha-control]")];
  await Promise.all(controls.map((control) => resetCaptchaControl(control, document).catch(() => false)));
}

function safeIdempotencyKey(value) {
  const key = String(value || "").trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(key) ? key : "";
}

function decodeJwtSubject(token) {
  try {
    const payloadSegment = String(token || "").split(".")[1] || "";
    if (!payloadSegment) return "";
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    const subject = String(payload?.sub || "").trim().toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(subject) ? subject : "";
  } catch {
    return "";
  }
}

function orderActorMarker(headers) {
  const authorization = String(headers?.get?.("Authorization") || "").trim();
  if (!authorization) return "guest";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const subject = decodeJwtSubject(token);
  return subject ? `user:${subject}` : "authenticated";
}

function safeActorMarker(value, legacyAuthenticated = false) {
  const marker = String(value || "").trim().toLowerCase();
  if (marker === "guest" || marker === "authenticated" || /^user:[0-9a-f-]{36}$/.test(marker)) return marker;
  return legacyAuthenticated ? "authenticated" : "guest";
}

function loadPendingOrderAttempt() {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_ORDER_ATTEMPT_SESSION_KEY) || "null");
    const idempotencyKey = safeIdempotencyKey(value?.idempotencyKey);
    if (!idempotencyKey) return null;
    return {
      idempotencyKey,
      actorMarker: safeActorMarker(value?.actorMarker, value?.authenticated === true),
      serverAccepted: value?.serverAccepted === true,
      createdAt: Number(value?.createdAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

function savePendingOrderAttempt(attempt) {
  try {
    const idempotencyKey = safeIdempotencyKey(attempt?.idempotencyKey);
    if (!idempotencyKey) return false;
    sessionStorage.setItem(PENDING_ORDER_ATTEMPT_SESSION_KEY, JSON.stringify({
      idempotencyKey,
      actorMarker: safeActorMarker(attempt?.actorMarker),
      serverAccepted: attempt?.serverAccepted === true,
      createdAt: Number(attempt?.createdAt) || Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

function clearPendingOrderAttempt() {
  try { sessionStorage.removeItem(PENDING_ORDER_ATTEMPT_SESSION_KEY); } catch {}
}

function markPendingOrderAccepted() {
  const pending = loadPendingOrderAttempt();
  if (!pending) return;
  savePendingOrderAttempt({ ...pending, serverAccepted: true });
}

function isDefinitiveCreateOrderRejection(response) {
  const status = Number(response?.status) || 0;
  return status >= 400 && status < 500 && ![401, 403, 408, 409, 425, 429].includes(status);
}

function startNewActorAttempt(incomingKey, actorMarker, init, headers) {
  clearPendingOrderAttempt();
  savePendingOrderAttempt({
    idempotencyKey: incomingKey,
    actorMarker,
    serverAccepted: false,
    createdAt: Date.now(),
  });
  headers.set("Idempotency-Key", incomingKey);
  return { ...init, headers };
}

function stabilizeCreateOrderRequest(url, method, init) {
  if (method !== "POST" || !url.includes("/functions/v1/create-order")) return init;
  const headers = new Headers(init?.headers || {});
  const incomingKey = safeIdempotencyKey(headers.get("Idempotency-Key"));
  if (!incomingKey) return init;
  const actorMarker = orderActorMarker(headers);
  const pending = loadPendingOrderAttempt();

  if (pending) {
    if (pending.actorMarker !== actorMarker) {
      const proceed = typeof globalThis.confirm === "function" && globalThis.confirm(
        "이전 로그인 상태의 주문 접수 시도가 아직 남아 있습니다. 새 계정으로 새 주문을 시작하면 이전 주문이 별도로 존재할 수 있습니다. 그래도 새 주문을 시작할까요?"
      );
      if (!proceed) {
        const error = new Error("이전 주문 시도를 유지했습니다. 같은 계정으로 복구하거나 새 주문 시작을 다시 승인해 주세요.");
        error.code = "PENDING_ORDER_ACTOR_MISMATCH";
        throw error;
      }
      // Payment cannot start until create-order returns successfully, so an
      // abandoned create attempt cannot already contain a charge. It may have
      // produced an unpaid reservation under the previous actor, which expires
      // independently. Never reuse its idempotency key for the new actor.
      return startNewActorAttempt(incomingKey, actorMarker, init, headers);
    }
    headers.set("Idempotency-Key", pending.idempotencyKey);
    return { ...init, headers };
  }

  savePendingOrderAttempt({
    idempotencyKey: incomingKey,
    actorMarker,
    serverAccepted: false,
    createdAt: Date.now(),
  });
  headers.set("Idempotency-Key", incomingKey);
  return { ...init, headers };
}

function installEdgeRequestTimeout() {
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (!nativeFetch || globalThis.__reballEdgeTimeoutInstalled) return;
  globalThis.__reballEdgeTimeoutInstalled = true;

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : String(input?.url || "");
    const method = requestMethod(input, init);
    const isPaymentConfirm = url.includes("/functions/v1/payment-confirm");
    const isCreateOrder = method === "POST" && url.includes("/functions/v1/create-order");
    const stabilizedInit = isCreateOrder ? stabilizeCreateOrderRequest(url, method, init) : init;
    const shouldTimeout = url.includes("/functions/v1/") && method === "GET" && !isPaymentConfirm && !stabilizedInit?.signal;
    const controller = shouldTimeout ? new AbortController() : null;
    const timer = controller ? globalThis.setTimeout(() => controller.abort(new DOMException("요청 시간이 초과되었습니다.", "TimeoutError")), EDGE_TIMEOUT_MS) : 0;
    try {
      const response = await nativeFetch(input, controller ? { ...stabilizedInit, signal: controller.signal } : stabilizedInit);
      if (isCreateOrder) {
        if (response.ok) markPendingOrderAccepted();
        else if (isDefinitiveCreateOrderRejection(response)) clearPendingOrderAttempt();
      }
      return response;
    } finally {
      if (timer) globalThis.clearTimeout(timer);
      if (consumesAuthCaptcha(url)) await resetRenderedAuthCaptchas();
    }
  };
}

function normalizedHashRoute(hash = location.hash) {
  const raw = String(hash || "").replace(/^#/, "");
  return raw.split("?", 1)[0].split("#", 1)[0];
}

function finalizeAcceptedOrderAttemptOnRoute() {
  const pending = loadPendingOrderAttempt();
  if (!pending?.serverAccepted) return;
  if (/^\/order\/[A-Z0-9_-]{6,64}$/i.test(normalizedHashRoute())) clearPendingOrderAttempt();
}

function redirectLegacyAdmin() {
  const route = normalizedHashRoute();
  if (route === "/admin" || route.startsWith("/admin/")) {
    location.replace("/store-manager");
    return true;
  }
  return false;
}

function retrySavedPaymentConfirmation(event) {
  const button = event.target instanceof Element ? event.target.closest("[data-payment-retry]") : null;
  if (!button) return;
  const orderId = String(button.dataset.paymentRetry || "").trim().toUpperCase();
  const pending = pendingTossConfirmation(orderId, globalThis.sessionStorage);
  if (!pending) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const params = new URLSearchParams({ payment: "success", paymentKey: pending.paymentKey, orderId: pending.orderId, amount: String(pending.amount) });
  location.assign(`/?${params}#/payment/success`);
}

function setSignupCheckMessage(message, status = "idle") {
  const node = document.querySelector("[data-login-id-message]");
  if (!node) return;
  if (node.textContent !== message) node.textContent = message;
  if (node.dataset.status !== status) node.dataset.status = status;
}

async function handleServerLoginIdCheck(event) {
  const button = event.target instanceof Element ? event.target.closest("[data-login-id-check]") : null;
  if (!button) return;
  const input = document.querySelector("[data-signup-login-id]");
  const loginId = String(input?.value || "").trim().toLowerCase();
  if (button.dataset.serverAuthorityPass === loginId) {
    delete button.dataset.serverAuthorityPass;
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!/^[a-z0-9][a-z0-9._-]{3,19}$/.test(loginId)) {
    setSignupCheckMessage("아이디는 영문 소문자 또는 숫자로 시작하고, 영문/숫자/./_/- 조합 4~20자로 입력하세요.", "error");
    input?.focus();
    return;
  }
  const form = button.closest("form");
  const captchaControl = form?.querySelector("[data-captcha-control]");
  const captchaToken = String(form?.querySelector("[data-captcha-token]")?.value || "").trim();
  if (!captchaToken) {
    setSignupCheckMessage("아이디 중복확인 전에 자동입력 방지 확인을 완료해 주세요.", "error");
    captchaControl?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    return;
  }
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  setSignupCheckMessage("서버에서 아이디 사용 가능 여부를 확인하고 있습니다.", "checking");
  let result = null;
  let resetReady = false;
  try {
    result = await checkLoginIdAvailability(
      { baseUrl: metaContent("reball-supabase-url"), anonKey: metaContent("reball-supabase-publishable-key") },
      { loginId, captchaToken }
    );
  } catch (error) {
    setSignupCheckMessage(error?.message || "아이디 중복확인을 완료하지 못했습니다.", "error");
  } finally {
    resetReady = await resetCaptchaControl(captchaControl, document).catch(() => false);
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
  if (!result) return;
  if (!result.available) {
    setSignupCheckMessage("이미 사용 중인 아이디입니다. 다른 아이디를 입력하고 자동입력 방지를 다시 확인해 주세요.", "taken");
    return;
  }
  if (!resetReady) {
    setSignupCheckMessage("아이디는 사용할 수 있지만 자동입력 방지 확인을 새로 발급하지 못했습니다. 다시 확인해 주세요.", "error");
    return;
  }
  button.dataset.serverAuthorityPass = loginId;
  button.click();
}

function removeDeferredCustomerActions(root = document) {
  root.querySelectorAll("[data-my-tab]").forEach((node) => { if (DEFERRED_MY_TABS.has(node.dataset.myTab)) node.remove(); });
  root.querySelectorAll([
    "[data-social-signup]", "[data-return-request]", "[data-return-order]", "[data-review-order]", "[data-seller-question]", "[data-post-delete]",
    "[data-notification-toggle]", "[data-print-receipt]", "[data-coupon-form]", ".signup-benefit-banner", ".signup-coupon-note", ".login-social-stack", ".social-signup-row",
  ].join(",")).forEach((node) => node.remove());
  root.querySelectorAll(".signup-choice-header").forEach((header) => {
    if (header.querySelector("h1")?.textContent?.trim() !== "회원가입") return;
    const lead = header.querySelector("p");
    const sub = header.querySelector("span");
    const leadCopy = "리볼회원으로 주문과 배송지를 안전하게 관리하세요.";
    const subCopy = "현재는 이메일 인증 기반 ID/PW 회원가입을 제공합니다.";
    if (lead && lead.textContent !== leadCopy) lead.textContent = leadCopy;
    if (sub && sub.textContent !== subCopy) sub.textContent = subCopy;
  });
  root.querySelectorAll(".signup-divider").forEach((divider) => {
    const parent = divider.parentElement;
    if (!parent?.querySelector("[data-social-signup]") && !parent?.querySelector(".login-social-stack")) divider.remove();
  });
}

function patchAdminLinks(root = document) {
  root.querySelectorAll('a[href="#/admin"], a[href="/#/admin"]').forEach((anchor) => {
    anchor.href = "/store-manager";
    anchor.removeAttribute("data-route");
  });
}

function patchPromotionCopy(root = document) {
  root.querySelectorAll(".consult-chip-row [data-consult-question]").forEach((node) => { if (/쿠폰|혜택/.test(node.textContent || "")) node.remove(); });
  root.querySelectorAll(".consult-message--assistant p, .coupon-card").forEach((node) => {
    const text = node.textContent || "";
    if (/신규.*쿠폰|회원가입.*3,?000원|WELCOME3000|신규 리볼회원 가입 시/.test(text)) {
      if (node.matches(".coupon-card")) node.remove();
      else if (node.textContent !== RETIRED_PROMO_MESSAGE) node.textContent = RETIRED_PROMO_MESSAGE;
    }
  });
  root.querySelectorAll("[data-payment-retry]").forEach((button) => {
    const orderId = String(button.dataset.paymentRetry || "").trim().toUpperCase();
    if (pendingTossConfirmation(orderId, globalThis.sessionStorage) && button.textContent !== "결제 결과 다시 확인") {
      button.textContent = "결제 결과 다시 확인";
    }
  });
}

function patchReleaseDom(root = document) {
  removeDeferredCustomerActions(root);
  patchAdminLinks(root);
  patchPromotionCopy(root);
}

function scheduleReleasePatch() {
  if (patchQueued) return;
  patchQueued = true;
  queueMicrotask(() => {
    patchQueued = false;
    patchReleaseDom(document);
  });
}

retireExpiredWelcomePromotion();
installEdgeRequestTimeout();
redirectLegacyAdmin();
finalizeAcceptedOrderAttemptOnRoute();
document.addEventListener("click", retrySavedPaymentConfirmation, true);
document.addEventListener("click", handleServerLoginIdCheck, true);
window.addEventListener("hashchange", () => {
  redirectLegacyAdmin();
  finalizeAcceptedOrderAttemptOnRoute();
});
const observer = new MutationObserver(scheduleReleasePatch);
observer.observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleReleasePatch, { once: true });
else scheduleReleasePatch();
