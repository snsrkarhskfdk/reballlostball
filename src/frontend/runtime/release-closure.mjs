import { defaultCoupons, noticeItems } from "../catalog/content.mjs";
import { checkLoginIdAvailability } from "../auth/login-id-client.mjs";
import { resetCaptchaControl } from "../auth/captcha-client.mjs";

const RETIRED_PROMO_MESSAGE = "현재 운영 중인 신규회원 할인 쿠폰은 없습니다. 새 혜택은 공지사항에서 별도로 안내합니다.";
const EDGE_TIMEOUT_MS = 15_000;
const DEFERRED_MY_TABS = new Set([
  "points",
  "coupons",
  "receipts",
  "recent",
  "posts",
  "inquiry",
  "inquiries",
  "reviews",
  "review-write",
  "payments",
  "notifications",
]);
let patchQueued = false;

function metaContent(name) {
  return document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
}

function retireExpiredWelcomePromotion() {
  // WELCOME3000 expired on 2026-06-30 and there is no active server-side
  // benefit policy. Keep a non-promotional sentinel only as an internal
  // fallback for the legacy consult answer, while forcing customer coupon
  // state to an actual empty collection before app.js initializes.
  defaultCoupons.splice(0, defaultCoupons.length, {
    id: "NO_ACTIVE_SIGNUP_PROMO",
    title: "신규회원 할인 미운영",
    benefit: "현재 적용 가능한 할인 없음",
    benefitAmount: 0,
    period: "",
    status: "미운영",
    useCount: 0,
  });
  for (let index = noticeItems.length - 1; index >= 0; index -= 1) {
    const notice = noticeItems[index];
    if (/3,?000원|WELCOME3000|신규 회원.*쿠폰/i.test(`${notice?.title || ""} ${notice?.body || ""}`)) {
      noticeItems.splice(index, 1);
    }
  }
  try {
    localStorage.setItem("reball.coupons", "[]");
  } catch {}
}

function installEdgeRequestTimeout() {
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (!nativeFetch || globalThis.__reballEdgeTimeoutInstalled) return;
  globalThis.__reballEdgeTimeoutInstalled = true;

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : String(input?.url || "");
    const isPaymentConfirm = url.includes("/functions/v1/payment-confirm");
    const shouldTimeout = url.includes("/functions/v1/") && !isPaymentConfirm && !init?.signal;
    if (!shouldTimeout) return nativeFetch(input, init);

    const controller = new AbortController();
    const timer = globalThis.setTimeout(
      () => controller.abort(new DOMException("요청 시간이 초과되었습니다.", "TimeoutError")),
      EDGE_TIMEOUT_MS
    );
    try {
      return await nativeFetch(input, { ...init, signal: controller.signal });
    } finally {
      globalThis.clearTimeout(timer);
    }
  };
}

function redirectLegacyAdmin() {
  const route = String(location.hash || "").replace(/^#/, "");
  if (route === "/admin" || route.startsWith("/admin/")) {
    location.replace("/store-manager");
    return true;
  }
  return false;
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
      {
        baseUrl: metaContent("reball-supabase-url"),
        anonKey: metaContent("reball-supabase-publishable-key"),
      },
      { loginId, captchaToken }
    );
  } catch (error) {
    setSignupCheckMessage(error?.message || "아이디 중복확인을 완료하지 못했습니다.", "error");
  } finally {
    // Turnstile/hCaptcha response tokens are single-use. Always clear and
    // reset the provider widget after the server consumes an availability
    // check, including taken-ID and error paths.
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

  // The legacy SPA owns signup state internally. Re-enter its original click
  // handler only after the server authority has returned available=true and a
  // fresh CAPTCHA challenge is ready for the eventual signup submission.
  button.dataset.serverAuthorityPass = loginId;
  button.click();
}

function removeDeferredCustomerActions(root = document) {
  root.querySelectorAll("[data-my-tab]").forEach((node) => {
    if (DEFERRED_MY_TABS.has(node.dataset.myTab)) node.remove();
  });

  root.querySelectorAll([
    "[data-social-signup]",
    "[data-return-request]",
    "[data-return-order]",
    "[data-review-order]",
    "[data-seller-question]",
    "[data-post-delete]",
    "[data-notification-toggle]",
    "[data-print-receipt]",
    "[data-coupon-form]",
    ".signup-benefit-banner",
    ".signup-coupon-note",
    ".login-social-stack",
    ".social-signup-row",
  ].join(",")).forEach((node) => node.remove());

  root.querySelectorAll(".signup-choice-header").forEach((header) => {
    const title = header.querySelector("h1")?.textContent?.trim();
    if (title !== "회원가입") return;
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
  root.querySelectorAll(".consult-chip-row [data-consult-question]").forEach((node) => {
    if (/쿠폰|혜택/.test(node.textContent || "")) node.remove();
  });
  root.querySelectorAll(".consult-message--assistant p, .coupon-card").forEach((node) => {
    const text = node.textContent || "";
    if (/신규.*쿠폰|회원가입.*3,?000원|WELCOME3000|신규 리볼회원 가입 시/.test(text)) {
      if (node.matches(".coupon-card")) node.remove();
      else if (node.textContent !== RETIRED_PROMO_MESSAGE) node.textContent = RETIRED_PROMO_MESSAGE;
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

document.addEventListener("click", handleServerLoginIdCheck, true);
window.addEventListener("hashchange", redirectLegacyAdmin);

const observer = new MutationObserver(scheduleReleasePatch);
observer.observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleReleasePatch, { once: true });
} else {
  scheduleReleasePatch();
}
