import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm";

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
const SUPABASE_URL = meta("reball-supabase-url").replace(/\/$/, "");
const SUPABASE_KEY = meta("reball-supabase-publishable-key");
const MEDIA_BUCKET = "reball-product-media";
const money = new Intl.NumberFormat("ko-KR");

const ROLE_LABELS = {
  owner_admin: "대표 관리자",
  store_manager: "매장 운영",
  inventory_manager: "상품·재고",
  cs_manager: "고객·배송",
  payments_manager: "결제·환불",
  customer: "고객",
};
const ADMIN_ROLES = new Set(["owner_admin", "store_manager", "inventory_manager", "cs_manager", "payments_manager"]);
const PRODUCT_ROLES = new Set(["owner_admin", "store_manager", "inventory_manager"]);
const PRODUCT_METADATA_ROLES = new Set(["owner_admin", "inventory_manager"]);
const ORDER_ROLES = new Set(["owner_admin", "store_manager", "cs_manager", "payments_manager"]);
const SHIPPING_ROLES = new Set(["owner_admin", "store_manager", "cs_manager"]);
const MEMBER_ROLES = new Set(["owner_admin", "cs_manager"]);
const PAYMENT_ROLES = new Set(["owner_admin", "payments_manager"]);
const OWNER_ROLES = new Set(["owner_admin"]);
const TAB_ROLES = {
  dashboard: ADMIN_ROLES,
  orders: ORDER_ROLES,
  products: PRODUCT_ROLES,
  shipping: SHIPPING_ROLES,
  members: MEMBER_ROLES,
  audit: OWNER_ROLES,
  settings: OWNER_ROLES,
  staff: OWNER_ROLES,
};

const state = {
  session: null,
  roles: [],
  activeTab: "dashboard",
  dashboard: null,
  products: [],
  orders: [],
  members: [],
  audit: null,
  settings: null,
  staff: [],
  productSearch: "",
  ordersSearch: "",
  orderStatusFilter: "",
  shippingSearch: "",
  memberSearch: "",
  staffSearch: "",
  uploadContext: null,
};

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

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");
const safeSlug = (value) => String(value || "product").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "product";
const hasAnyRole = (allowed) => state.roles.some((role) => allowed.has(role));
const canTab = (tab) => Boolean(TAB_ROLES[tab] && hasAnyRole(TAB_ROLES[tab]));

function toast(message, { long = false } = {}) {
  const node = $("[data-toast]");
  if (!node) return;
  node.textContent = String(message || "처리가 완료되었습니다.");
  node.classList.add("is-open");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("is-open"), long ? 4800 : 2600);
}

function setBusy(busy) {
  $("[data-app-panel]")?.classList.toggle("sm-loading", Boolean(busy));
}

function showPanel(name) {
  $("[data-login-panel]").hidden = name !== "login";
  $("[data-denied-panel]").hidden = name !== "denied";
  $("[data-app-panel]").hidden = name !== "app";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).format(date);
}

function orderStatusLabel(value) {
  return ({
    draft: "초안",
    payment_ready: "결제대기",
    payment_auth_started: "결제인증중",
    waiting_for_deposit: "입금대기",
    paid: "결제완료",
    payment_failed: "결제실패",
    cancel_requested: "취소처리중",
    canceled: "취소",
    partially_canceled: "부분취소",
    refunded: "환불",
    shipping_ready: "배송준비",
    shipped: "출고완료",
    delivered: "배송완료",
  })[String(value)] || String(value || "-");
}

function paymentStatusLabel(value) {
  return ({
    ready: "결제대기", in_progress: "승인중", waiting_for_deposit: "입금대기", done: "결제완료",
    canceled: "취소", partial_canceled: "부분취소", failed: "실패", expired: "만료",
  })[String(value)] || String(value || "-");
}

function paymentMethodLabel(value) {
  return ({ card: "카드", transfer: "계좌이체", virtual_account: "가상계좌", easy_pay: "간편결제" })[String(value)] || String(value || "-");
}

function statusBadgeClass(value) {
  if (["payment_failed", "cancel_requested", "canceled", "refunded"].includes(String(value))) return "sm-badge--bad";
  if (["payment_ready", "payment_auth_started", "waiting_for_deposit", "paid", "shipping_ready"].includes(String(value))) return "sm-badge--warn";
  return "";
}

function addressValue(order) {
  const a = order?.address_snapshot || {};
  return {
    name: a.receiverName || a.receiver_name || a.name || "",
    phone: a.receiverPhone || a.receiver_phone || a.phone || "",
    zip: a.zipCode || a.zip_code || a.postalCode || "",
    road: a.roadAddress || a.road_address || a.address || "",
    detail: a.detailAddress || a.detail_address || "",
    memo: a.memo || "",
  };
}

function mediaUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "/assets/figma/product-variants/ball-default.png";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  return `/assets/figma/${raw.replace(/^\.\//, "")}`;
}

function gradeLabel(value) {
  return ({ A_PLUS: "A+", A: "A", A_MINUS: "A-", B: "B", S: "S" })[String(value)] || String(value || "-");
}

async function getRoles(userId) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw error;
  return (data || []).map((row) => row.role).filter(Boolean);
}

async function currentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  return session;
}

async function edgeJson(path, { method = "GET", body, headers = {} } = {}) {
  const session = await currentSession();
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || "관리자 요청을 처리하지 못했습니다.");
  return payload;
}

const adminView = (view) => edgeJson(`/functions/v1/admin-console?view=${encodeURIComponent(view)}`);
const adminAction = (action, body = {}) => edgeJson("/functions/v1/admin-console", { method: "POST", body: { action, ...body } });

function applyPermissions() {
  $$('[data-tab]').forEach((button) => { button.hidden = !canTab(button.dataset.tab); });
  $("[data-refresh-all]").hidden = false;
  $("[data-role-strip]").innerHTML = state.roles
    .filter((role) => ADMIN_ROLES.has(role))
    .map((role) => `<span class="sm-role-chip">${escapeHtml(ROLE_LABELS[role] || role)}</span>`)
    .join("");
  if (!canTab(state.activeTab)) {
    state.activeTab = Object.keys(TAB_ROLES).find(canTab) || "dashboard";
  }
  setTab(state.activeTab, { load: false });
}

async function authorizeSession(session) {
  state.session = session;
  if (!session?.user?.id) {
    state.roles = [];
    showPanel("login");
    return;
  }
  try {
    state.roles = await getRoles(session.user.id);
  } catch {
    state.roles = [];
  }
  if (!state.roles.some((role) => ADMIN_ROLES.has(role))) {
    showPanel("denied");
    return;
  }
  $("[data-user-label]").hidden = false;
  $("[data-user-label]").textContent = session.user.email || "운영 관리자";
  $$('[data-logout]').forEach((node) => { node.hidden = false; });
  showPanel("app");
  applyPermissions();
  await loadDashboard();
}

async function login(email, password) {
  if (!supabase) throw new Error("운영 서버 설정을 불러오지 못했습니다.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await authorizeSession(data.session);
}

async function logout() {
  await supabase?.auth.signOut();
  Object.assign(state, {
    session: null, roles: [], dashboard: null, products: [], orders: [], members: [], audit: null, settings: null, staff: [],
  });
  $("[data-user-label]").hidden = true;
  $("[data-refresh-all]").hidden = true;
  $$('[data-logout]').forEach((node) => { node.hidden = true; });
  showPanel("login");
}

async function loadDashboard() {
  if (!canTab("dashboard")) return;
  setBusy(true);
  try {
    state.dashboard = await adminView("dashboard");
    renderDashboard();
  } catch (error) {
    toast(error?.message || "대시보드를 불러오지 못했습니다.", { long: true });
  } finally { setBusy(false); }
}

function metricCard(label, value, alert = false) {
  return `<div class="sm-summary-card ${alert ? "is-alert" : ""}"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
}

function renderDashboard() {
  const metrics = state.dashboard?.metrics || {};
  const cards = [];
  if (metrics.paidTodayCount != null) cards.push(metricCard("오늘 결제", `${money.format(Number(metrics.paidTodayCount) || 0)}건`));
  if (metrics.grossTodayKrw != null) cards.push(metricCard("오늘 승인", `₩${money.format(Number(metrics.grossTodayKrw) || 0)}`));
  if (metrics.refundsTodayKrw != null) cards.push(metricCard("오늘 취소", `₩${money.format(Number(metrics.refundsTodayKrw) || 0)}`, Number(metrics.refundsTodayKrw) > 0));
  if (metrics.netTodayKrw != null) cards.push(metricCard("오늘 순결제", `₩${money.format(Number(metrics.netTodayKrw) || 0)}`));
  if (metrics.pendingShipping != null) cards.push(metricCard("출고 진행", `${money.format(Number(metrics.pendingShipping) || 0)}건`, Number(metrics.pendingShipping) > 0));
  if (metrics.lowStock != null) cards.push(metricCard("재고 5 이하", `${money.format(Number(metrics.lowStock) || 0)} SKU`, Number(metrics.lowStock) > 0));
  if (metrics.outOfStock != null) cards.push(metricCard("품절", `${money.format(Number(metrics.outOfStock) || 0)} SKU`, Number(metrics.outOfStock) > 0));
  if (metrics.paymentAlerts != null) cards.push(metricCard("결제 복구 경고", `${money.format(Number(metrics.paymentAlerts) || 0)}건`, Number(metrics.paymentAlerts) > 0));
  $("[data-summary]").innerHTML = cards.join("") || metricCard("상태", "정상");

  const recent = state.dashboard?.recentOrders || [];
  $("[data-recent-orders]").innerHTML = recent.length ? `<div class="sm-mini-orders">${recent.map((order) => `
    <div class="sm-mini-order"><b>${escapeHtml(order.order_no)}</b><span class="sm-badge ${statusBadgeClass(order.status)}">${escapeHtml(orderStatusLabel(order.status))}</span><span>₩${money.format(Number(order.total_krw) || 0)}</span></div>`).join("")}</div>` : '<div class="sm-empty">최근 주문이 없습니다.</div>';

  const checks = [
    ["결제 복구 경고", Number(metrics.paymentAlerts || 0), "건"],
    ["품절 SKU", Number(metrics.outOfStock || 0), "개"],
    ["저재고 SKU", Number(metrics.lowStock || 0), "개"],
    ["출고 진행", Number(metrics.pendingShipping || 0), "건"],
  ].filter(([, value]) => Number.isFinite(value));
  $("[data-ops-checks]").innerHTML = `<div class="sm-check-list">${checks.map(([label, value, unit]) => `
    <div class="sm-check"><span>${escapeHtml(label)}</span><b class="${Number(value) > 0 ? "sm-danger-text" : ""}">${money.format(Number(value))}${unit}</b></div>`).join("")}</div>`;
}

async function loadProducts() {
  if (!canTab("products")) return;
  setBusy(true);
  try {
    const { data, error } = await supabase
      .from("products")
      .select("id,slug,name,subtitle,summary,base_price_krw,detail_image_url,active,updated_at,brands(name,slug),product_variants(id,sku,option_model,option_color,option_design,grade,pack_size,price_krw,compare_at_krw,stock_qty,thumbnail_url,active)")
      .order("name", { ascending: true });
    if (error) throw error;
    state.products = data || [];
    renderProducts();
  } catch (error) {
    toast(error?.message || "상품 정보를 불러오지 못했습니다.", { long: true });
  } finally { setBusy(false); }
}

function filteredProducts() {
  const q = state.productSearch.trim().toLowerCase();
  if (!q) return state.products;
  return state.products.filter((product) => {
    const variants = product.product_variants || [];
    return [product.name, product.slug, product.brands?.name, product.subtitle, ...variants.map((v) => v.sku)].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
}

function productRepresentative(product) {
  const variants = product.product_variants || [];
  return variants.find((v) => v.active && v.thumbnail_url)?.thumbnail_url
    || variants.find((v) => v.thumbnail_url)?.thumbnail_url
    || product.detail_image_url || "";
}

function renderProducts() {
  const list = $("[data-product-list]");
  if (!list || !canTab("products")) return;
  const products = filteredProducts();
  const canMetadata = hasAnyRole(PRODUCT_METADATA_ROLES);
  if (!products.length) {
    list.innerHTML = '<div class="sm-empty">표시할 상품이 없습니다.</div>';
    return;
  }
  list.innerHTML = products.map((product) => {
    const variants = [...(product.product_variants || [])].sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
    const metadata = canMetadata ? `
      <label class="sm-field">상품명<input class="sm-input" name="productName" value="${escapeHtml(product.name)}" /></label>
      <label class="sm-field">한줄 설명<input class="sm-input" name="productSubtitle" value="${escapeHtml(product.subtitle || "")}" /></label>
      <label class="sm-field">상세 요약<input class="sm-input" name="productSummary" value="${escapeHtml(product.summary || "")}" /></label>` : "";
    return `<article class="sm-product" data-product-id="${escapeHtml(product.id)}">
      <div class="sm-product-head">
        <img class="sm-product-image" src="${escapeHtml(mediaUrl(productRepresentative(product)))}" alt="${escapeHtml(product.name)} 대표 사진" />
        <div class="sm-product-title"><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.brands?.name || "브랜드")} · ${escapeHtml(product.slug)} · 기준 ₩${money.format(Number(product.base_price_krw) || 0)}</p></div>
        <div class="sm-product-actions">
          <button class="sm-button sm-button--small" type="button" data-upload="cover" data-product-id="${escapeHtml(product.id)}">대표사진</button>
          <button class="sm-button sm-button--small" type="button" data-upload="detail" data-product-id="${escapeHtml(product.id)}">상세사진</button>
          <a class="sm-button sm-button--small" href="/#/product/${encodeURIComponent(product.slug)}" target="_blank" rel="noopener">쇼핑몰 보기</a>
        </div>
      </div>
      <div class="sm-product-body">
        <div class="sm-product-fields">${metadata}<label class="sm-status-toggle"><input type="checkbox" name="productActive" ${product.active ? "checked" : ""}/> 상품 판매중</label></div>
        <div class="sm-variants">
          ${variants.map((variant) => `<div class="sm-variant" data-variant-id="${escapeHtml(variant.id)}">
            <strong>${escapeHtml([variant.option_model, gradeLabel(variant.grade), `${variant.pack_size}구`, variant.option_color, variant.option_design].filter(Boolean).join(" / "))}<small>${escapeHtml(variant.sku)}</small></strong>
            <label><span class="sm-muted">가격</span><input class="sm-input" name="price" type="number" min="1" step="100" value="${Number(variant.price_krw) || 0}" /></label>
            <label><span class="sm-muted">재고</span><input class="sm-input" name="stock" type="number" min="0" step="1" value="${Number(variant.stock_qty) || 0}" /></label>
            <label class="sm-status-toggle"><input type="checkbox" name="active" ${variant.active ? "checked" : ""}/> 판매</label>
            <div><img class="sm-image-preview" src="${escapeHtml(mediaUrl(variant.thumbnail_url || productRepresentative(product)))}" alt="" /><button class="sm-button sm-button--small" type="button" data-upload="variant" data-product-id="${escapeHtml(product.id)}" data-variant-id="${escapeHtml(variant.id)}">사진</button></div>
          </div>`).join("")}
        </div>
        <div class="sm-product-actions" style="margin-top:14px"><button class="sm-button sm-button--primary" type="button" data-save-product="${escapeHtml(product.id)}">이 상품 저장</button></div>
      </div>
    </article>`;
  }).join("");
}

async function saveProduct(productId) {
  const product = state.products.find((entry) => entry.id === productId);
  const card = document.querySelector(`[data-product-id="${CSS.escape(productId)}"]`);
  if (!product || !card) return;
  const canMetadata = hasAnyRole(PRODUCT_METADATA_ROLES);
  const productPatch = { active: Boolean(card.querySelector('[name="productActive"]')?.checked) };
  if (canMetadata) {
    const name = card.querySelector('[name="productName"]')?.value.trim();
    if (!name) return toast("상품명을 입력하세요.");
    productPatch.name = name;
    productPatch.subtitle = card.querySelector('[name="productSubtitle"]')?.value.trim() || "";
    productPatch.summary = card.querySelector('[name="productSummary"]')?.value.trim() || "";
  }
  const variants = [...card.querySelectorAll("[data-variant-id]")].map((row) => ({
    id: row.dataset.variantId,
    priceKrw: Number(row.querySelector('[name="price"]')?.value),
    stockQty: Number(row.querySelector('[name="stock"]')?.value),
    active: Boolean(row.querySelector('[name="active"]')?.checked),
  }));
  if (variants.some((v) => !Number.isSafeInteger(v.priceKrw) || v.priceKrw < 1 || !Number.isSafeInteger(v.stockQty) || v.stockQty < 0)) {
    return toast("가격과 재고 숫자를 확인하세요.");
  }
  setBusy(true);
  try {
    await adminAction("catalogUpdate", { productId, productPatch, variants });
    toast("상품·가격·재고를 한 번에 저장했습니다.");
    await Promise.all([loadProducts(), loadDashboard()]);
  } catch (error) {
    toast(error?.message || "상품 저장에 실패했습니다. 변경은 반영되지 않았습니다.", { long: true });
  } finally { setBusy(false); }
}

async function decodeImage(file) {
  if (typeof globalThis.createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close?.() };
    } catch {}
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
    image.src = url;
  });
  return { width: image.naturalWidth, height: image.naturalHeight, source: image, close: () => URL.revokeObjectURL(url) };
}

async function imageToWebp(file) {
  if (!file || !/^image\/(jpeg|png|webp|avif)$/i.test(file.type || "")) throw new Error("JPG, PNG, WebP, AVIF 사진만 선택해 주세요.");
  if (file.size > 8 * 1024 * 1024) throw new Error("사진은 8MB 이하로 선택해 주세요.");
  const decoded = await decodeImage(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(decoded.source, 0, 0, width, height);
  decoded.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (!blob) throw new Error("사진을 변환하지 못했습니다.");
  return blob;
}

async function uploadImage(file, product) {
  const blob = await imageToWebp(file);
  const path = `${safeSlug(product.slug)}/${Date.now()}-${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType: "image/webp", upsert: false, cacheControl: "31536000",
  });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function handleMediaSelection(file) {
  const context = state.uploadContext;
  state.uploadContext = null;
  if (!context || !file) return;
  const product = state.products.find((entry) => entry.id === context.productId);
  if (!product) return toast("상품을 찾을 수 없습니다.");
  setBusy(true);
  try {
    const publicUrl = await uploadImage(file, product);
    if (context.kind === "detail") {
      await adminAction("catalogUpdate", { productId: product.id, productPatch: { detailImageUrl: publicUrl }, variants: [] });
    } else if (context.kind === "variant") {
      await adminAction("catalogUpdate", { productId: product.id, productPatch: {}, variants: [{ id: context.variantId, thumbnailUrl: publicUrl }] });
    } else {
      await adminAction("catalogUpdate", {
        productId: product.id,
        productPatch: {},
        variants: (product.product_variants || []).map((variant) => ({ id: variant.id, thumbnailUrl: publicUrl })),
      });
    }
    toast("사진을 업로드하고 상품에 반영했습니다.");
    await loadProducts();
  } catch (error) {
    toast(error?.message || "사진 업로드에 실패했습니다.", { long: true });
  } finally {
    setBusy(false);
    $("[data-media-picker]").value = "";
  }
}

async function loadOrders() {
  if (!canTab("orders") && !canTab("shipping")) return;
  setBusy(true);
  try {
    const payload = await adminView("orders");
    state.orders = payload.orders || [];
    renderAllOrders();
    renderShipping();
  } catch (error) {
    toast(error?.message || "주문 정보를 불러오지 못했습니다.", { long: true });
  } finally { setBusy(false); }
}

function filteredAllOrders() {
  const q = state.ordersSearch.trim().toLowerCase();
  return state.orders.filter((order) => {
    if (state.orderStatusFilter && order.status !== state.orderStatusFilter) return false;
    if (!q) return true;
    const address = addressValue(order);
    const haystack = [order.order_no, address.name, address.phone, address.road, ...(order.order_items || []).map((item) => `${item.product_name} ${item.variant_name}`)].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function orderItemsHtml(order) {
  const items = order.order_items || [];
  return items.length ? items.map((item) => `${escapeHtml(item.product_name)}${item.variant_name ? ` · ${escapeHtml(item.variant_name)}` : ""} × ${Number(item.qty) || 0}<br><span class="sm-muted">₩${money.format(Number(item.line_total_krw) || 0)}</span>`).join("<br>") : "상품 정보 없음";
}

function paymentBoxHtml(order) {
  const payment = order.payment || {};
  return `<b>${escapeHtml(paymentStatusLabel(payment.status || order.payment_status))}</b> · ${escapeHtml(paymentMethodLabel(payment.method || order.payment_method))}<br>
    승인 ₩${money.format(Number(payment.approved_amount) || 0)} · 취소 ₩${money.format(Number(payment.canceled_amount) || 0)}
    ${payment.last_reconcile_error ? `<br><span class="sm-danger-text">복구: ${escapeHtml(payment.last_reconcile_error)}</span>` : ""}`;
}

function notesHtml(order) {
  const notes = order.notes || [];
  if (!notes.length) return "";
  return `<div class="sm-note-list">${notes.map((event) => `<div class="sm-note">${escapeHtml(event.payload_json?.note || "메모")} <span class="sm-muted">· ${escapeHtml(formatDate(event.created_at))}</span></div>`).join("")}</div>`;
}

function cancelZoneHtml(order) {
  if (!order.canCancel || !hasAnyRole(PAYMENT_ROLES)) return "";
  const payment = order.payment || {};
  const virtualRefund = (payment.method || order.payment_method) === "virtual_account" && ["done", "partial_canceled"].includes(String(payment.status));
  return `<div class="sm-cancel-zone">
    <b>결제 취소 · 전액환불</b>
    <div class="sm-order-actions"><input class="sm-input" name="cancelReason" placeholder="취소 사유 (예: 고객 요청)" value="고객 요청" />
      ${virtualRefund ? '<input class="sm-input" name="refundBank" placeholder="환불 은행코드" /><input class="sm-input" name="refundAccount" placeholder="환불 계좌번호" inputmode="numeric" /><input class="sm-input" name="refundHolder" placeholder="예금주" />' : ""}
      <button class="sm-button sm-button--danger" type="button" data-cancel-order>결제 취소</button>
    </div>
  </div>`;
}

function renderAllOrders() {
  const list = $("[data-all-order-list]");
  if (!list || !canTab("orders")) return;
  const orders = filteredAllOrders();
  if (!orders.length) {
    list.innerHTML = '<div class="sm-empty">조건에 맞는 주문이 없습니다.</div>';
    return;
  }
  list.innerHTML = orders.map((order) => {
    const address = addressValue(order);
    return `<article class="sm-order" data-order-id="${escapeHtml(order.id)}" data-order-no="${escapeHtml(order.order_no)}">
      <div class="sm-order-top"><div><h3>${escapeHtml(order.order_no)}</h3><div class="sm-order-meta">${escapeHtml(formatDate(order.created_at))} · 총 ₩${money.format(Number(order.total_krw) || 0)} · 환불 ₩${money.format(Number(order.refund_amount) || 0)}</div></div><span class="sm-badge ${statusBadgeClass(order.status)}">${escapeHtml(orderStatusLabel(order.status))}</span></div>
      <div class="sm-order-grid">
        <div class="sm-order-box"><b>${escapeHtml(address.name || "수취인 미입력")}</b> · ${escapeHtml(address.phone)}<br>${escapeHtml(address.zip)} ${escapeHtml(address.road)} ${escapeHtml(address.detail)}${address.memo ? `<br><span class="sm-muted">메모: ${escapeHtml(address.memo)}</span>` : ""}</div>
        <div class="sm-order-box">${orderItemsHtml(order)}</div>
        <div class="sm-order-box">${paymentBoxHtml(order)}</div>
      </div>
      ${notesHtml(order)}
      <div class="sm-note-form"><input class="sm-input" name="adminNote" placeholder="내부 운영 메모" /><button class="sm-button sm-button--small" type="button" data-save-note>메모 저장</button></div>
      ${cancelZoneHtml(order)}
    </article>`;
  }).join("");
}

async function saveOrderNote(card) {
  const note = card.querySelector('[name="adminNote"]')?.value.trim() || "";
  if (!note) return toast("메모를 입력하세요.");
  try {
    await adminAction("orderNote", { orderId: card.dataset.orderId, note });
    toast("주문 메모를 저장했습니다.");
    await loadOrders();
  } catch (error) { toast(error?.message || "메모 저장에 실패했습니다.", { long: true }); }
}

async function cancelOrder(card) {
  const reason = card.querySelector('[name="cancelReason"]')?.value.trim() || "";
  if (reason.length < 2) return toast("취소 사유를 2자 이상 입력하세요.");
  if (!globalThis.confirm?.(`${card.dataset.orderNo} 주문의 남은 결제금액을 전액 취소하시겠습니까?`)) return;
  const payment = state.orders.find((order) => order.id === card.dataset.orderId)?.payment || {};
  let refundReceiveAccount;
  if (payment.method === "virtual_account" && ["done", "partial_canceled"].includes(String(payment.status))) {
    const bank = card.querySelector('[name="refundBank"]')?.value.trim().toUpperCase() || "";
    const accountNumber = card.querySelector('[name="refundAccount"]')?.value.replace(/\D/g, "") || "";
    const holderName = card.querySelector('[name="refundHolder"]')?.value.trim() || "";
    if (!bank || !accountNumber || !holderName) return toast("가상계좌 환불 은행코드·계좌번호·예금주를 입력하세요.");
    refundReceiveAccount = { bank, accountNumber, holderName };
  }
  const idempotencyKey = `admincancel_${crypto.randomUUID().replace(/-/g, "")}`;
  setBusy(true);
  try {
    await edgeJson("/functions/v1/payment-cancel", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: { orderNo: card.dataset.orderNo, reason, idempotencyKey, ...(refundReceiveAccount ? { refundReceiveAccount } : {}) },
    });
    toast("결제 취소·환불 요청을 완료했습니다.");
    await Promise.all([loadOrders(), loadDashboard()]);
  } catch (error) {
    toast(error?.message || "결제 취소에 실패했습니다.", { long: true });
  } finally { setBusy(false); }
}

function filteredShippingOrders() {
  const q = state.shippingSearch.trim().toLowerCase();
  return state.orders.filter((order) => {
    if (!["paid", "shipping_ready", "shipped", "delivered"].includes(String(order.status))) return false;
    if (!q) return true;
    const a = addressValue(order);
    return [order.order_no, a.name, a.phone, ...(order.order_items || []).map((item) => item.product_name)].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
}

function renderShipping() {
  const list = $("[data-shipping-list]");
  if (!list || !canTab("shipping")) return;
  const orders = filteredShippingOrders();
  if (!orders.length) {
    list.innerHTML = '<div class="sm-empty">출고 관리할 주문이 없습니다.</div>';
    return;
  }
  list.innerHTML = orders.map((order) => {
    const a = addressValue(order);
    const isDelivered = order.status === "delivered";
    const isShipped = order.status === "shipped";
    const canReady = order.status === "paid";
    return `<article class="sm-order" data-order-id="${escapeHtml(order.id)}">
      <div class="sm-order-top"><div><h3>${escapeHtml(order.order_no)}</h3><div class="sm-order-meta">${escapeHtml(formatDate(order.created_at))} · ₩${money.format(Number(order.total_krw) || 0)}</div></div><span class="sm-badge ${statusBadgeClass(order.status)}">${escapeHtml(orderStatusLabel(order.status))}</span></div>
      <div class="sm-order-grid"><div class="sm-order-box"><b>${escapeHtml(a.name || "수취인 미입력")}</b> · ${escapeHtml(a.phone)}<br>${escapeHtml(a.road)} ${escapeHtml(a.detail)}</div><div class="sm-order-box">${orderItemsHtml(order)}</div><div class="sm-order-box">${paymentBoxHtml(order)}</div></div>
      ${isDelivered ? `<div class="sm-order-meta" style="margin-top:12px">배송완료 · ${escapeHtml(order.shipping_carrier || "")} ${escapeHtml(order.tracking_number || "")}</div>` : `<div class="sm-shipping-form">
        <select class="sm-select" name="carrier">${["CJ대한통운","한진택배","롯데택배","우체국택배","로젠택배","경동택배"].map((carrier) => `<option ${order.shipping_carrier === carrier ? "selected" : ""}>${carrier}</option>`).join("")}</select>
        <input class="sm-input" name="tracking" placeholder="송장번호" value="${escapeHtml(order.tracking_number || "")}" inputmode="numeric" />
        ${canReady ? '<button class="sm-button" type="button" data-shipping-status="shipping_ready">배송준비</button>' : ""}
        <button class="sm-button sm-button--primary" type="button" data-shipping-status="shipped">${isShipped ? "송장 수정" : "송장 저장 · 출고"}</button>
        ${isShipped ? '<button class="sm-button" type="button" data-shipping-status="delivered">배송완료</button>' : ""}
      </div>`}
    </article>`;
  }).join("");
}

async function updateShipping(orderId, status, card) {
  const carrier = card.querySelector('[name="carrier"]')?.value.trim() || "";
  const trackingNumber = card.querySelector('[name="tracking"]')?.value.trim() || "";
  if (status === "shipped" && (!carrier || !/^[A-Za-z0-9-]{4,80}$/.test(trackingNumber))) return toast("택배사와 송장번호를 확인하세요. 숫자·영문·하이픈만 가능합니다.");
  setBusy(true);
  try {
    await edgeJson("/functions/v1/admin-shipping", { method: "POST", body: { orderId, status, carrier, trackingNumber } });
    toast(status === "delivered" ? "배송완료로 처리했습니다." : status === "shipping_ready" ? "배송준비 상태로 변경했습니다." : "송장을 저장하고 출고 처리했습니다.");
    await Promise.all([loadOrders(), loadDashboard()]);
  } catch (error) { toast(error?.message || "배송 정보를 저장하지 못했습니다.", { long: true }); }
  finally { setBusy(false); }
}

async function loadMembers() {
  if (!canTab("members")) return;
  setBusy(true);
  try {
    const payload = await edgeJson("/functions/v1/admin-members");
    state.members = payload.members || [];
    renderMembers();
  } catch (error) { toast(error?.message || "회원 정보를 불러오지 못했습니다.", { long: true }); }
  finally { setBusy(false); }
}

function renderMembers() {
  const body = $("[data-member-list]");
  if (!body) return;
  const q = state.memberSearch.trim().toLowerCase();
  const members = state.members.filter((member) => !q || [member.name, member.loginId, member.email, member.phone].filter(Boolean).join(" ").toLowerCase().includes(q));
  body.innerHTML = members.length ? members.map((member) => `<tr><td><b>${escapeHtml(member.name || "이름없음")}</b><br><span class="sm-muted">${escapeHtml(member.loginId || "-")}</span></td><td>${escapeHtml(member.phone || "-")}<br>${escapeHtml(member.email || member.authEmail || "-")}</td><td>${member.marketingSms ? "SMS✓" : "SMS-"} · ${member.marketingEmail ? "메일✓" : "메일-"}</td><td>${money.format(Number(member.orderCount) || 0)}건</td><td>₩${money.format(Number(member.totalKrw) || 0)}</td><td>${escapeHtml(formatDate(member.createdAt))}</td></tr>`).join("") : '<tr><td colspan="6">회원이 없습니다.</td></tr>';
}

async function loadAudit() {
  if (!canTab("audit")) return;
  setBusy(true);
  try {
    state.audit = await adminView("audit");
    renderAudit();
  } catch (error) { toast(error?.message || "감사로그를 불러오지 못했습니다.", { long: true }); }
  finally { setBusy(false); }
}

function actorLabel(actorId) {
  const person = state.audit?.people?.[actorId] || {};
  return person.name || person.email || person.loginId || (actorId ? String(actorId).slice(0, 8) : "시스템");
}

function safeDataSummary(value) {
  if (!value || typeof value !== "object") return "";
  const text = JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function renderAudit() {
  const auditNode = $("[data-admin-audit]");
  const eventNode = $("[data-order-events]");
  const audit = state.audit?.audit || [];
  const events = state.audit?.orderEvents || [];
  auditNode.innerHTML = audit.length ? audit.map((row) => `<div class="sm-timeline-item"><b>${escapeHtml(row.action)} · ${escapeHtml(row.table_name)}</b><small>${escapeHtml(formatDate(row.created_at))} · ${escapeHtml(actorLabel(row.actor_user_id))} · ${escapeHtml(row.row_pk || "")}</small><div class="sm-muted">${escapeHtml(safeDataSummary(row.new_data))}</div></div>`).join("") : '<div class="sm-empty">관리자 변경기록이 없습니다.</div>';
  eventNode.innerHTML = events.length ? events.map((row) => `<div class="sm-timeline-item"><b>${escapeHtml(row.event_type)}</b><small>${escapeHtml(formatDate(row.created_at))} · ${escapeHtml(actorLabel(row.actor_user_id))} · ${escapeHtml(row.from_status || "-")} → ${escapeHtml(row.to_status || "-")}</small><div class="sm-muted">${escapeHtml(safeDataSummary(row.payload_json))}</div></div>`).join("") : '<div class="sm-empty">주문 이벤트가 없습니다.</div>';
}

async function loadSettings() {
  if (!canTab("settings")) return;
  setBusy(true);
  try {
    state.settings = await adminView("settings");
    renderSettings();
  } catch (error) { toast(error?.message || "운영 설정을 불러오지 못했습니다.", { long: true }); }
  finally { setBusy(false); }
}

function setFormValue(form, name, value) {
  const node = form?.elements?.namedItem(name);
  if (node) node.value = value ?? "";
}

function renderSettings() {
  const form = $("[data-settings-form]");
  const store = state.settings?.store || {};
  const commerce = state.settings?.commerce || {};
  [["representativeName", store.representative_name],["businessNumber", store.business_number],["mailOrderNumber", store.mail_order_number],["addressRoad", store.address_road],["csPhone", store.cs_phone],["email", store.email],
    ["baseShippingKrw", commerce.base_shipping_krw],["freeShippingThresholdKrw", commerce.free_shipping_threshold_krw],["remoteAreaSurchargeKrw", commerce.remote_area_surcharge_krw],["reservationTtlMinutes", commerce.reservation_ttl_minutes],["guestLookupTtlDays", commerce.guest_lookup_ttl_days]].forEach(([name, value]) => setFormValue(form, name, value));
  const policies = state.settings?.policies || [];
  $("[data-policy-list]").innerHTML = policies.length ? policies.map((policy) => `<div class="sm-timeline-item"><b>${escapeHtml(policy.title)} · ${escapeHtml(policy.slug)}</b><small>${policy.active ? "현재 적용" : "과거 버전"} · ${escapeHtml(formatDate(policy.effective_at))}</small><div class="sm-muted">${escapeHtml(String(policy.body_md || "").slice(0, 180))}</div></div>`).join("") : '<div class="sm-empty">발행된 정책 버전이 없습니다.</div>';
}

async function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const integer = (name) => Number(form.get(name));
  const store = {
    representativeName: String(form.get("representativeName") || "").trim(), businessNumber: String(form.get("businessNumber") || "").trim(), mailOrderNumber: String(form.get("mailOrderNumber") || "").trim(), addressRoad: String(form.get("addressRoad") || "").trim(), csPhone: String(form.get("csPhone") || "").trim(), email: String(form.get("email") || "").trim(),
  };
  const commerce = { baseShippingKrw: integer("baseShippingKrw"), freeShippingThresholdKrw: integer("freeShippingThresholdKrw"), remoteAreaSurchargeKrw: integer("remoteAreaSurchargeKrw"), reservationTtlMinutes: integer("reservationTtlMinutes"), guestLookupTtlDays: integer("guestLookupTtlDays") };
  if (Object.values(commerce).some((value) => !Number.isSafeInteger(value))) return toast("배송·주문 설정 숫자를 확인하세요.");
  setBusy(true);
  try {
    await adminAction("settingsUpdate", { store, commerce });
    toast("운영 설정을 저장했습니다. 새 주문 계산에 즉시 적용됩니다.");
    await Promise.all([loadSettings(), loadAudit()]);
  } catch (error) { toast(error?.message || "운영 설정 저장에 실패했습니다.", { long: true }); }
  finally { setBusy(false); }
}

async function savePolicy(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const slug = String(form.get("slug") || "").trim().toLowerCase();
  const title = String(form.get("title") || "").trim();
  const bodyMd = String(form.get("bodyMd") || "");
  setBusy(true);
  try {
    await adminAction("policySave", { slug, title, bodyMd, effectiveAt: new Date().toISOString() });
    event.currentTarget.reset();
    toast("새 정책 버전을 발행했습니다.");
    await Promise.all([loadSettings(), loadAudit()]);
  } catch (error) { toast(error?.message || "정책 발행에 실패했습니다.", { long: true }); }
  finally { setBusy(false); }
}

async function loadStaff() {
  if (!canTab("staff")) return;
  setBusy(true);
  try {
    const payload = await adminView("staff");
    state.staff = payload.staff || [];
    renderStaff();
  } catch (error) { toast(error?.message || "운영자 권한을 불러오지 못했습니다.", { long: true }); }
  finally { setBusy(false); }
}

function renderStaff() {
  const list = $("[data-staff-list]");
  const q = state.staffSearch.trim().toLowerCase();
  const rows = state.staff.filter((person) => !q || [person.name, person.email, person.auth_email, person.login_id].filter(Boolean).join(" ").toLowerCase().includes(q));
  const manageable = ["store_manager", "inventory_manager", "cs_manager", "payments_manager", "owner_admin"];
  list.innerHTML = rows.length ? rows.map((person) => `<article class="sm-staff-card" data-user-id="${escapeHtml(person.id)}"><div class="sm-staff-top"><div><h3>${escapeHtml(person.name || person.login_id || "사용자")}</h3><p>${escapeHtml(person.email || person.auth_email || "-")} · ${escapeHtml(person.login_id || "-")}</p></div><span class="sm-chip">${escapeHtml((person.roles || []).map((role) => ROLE_LABELS[role] || role).join(" · ") || "고객")}</span></div><div class="sm-role-controls">${manageable.map((role) => `<label class="sm-role-control"><input type="checkbox" data-role-toggle="${role}" ${(person.roles || []).includes(role) ? "checked" : ""}/> ${escapeHtml(ROLE_LABELS[role])}</label>`).join("")}</div></article>`).join("") : '<div class="sm-empty">표시할 사용자가 없습니다.</div>';
}

async function toggleRole(card, role, enabled, input) {
  input.disabled = true;
  try {
    await adminAction("roleSet", { userId: card.dataset.userId, role, enabled });
    toast(`${ROLE_LABELS[role] || role} 권한을 ${enabled ? "부여" : "해제"}했습니다.`);
    await Promise.all([loadStaff(), loadAudit()]);
  } catch (error) {
    input.checked = !enabled;
    toast(error?.message || "권한 변경에 실패했습니다.", { long: true });
  } finally { input.disabled = false; }
}

async function loadCurrentTab() {
  if (state.activeTab === "dashboard") return loadDashboard();
  if (state.activeTab === "orders") return loadOrders();
  if (state.activeTab === "products") return loadProducts();
  if (state.activeTab === "shipping") return loadOrders();
  if (state.activeTab === "members") return loadMembers();
  if (state.activeTab === "audit") return loadAudit();
  if (state.activeTab === "settings") return loadSettings();
  if (state.activeTab === "staff") return loadStaff();
}

async function refreshAll() {
  const jobs = [loadDashboard()];
  if (canTab("products")) jobs.push(loadProducts());
  if (canTab("orders") || canTab("shipping")) jobs.push(loadOrders());
  if (canTab("members")) jobs.push(loadMembers());
  if (canTab("audit")) jobs.push(loadAudit());
  if (canTab("settings")) jobs.push(loadSettings());
  if (canTab("staff")) jobs.push(loadStaff());
  await Promise.all(jobs);
  toast("운영 데이터를 새로고침했습니다.");
}

function setTab(tab, { load = true } = {}) {
  if (!canTab(tab)) return;
  state.activeTab = tab;
  $$('[data-tab]').forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tab));
  $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
  if (load) loadCurrentTab();
}

function bindEvents() {
  $("[data-login-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = $("[data-login-message]");
    message.textContent = "로그인 중...";
    try {
      await login(String(form.get("email") || "").trim(), String(form.get("password") || ""));
      message.textContent = "";
    } catch {
      message.textContent = "이메일·비밀번호 또는 운영 권한을 확인해 주세요.";
    }
  });
  $$('[data-logout]').forEach((node) => node.addEventListener("click", logout));
  $$('[data-tab]').forEach((node) => node.addEventListener("click", () => setTab(node.dataset.tab)));
  $("[data-refresh-all]")?.addEventListener("click", refreshAll);
  $("[data-reload-dashboard]")?.addEventListener("click", loadDashboard);
  $("[data-reload-products]")?.addEventListener("click", loadProducts);
  $("[data-reload-all-orders]")?.addEventListener("click", loadOrders);
  $("[data-reload-shipping]")?.addEventListener("click", loadOrders);
  $("[data-reload-members]")?.addEventListener("click", loadMembers);
  $("[data-reload-audit]")?.addEventListener("click", loadAudit);
  $("[data-reload-settings]")?.addEventListener("click", loadSettings);
  $("[data-reload-staff]")?.addEventListener("click", loadStaff);
  $("[data-product-search]")?.addEventListener("input", (event) => { state.productSearch = event.target.value; renderProducts(); });
  $("[data-orders-search]")?.addEventListener("input", (event) => { state.ordersSearch = event.target.value; renderAllOrders(); });
  $("[data-order-status-filter]")?.addEventListener("change", (event) => { state.orderStatusFilter = event.target.value; renderAllOrders(); });
  $("[data-shipping-search]")?.addEventListener("input", (event) => { state.shippingSearch = event.target.value; renderShipping(); });
  $("[data-member-search]")?.addEventListener("input", (event) => { state.memberSearch = event.target.value; renderMembers(); });
  $("[data-staff-search]")?.addEventListener("input", (event) => { state.staffSearch = event.target.value; renderStaff(); });
  $("[data-settings-form]")?.addEventListener("submit", saveSettings);
  $("[data-policy-form]")?.addEventListener("submit", savePolicy);

  $("[data-product-list]")?.addEventListener("click", (event) => {
    const save = event.target.closest("[data-save-product]");
    if (save) return saveProduct(save.dataset.saveProduct);
    const upload = event.target.closest("[data-upload]");
    if (upload) {
      state.uploadContext = { kind: upload.dataset.upload, productId: upload.dataset.productId, variantId: upload.dataset.variantId || "" };
      $("[data-media-picker]").click();
    }
  });
  $("[data-media-picker]")?.addEventListener("change", (event) => handleMediaSelection(event.target.files?.[0]));
  $("[data-all-order-list]")?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-order-id]");
    if (!card) return;
    if (event.target.closest("[data-save-note]")) return saveOrderNote(card);
    if (event.target.closest("[data-cancel-order]")) return cancelOrder(card);
  });
  $("[data-shipping-list]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-shipping-status]");
    if (!button) return;
    const card = button.closest("[data-order-id]");
    updateShipping(card.dataset.orderId, button.dataset.shippingStatus, card);
  });
  $("[data-staff-list]")?.addEventListener("change", (event) => {
    const input = event.target.closest("[data-role-toggle]");
    if (!input) return;
    const card = input.closest("[data-user-id]");
    toggleRole(card, input.dataset.roleToggle, input.checked, input);
  });
}

async function boot() {
  bindEvents();
  if (!supabase) {
    $("[data-login-message]").textContent = "운영 서버 설정을 불러오지 못했습니다.";
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  await authorizeSession(session);
  supabase.auth.onAuthStateChange((_event, nextSession) => {
    if (nextSession?.user?.id !== state.session?.user?.id) authorizeSession(nextSession);
  });
}

boot();
