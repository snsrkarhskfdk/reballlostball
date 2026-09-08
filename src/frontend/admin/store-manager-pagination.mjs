const ADMIN_TIMEOUT_MS = 15_000;
const DEFAULT_PAGE_SIZE = 50;
let orderPage = 1;
let orderPageSize = DEFAULT_PAGE_SIZE;
let orderHasMore = false;

function isOrdersViewUrl(url) {
  try {
    const parsed = new URL(String(url), location.origin);
    return parsed.pathname.endsWith("/functions/v1/admin-console") && parsed.searchParams.get("view") === "orders";
  } catch {
    return false;
  }
}

function paginatedOrdersUrl(url) {
  const parsed = new URL(String(url), location.origin);
  parsed.pathname = parsed.pathname.replace(/\/admin-console$/, "/admin-orders-page");
  parsed.search = "";
  parsed.searchParams.set("page", String(orderPage));
  parsed.searchParams.set("pageSize", String(orderPageSize));
  return parsed.toString();
}

function installAdminFetchBoundary() {
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (!nativeFetch || globalThis.__reballStoreManagerFetchBoundary) return;
  globalThis.__reballStoreManagerFetchBoundary = true;

  globalThis.fetch = async (input, init = {}) => {
    const originalUrl = typeof input === "string" || input instanceof URL ? String(input) : String(input?.url || "");
    const targetUrl = isOrdersViewUrl(originalUrl) ? paginatedOrdersUrl(originalUrl) : originalUrl;
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
      if (isOrdersViewUrl(originalUrl) && response.ok) {
        response.clone().json().then((payload) => {
          orderPage = Math.max(1, Number(payload?.page) || orderPage);
          orderPageSize = Math.max(20, Number(payload?.pageSize) || orderPageSize);
          orderHasMore = payload?.hasMore === true;
          window.dispatchEvent(new CustomEvent("reball:order-pagination", {
            detail: { page: orderPage, pageSize: orderPageSize, hasMore: orderHasMore },
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

function ensurePager() {
  const panel = document.querySelector('[data-panel="orders"]');
  const list = panel?.querySelector("[data-all-order-list]");
  if (!panel || !list) return;
  ensurePagerStyles();

  let pager = panel.querySelector("[data-order-pager]");
  if (!pager) {
    pager = document.createElement("div");
    pager.className = "sm-order-pager";
    pager.dataset.orderPager = "true";
    pager.innerHTML = `
      <button class="sm-button sm-button--ghost" type="button" data-order-page-prev>이전</button>
      <span data-order-page-label></span>
      <button class="sm-button sm-button--ghost" type="button" data-order-page-next>다음</button>
    `;
    list.before(pager);
    pager.querySelector("[data-order-page-prev]")?.addEventListener("click", () => {
      if (orderPage <= 1) return;
      orderPage -= 1;
      document.querySelector("[data-reload-all-orders]")?.click();
      updatePager();
    });
    pager.querySelector("[data-order-page-next]")?.addEventListener("click", () => {
      if (!orderHasMore) return;
      orderPage += 1;
      document.querySelector("[data-reload-all-orders]")?.click();
      updatePager();
    });
  }
  updatePager();
}

function updatePager() {
  const pager = document.querySelector("[data-order-pager]");
  if (!pager) return;
  const label = pager.querySelector("[data-order-page-label]");
  const previous = pager.querySelector("[data-order-page-prev]");
  const next = pager.querySelector("[data-order-page-next]");
  if (label) label.textContent = `${orderPage} 페이지 · ${orderPageSize}건씩`;
  if (previous) previous.disabled = orderPage <= 1;
  if (next) next.disabled = !orderHasMore;
}

function resetOrdersToFirstPage({ reload = false } = {}) {
  if (orderPage === 1 && !reload) return;
  orderPage = 1;
  orderHasMore = false;
  updatePager();
  if (reload) document.querySelector("[data-reload-all-orders]")?.click();
}

installAdminFetchBoundary();

window.addEventListener("reball:order-pagination", () => {
  ensurePager();
  updatePager();
});

document.addEventListener("click", (event) => {
  const tab = event.target instanceof Element ? event.target.closest("[data-tab]") : null;
  if (!tab) return;
  if (tab.dataset.tab === "orders") ensurePager();
  if (tab.dataset.tab === "shipping") resetOrdersToFirstPage();
});

document.addEventListener("input", (event) => {
  if (event.target instanceof Element && event.target.matches("[data-orders-search]")) {
    resetOrdersToFirstPage();
  }
});

document.addEventListener("change", (event) => {
  if (event.target instanceof Element && event.target.matches("[data-order-status-filter]")) {
    resetOrdersToFirstPage({ reload: true });
  }
});

const observer = new MutationObserver(() => ensurePager());
observer.observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ensurePager, { once: true });
} else {
  ensurePager();
}
