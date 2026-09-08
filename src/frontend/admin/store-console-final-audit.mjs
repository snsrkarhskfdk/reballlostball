import "./store-console-extra.mjs";
import "./store-console-extra-guard.mjs";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm";

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
const SUPABASE_URL = meta("reball-supabase-url").replace(/\/$/, "");
const SUPABASE_KEY = meta("reball-supabase-publishable-key");
const supabase = /^https:\/\//.test(SUPABASE_URL) && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "reballlostball.auth",
      },
    })
  : null;

const EXTRA_TAB_ROLES = {
  returns: new Set(["owner_admin", "store_manager", "cs_manager", "payments_manager"]),
  inquiries: new Set(["owner_admin", "store_manager", "cs_manager"]),
  reviews: new Set(["owner_admin", "cs_manager"]),
  promo: new Set(["owner_admin", "payments_manager"]),
  pos: new Set(["owner_admin", "store_manager"]),
  settlement: new Set(["owner_admin", "payments_manager"]),
};
const PRODUCT_THRESHOLD_ROLES = new Set(["owner_admin", "store_manager", "inventory_manager"]);
const ORDER_PII_ROLES = new Set(["owner_admin", "store_manager", "cs_manager"]);
const thresholdPending = new Set();
let currentRoles = [];
let enhanceTimer = 0;
let cancelBusy = false;

function toast(message, long = false) {
  const node = document.querySelector("[data-toast]");
  if (!node) return;
  node.textContent = String(message || "처리가 완료되었습니다.");
  node.classList.add("is-open");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("is-open"), long ? 4800 : 3200);
}

async function session() {
  if (!supabase) throw new Error("운영 서버 설정을 불러오지 못했습니다.");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("로그인이 만료되었습니다.");
  return session;
}

async function edge(path, { method = "GET", body, headers = {} } = {}) {
  const active = await session();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${active.access_token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || `요청 실패 (${response.status})`);
  return payload;
}

function hasAny(allowed) {
  return currentRoles.some((role) => allowed.has(role));
}

function isPaymentOnlyOperator() {
  return currentRoles.includes("payments_manager") && !hasAny(ORDER_PII_ROLES);
}

function applyExtraTabPermissions() {
  for (const button of document.querySelectorAll("[data-extra-tab]")) {
    const allowed = EXTRA_TAB_ROLES[button.dataset.extraTab];
    const shouldHide = !allowed || !hasAny(allowed);
    if (button.hidden !== shouldHide) button.hidden = shouldHide;
  }
  const createProduct = document.querySelector("[data-product-create-extra]");
  if (createProduct) {
    const shouldHide = !(currentRoles.includes("owner_admin") || currentRoles.includes("inventory_manager"));
    if (createProduct.hidden !== shouldHide) createProduct.hidden = shouldHide;
  }
  const bannerSection = document.querySelector("[data-banner-section]");
  if (bannerSection) {
    const shouldHide = !currentRoles.includes("owner_admin");
    if (bannerSection.hidden !== shouldHide) bannerSection.hidden = shouldHide;
  }
}

function applyPaymentOnlyOrderRedactionUi() {
  if (!isPaymentOnlyOperator()) return;
  for (const card of document.querySelectorAll("[data-all-order-list] .sm-order")) {
    if (card.dataset.finalPiiRedacted === "true") continue;
    card.dataset.finalPiiRedacted = "true";
    const boxes = card.querySelectorAll(".sm-order-grid .sm-order-box");
    if (boxes[0]) boxes[0].innerHTML = "<b>고객 배송정보 비공개</b><br><span class=\"sm-muted\">결제·환불 담당자에게는 수취인·주소·연락처를 제공하지 않습니다.</span>";
    if (boxes[1]) boxes[1].innerHTML = "<b>상품 상세 비공개</b><br><span class=\"sm-muted\">결제 확인에 필요한 금액·결제상태만 표시합니다.</span>";
    card.querySelector(".sm-note-list")?.remove();
    card.querySelector(".sm-note-form")?.remove();
  }
}

async function refreshRoles() {
  if (!supabase) return;
  const { data: { session: active } } = await supabase.auth.getSession();
  if (!active?.user?.id) {
    currentRoles = [];
    applyExtraTabPermissions();
    return;
  }
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", active.user.id);
  currentRoles = error ? [] : (data || []).map((row) => row.role).filter(Boolean);
  applyExtraTabPermissions();
  applyPaymentOnlyOrderRedactionUi();
  scheduleThresholdEnhancement();
}

function patchDashboardLabels() {
  for (const span of document.querySelectorAll("[data-summary] .sm-summary-card > span")) {
    if (span.textContent?.trim() === "재고 5 이하") span.textContent = "저재고 기준 이하";
  }
}

function scheduleThresholdEnhancement() {
  clearTimeout(enhanceTimer);
  enhanceTimer = setTimeout(() => enhanceThresholdControls().catch(() => {}), 60);
}

async function enhanceThresholdControls() {
  if (!supabase || !hasAny(PRODUCT_THRESHOLD_ROLES)) return;
  const initialRows = [...document.querySelectorAll("[data-product-list] [data-variant-id]")]
    .filter((row) => {
      const id = row.dataset.variantId;
      return id && !row.querySelector("[data-final-threshold-control]") && !thresholdPending.has(id);
    });
  if (!initialRows.length) return;
  const ids = [...new Set(initialRows.map((row) => row.dataset.variantId).filter(Boolean))];
  ids.forEach((id) => thresholdPending.add(id));
  try {
    const { data, error } = await supabase
      .from("product_variants")
      .select("id,low_stock_threshold")
      .in("id", ids);
    if (error) return;
    const thresholds = new Map((data || []).map((row) => [row.id, Number(row.low_stock_threshold ?? 5)]));
    // Re-query after the async fetch. Product rerenders can replace the original
    // DOM nodes while this request is in flight.
    const currentRows = [...document.querySelectorAll("[data-product-list] [data-variant-id]")];
    for (const row of currentRows) {
      const id = row.dataset.variantId;
      if (!ids.includes(id) || row.querySelector("[data-final-threshold-control]")) continue;
      const threshold = thresholds.get(id);
      if (!Number.isSafeInteger(threshold)) continue;
      const control = document.createElement("div");
      control.className = "sm-final-threshold";
      control.dataset.finalThresholdControl = "";
      control.innerHTML = `<label class="sm-muted" for="threshold-${id}">저재고 기준</label><div class="sm-final-threshold-row"><input id="threshold-${id}" class="sm-input" data-final-threshold-input type="number" min="0" max="9999" step="1" value="${threshold}" /><button class="sm-button sm-button--small" type="button" data-final-threshold-save>기준 저장</button></div>`;
      const activeControl = row.querySelector(".sm-status-toggle");
      if (activeControl) row.insertBefore(control, activeControl);
      else row.append(control);
    }
  } finally {
    ids.forEach((id) => thresholdPending.delete(id));
  }
}

async function saveThreshold(button) {
  const row = button.closest("[data-variant-id]");
  const input = row?.querySelector("[data-final-threshold-input]");
  const value = Number(input?.value);
  if (!row?.dataset.variantId || !Number.isSafeInteger(value) || value < 0 || value > 9999) {
    return toast("저재고 기준은 0~9999의 정수로 입력하세요.");
  }
  button.disabled = true;
  try {
    await edge("admin-ops-extra", {
      method: "POST",
      body: { action: "threshold_set", payload: { variantId: row.dataset.variantId, lowStockThreshold: value } },
    });
    toast("저재고 기준을 저장했습니다.");
    document.querySelector("[data-reload-dashboard]")?.click();
  } catch (error) {
    toast(error?.message || "저재고 기준 저장에 실패했습니다.", true);
  } finally {
    button.disabled = false;
  }
}

function refundAccountFor(order) {
  const payment = order?.payment || {};
  const method = payment.method || order?.payment_method;
  const status = String(payment.status || order?.payment_status || "");
  if (method !== "virtual_account" || !new Set(["done", "partial_canceled"]).has(status)) return null;
  const bank = String(prompt("가상계좌 환불 은행코드를 입력하세요.", "") || "").trim().toUpperCase();
  if (!bank) throw new Error("환불 은행코드를 입력하세요.");
  const accountNumber = String(prompt("환불 계좌번호를 입력하세요.", "") || "").replace(/\D/g, "");
  if (!accountNumber) throw new Error("환불 계좌번호를 입력하세요.");
  const holderName = String(prompt("환불 계좌 예금주를 입력하세요.", "") || "").trim();
  if (!holderName) throw new Error("환불 계좌 예금주를 입력하세요.");
  return { bank, accountNumber, holderName };
}

async function cancelFromReturns(orderNo) {
  if (cancelBusy) return;
  cancelBusy = true;
  try {
    const orderView = await edge("admin-console?view=orders");
    const order = (orderView.orders || []).find((row) => row.order_no === orderNo);
    if (!order) throw new Error("취소할 주문을 다시 불러오지 못했습니다.");
    if (!order.canCancel) throw new Error("현재 상태에서는 결제를 취소할 수 없습니다.");
    const reason = String(prompt("결제 취소 사유를 입력하세요.", "관리자 전액 취소") || "").trim();
    if (reason.length < 2) throw new Error("취소 사유를 2자 이상 입력하세요.");
    const refundReceiveAccount = refundAccountFor(order);
    if (!confirm(`${orderNo}의 남은 승인금액을 Toss에서 전액 취소합니다. 계속할까요?`)) return;
    const idempotencyKey = `admincancel_${crypto.randomUUID().replace(/-/g, "")}`;
    await edge("payment-cancel", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        orderNo,
        reason,
        idempotencyKey,
        ...(refundReceiveAccount ? { refundReceiveAccount } : {}),
      },
    });
    toast("결제 취소를 완료했습니다.");
    document.querySelector('[data-extra-reload="returns"]')?.click();
    document.querySelector("[data-reload-all-orders]")?.click();
    document.querySelector("[data-reload-dashboard]")?.click();
  } finally {
    cancelBusy = false;
  }
}

document.addEventListener("click", (event) => {
  const cancel = event.target.closest?.("[data-extra-cancel]");
  if (cancel) {
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelFromReturns(cancel.dataset.extraCancel).catch((error) => toast(error?.message || "결제 취소에 실패했습니다.", true));
    return;
  }
  const threshold = event.target.closest?.("[data-final-threshold-save]");
  if (threshold) saveThreshold(threshold);
  const refresh = event.target.closest?.("[data-refresh-all]");
  if (refresh) {
    setTimeout(() => {
      const activeExtra = document.querySelector("[data-extra-tab].is-active");
      if (activeExtra?.dataset.extraTab) {
        document.querySelector(`[data-extra-reload="${CSS.escape(activeExtra.dataset.extraTab)}"]`)?.click();
      }
    }, 0);
  }
}, true);

const app = document.querySelector("[data-app-panel]");
const nav = document.querySelector(".sm-tabs");
const summary = document.querySelector("[data-summary]");
if (app) new MutationObserver(() => {
  applyExtraTabPermissions();
  applyPaymentOnlyOrderRedactionUi();
  scheduleThresholdEnhancement();
}).observe(app, { childList: true, subtree: true });
if (nav) new MutationObserver(applyExtraTabPermissions).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
if (summary) new MutationObserver(patchDashboardLabels).observe(summary, { childList: true, subtree: true });

patchDashboardLabels();
refreshRoles();
setTimeout(refreshRoles, 250);
setTimeout(refreshRoles, 1200);
supabase?.auth.onAuthStateChange(() => setTimeout(refreshRoles, 0));
