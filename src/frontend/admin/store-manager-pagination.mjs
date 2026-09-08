const ADMIN_TIMEOUT_MS = 15_000;
const DEFAULT_PAGE_SIZE = 50;
const scopes = {
  orders: { page: 1, pageSize: DEFAULT_PAGE_SIZE, hasMore: false, pending: false, requestSeq: 0 },
  shipping: { page: 1, pageSize: DEFAULT_PAGE_SIZE, hasMore: false, pending: false, requestSeq: 0 },
  returns: { page: 1, pageSize: DEFAULT_PAGE_SIZE, hasMore: false, pending: false, requestSeq: 0 },
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
  returns: {
    panel: '[data-panel="returns"]',
    list: "[data-extra-returns]",
    reload: '[data-extra-reload="returns"]',
    pager: "data-returns-pager",
    prev: "data-returns-page-prev",
    next: "data-returns-page-next",
    label: "data-returns-page-label",
  },
};

let filterTimer = 0;

function requestMethod(input, init) {
  return String(init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
}

function isOrdersViewUrl(url) {
  try {
    const parsed = new URL(String(url), location.origin);
    return parsed.pathname.endsWith("/functions/v1/admin-console") && parsed.searchParams.get("view") === "orders";
  } catch {
    return false;
  }
}

function activeOrdersScope() {
  for (const scope of ["returns", "shipping", "orders"]) {
    const panel = document.querySelector(PAGER_CONFIG[scope].panel);
    if (panel && !panel.hidden) return scope;
  }
  return "";
}

function normalizedFilterValue(selector, maxLength = 120) {
  return String(document.querySelector(selector)?.value || "").trim().slice(0, maxLength);
}

function paginatedOrdersUrl(url, scope) {
  const parsed = new URL(String(url), location.origin);
  const state = scopes[scope];
  parsed.pathname = parsed.pathname.replace(/\/admin-console$/, "/admin-orders-page");
  parsed.search = "";
  parsed.searchParams.set("scope", scope);
  parsed.searchParams.set("page", String(state.page));
  parsed.searchParams.set("pageSize", String(state.pageSize));
  if (scope === "orders") {
    const status = normalizedFilterValue("[data-order-status-filter]", 40);
    const query = normalizedFilterValue("[data-orders-search]");
    if (status) parsed.searchParams.set("status", status);
    if (query) parsed.searchParams.set("q", query);
  } else if (scope === "shipping") {
    const query = normalizedFilterValue("[data-shipping-search]");
    if (query) parsed.searchParams.set("q", query);
  }
  return parsed.toString();
}

function dispatchPagination(scope) {
  const state = scopes[scope];
  window.dispatchEvent(new CustomEvent("reball:order-pagination", {
    detail: {
      scope,
      page: state.page,
      pageSize: state.pageSize,
      hasMore: state.hasMore,
      pending: state.pending,
    },
  }));
}

function installAdminFetchBoundary() {
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (!nativeFetch || globalThis.__reballStoreManagerFetchBoundary) return;
  globalThis.__reballStoreManagerFetchBoundary = true;

  globalThis.fetch = async (input, init = {}) => {
    const originalUrl = typeof input === "string" || input instanceof URL ? String(input) : String(input?.url || "");
    const method = requestMethod(input, init);
    const scope = method === "GET" && isOrdersViewUrl(originalUrl) ? activeOrdersScope() : "";
    const targetUrl = scope ? paginatedOrdersUrl(originalUrl, scope) : originalUrl;
    const state = scope ? scopes[scope] : null;
    const requestSeq = state ? ++state.requestSeq : 0;
    if (state) {
      state.pending = true;
      dispatchPagination(scope);
    }

    // A generic timeout is safe only for reads. Mutations may commit after a
    // browser abort and must rely on their own idempotency/recovery instead.
    const shouldTimeout = method === "GET" && targetUrl.includes("/functions/v1/") && !init?.signal;
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
      if (state && requestSeq === state.requestSeq) {
        if (response.ok) {
          const payload = await response.clone().json().catch(() => ({}));
          state.page = Math.max(1, Number(payload?.page) || state.page);
          state.pageSize = Math.max(20, Number(payload?.pageSize) || state.pageSize);
          state.hasMore = payload?.hasMore === true;
        }
        state.pending = false;
        dispatchPagination(scope);
      }
      return response;
    } catch (error) {
      if (state && requestSeq === state.requestSeq) {
        state.pending = false;
        dispatchPagination(scope);
      }
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
      if (state.pending || state.page <= 1) return;
      state.page -= 1;
      state.pending = true;
      updatePager(scope);
      reloadScope(scope);
    });
    pager.querySelector(`[${config.next}]`)?.addEventListener("click", () => {
      const state = scopes[scope];
      if (state.pending || !state.hasMore) return;
      state.page += 1;
      state.pending = true;
      updatePager(scope);
      reloadScope(scope);
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
  const nextLabel = `${state.page} 페이지 · ${state.pageSize}건씩${state.pending ? " · 불러오는 중" : ""}`;
  if (label && label.textContent !== nextLabel) label.textContent = nextLabel;
  const previousDisabled = state.pending || state.page <= 1;
  const nextDisabled = state.pending || !state.hasMore;
  if (previous && previous.disabled !== previousDisabled) previous.disabled = previousDisabled;
  if (next && next.disabled !== nextDisabled) next.disabled = nextDisabled;
}

function resetScopeToFirstPage(scope) {
  const state = scopes[scope];
  state.page = 1;
  state.hasMore = false;
  updatePager(scope);
}

function scheduleFilteredReload(scope) {
  resetScopeToFirstPage(scope);
  globalThis.clearTimeout(filterTimer);
  filterTimer = globalThis.setTimeout(() => reloadScope(scope), 250);
}

installAdminFetchBoundary();

window.addEventListener("reball:order-pagination", (event) => {
  const requested = String(event?.detail?.scope || "");
  const scope = Object.hasOwn(scopes, requested) ? requested : "orders";
  ensurePager(scope);
});

document.addEventListener("click", (event) => {
  const tab = event.target instanceof Element ? event.target.closest("[data-tab]") : null;
  if (!tab) return;
  if (Object.hasOwn(scopes, tab.dataset.tab)) ensurePager(tab.dataset.tab);
});

document.addEventListener("input", (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.matches("[data-orders-search]")) scheduleFilteredReload("orders");
  if (event.target.matches("[data-shipping-search]")) scheduleFilteredReload("shipping");
});

document.addEventListener("change", (event) => {
  if (event.target instanceof Element && event.target.matches("[data-order-status-filter]")) {
    scheduleFilteredReload("orders");
  }
});

const observer = new MutationObserver(() => {
  for (const scope of Object.keys(scopes)) ensurePager(scope);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    for (const scope of Object.keys(scopes)) ensurePager(scope);
  }, { once: true });
} else {
  for (const scope of Object.keys(scopes)) ensurePager(scope);
}
