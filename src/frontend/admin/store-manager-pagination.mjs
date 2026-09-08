const ADMIN_TIMEOUT_MS = 15_000;
const DEFAULT_PAGE_SIZE = 50;
const scopes = {
  orders: { page: 1, pageSize: DEFAULT_PAGE_SIZE, hasMore: false },
  shipping: { page: 1, pageSize: DEFAULT_PAGE_SIZE, hasMore: false },
};

const PAGER_CONFIG = {
  orders: {
    panel: '[data-panel="orders"]',
    list: "[data-all-order-list]",
    reload: "[data-reload-all-orders]",
    pager: "data-order-pager",
    prev: "data-order-page-prev",
    next: "data-order-page-next",
    label: "data-order-page-label",
  },
  shipping: {
    panel: '[data-panel="shipping"]',
    list: "[data-shipping-list]",
    reload: "[data-reload-shipping]",
    pager: "data-shipping-pager",
    prev: "data-shipping-page-prev",
    next: "data-shipping-page-next",
    label: "data-shipping-page-label",
  },
};

function isOrdersViewUrl(url) {
  try {
    const parsed = new URL(String(url), location.origin);
    return parsed.pathname.endsWith("/functions/v1/admin-console") && parsed.searchParams.get("view") === "orders";
  } catch {
    return false;
  }
}

function activeOrdersScope() {
  const shippingPanel = document.querySelector(PAGER_CONFIG.shipping.panel);
  if (shippingPanel && !shippingPanel.hidden) return "shipping";
  const ordersPanel = document.querySelector(PAGER_CONFIG.orders.panel);
  if (ordersPanel && !ordersPanel.hidden) return "orders";
  return "";
}

function paginatedOrdersUrl(url, scope) {
  const parsed = new URL(String(url), location.origin);
  const state = scopes[scope];
  parsed.pathname = parsed.pathname.replace(/\/admin-console$/, "/admin-orders-page");
  parsed.search = "";
  parsed.searchParams.set("scope", scope);
  parsed.searchParams.set("page", String(state.page));
  parsed.searchParams.set("pageSize", String(state.pageSize));
  return parsed.toString();
}

function installAdminFetchBoundary() {
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (!nativeFetch || globalThis.__reballStoreManagerFetchBoundary) return;
  globalThis.__reballStoreManagerFetchBoundary = true;

  globalThis.fetch = async (input, init = {}) => {
    const originalUrl = typeof input === "string" || input instanceof URL ? String(input) : String(input?.url || "");
    const scope = isOrdersViewUrl(originalUrl) ? activeOrdersScope() : "";
    const targetUrl = scope ? paginatedOrdersUrl(originalUrl, scope) : originalUrl;
    const shouldTimeout = targetUrl.includes("/functions/v1/") && !init?.signal;
    const controller = shouldTimeout ? new AbortController() : null;
    const timer = controller
      ? globalThis.setTimeout(
          () => controller.abort(new DOMException("관리자 요청 시간이 초과되었습니다.", "TimeoutError")),
          ADMIN_TIMEOUT_MS
        )
      : 0;

    try {
      const requestInput = targetUrl !== originalUrl && typeof input !== "string" && !(input instanceof URL)
        ? new Request(targetUrl, input)
        : targetUrl !== originalUrl ? targetUrl : input;
      const response = await nativeFetch(requestInput, controller ? { ...init, signal: controller.signal } : init);
      if (scope && response.ok) {
        response.clone().json().then((payload) => {
          const state = scopes[scope];
          state.page = Math.max(1, Number(payload?.page) || state.page);
          state.pageSize = Math.max(20, Number(payload?.pageSize) || state.pageSize);
          state.hasMore = payload?.hasMore === true;
          window.dispatchEvent(new CustomEvent("reball:order-pagination", {
            detail: { scope, page: state.page, pageSize: state.pageSize, hasMore: state.hasMore },
          }));
        }).catch(() => undefined);
      }
      return response;
    } catch (error) {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") {
        throw new Error("관리자 서버 연결 시간이 초과되었습니다. 새로고침 후 다시 시도해 주세요.");
      }
      throw error;
    } finally {
      if (timer) globalThis.clearTimeout(timer);
    }
  };
}

function ensurePagerStyles() {
  if (document.querySelector("[data-order-pager-style]")) return;
  const style = document.createElement("style");
  style.dataset.orderPagerStyle = "true";
  style.textContent = `
    .sm-order-pager{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin:12px 0 16px}.sm-order-pager span{min-width:150px;text-align:center;font-size:13px;color:#5f6b64}.sm-order-pager button:disabled{opacity:.42;cursor:not-allowed}
  `;
  document.head.appendChild(style);
}

function pagerNode(scope) {
  return document.querySelector(`[${PAGER_CONFIG[scope].pager}]`);
}

function reloadScope(scope) {
  document.querySelector(PAGER_CONFIG[scope].reload)?.click();
}

function ensurePager(scope) {
  const config = PAGER_CONFIG[scope];
  const panel = document.querySelector(config.panel);
  const list = panel?.querySelector(config.list);
  if (!panel || !list) return;
  ensurePagerStyles();

  let pager = panel.querySelector(`[${config.pager}]`);
  if (!pager) {
    pager = document.createElement("div");
    pager.className = "sm-order-pager";
    pager.setAttribute(config.pager, "true");
    pager.innerHTML = `
      <button class="sm-button sm-button--ghost" type="button" ${config.prev}>이전</button>
      <span ${config.label}></span>
      <button class="sm-button sm-button--ghost" type="button" ${config.next}>다음</button>
    `;
    list.before(pager);
    pager.querySelector(`[${config.prev}]`)?.addEventListener("click", () => {
      const state = scopes[scope];
      if (state.page <= 1) return;
      state.page -= 1;
      reloadScope(scope);
      updatePager(scope);
    });
    pager.querySelector(`[${config.next}]`)?.addEventListener("click", () => {
      const state = scopes[scope];
      if (!state.hasMore) return;
      state.page += 1;
      reloadScope(scope);
      updatePager(scope);
    });
  }
  updatePager(scope);
}

function updatePager(scope) {
  const config = PAGER_CONFIG[scope];
  const state = scopes[scope];
  const pager = pagerNode(scope);
  if (!pager) return;
  const label = pager.querySelector(`[${config.label}]`);
  const previous = pager.querySelector(`[${config.prev}]`);
  const next = pager.querySelector(`[${config.next}]`);
  if (label) label.textContent = `${state.page} 페이지 · ${state.pageSize}건씩`;
  if (previous) previous.disabled = state.page <= 1;
  if (next) next.disabled = !state.hasMore;
}

function resetScopeToFirstPage(scope, { reload = false } = {}) {
  const state = scopes[scope];
  const changed = state.page !== 1 || state.hasMore;
  state.page = 1;
  state.hasMore = false;
  updatePager(scope);
  if (reload && changed) reloadScope(scope);
}

installAdminFetchBoundary();

window.addEventListener("reball:order-pagination", (event) => {
  const scope = event?.detail?.scope === "shipping" ? "shipping" : "orders";
  ensurePager(scope);
  updatePager(scope);
});

document.addEventListener("click", (event) => {
  const tab = event.target instanceof Element ? event.target.closest("[data-tab]") : null;
  if (!tab) return;
  if (tab.dataset.tab === "orders") ensurePager("orders");
  if (tab.dataset.tab === "shipping") ensurePager("shipping");
});

document.addEventListener("input", (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.matches("[data-orders-search]")) {
    resetScopeToFirstPage("orders", { reload: true });
  }
  if (event.target.matches("[data-shipping-search]")) {
    resetScopeToFirstPage("shipping", { reload: true });
  }
});

document.addEventListener("change", (event) => {
  if (event.target instanceof Element && event.target.matches("[data-order-status-filter]")) {
    resetScopeToFirstPage("orders", { reload: true });
  }
});

const observer = new MutationObserver(() => {
  ensurePager("orders");
  ensurePager("shipping");
});
observer.observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    ensurePager("orders");
    ensurePager("shipping");
  }, { once: true });
} else {
  ensurePager("orders");
  ensurePager("shipping");
}
