import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm";

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
const SUPABASE_URL = meta("reball-supabase-url").replace(/\/$/, "");
const SUPABASE_KEY = meta("reball-supabase-publishable-key");
const MEDIA_BUCKET = "reball-product-media";
const PRODUCT_ROLES = new Set(["store_manager", "inventory_manager", "owner_admin"]);
const SHIPPING_ROLES = new Set(["store_manager", "cs_manager", "owner_admin"]);
const money = new Intl.NumberFormat("ko-KR");

const state = {
  session: null,
  roles: [],
  products: [],
  orders: [],
  productSearch: "",
  orderSearch: "",
  uploadContext: null,
  canProducts: false,
  canShipping: false,
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

function toast(message) {
  const node = $("[data-toast]");
  if (!node) return;
  node.textContent = message;
  node.classList.add("is-open");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("is-open"), 2200);
}

function setBusy(busy) {
  $("[data-app-panel]")?.classList.toggle("sm-loading", Boolean(busy));
}

function showPanel(name) {
  $("[data-login-panel]").hidden = name !== "login";
  $("[data-denied-panel]").hidden = name !== "denied";
  $("[data-app-panel]").hidden = name !== "app";
}

function mediaUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "/assets/figma/product-variants/ball-default.png";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  return `/assets/figma/${raw.replace(/^\.\//, "")}`;
}

function gradeLabel(value) {
  return ({ A_PLUS: "A+", A: "A", B: "B", S: "S" })[String(value)] || String(value || "-");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function statusLabel(value) {
  return ({
    paid: "결제완료",
    shipping_ready: "배송준비",
    shipped: "출고완료",
    delivered: "배송완료",
    canceled: "취소",
    refunded: "환불",
    payment_ready: "결제대기",
  })[String(value)] || String(value || "-");
}

function addressValue(order) {
  const a = order?.address_snapshot || {};
  const name = a.receiverName || a.receiver_name || a.name || "";
  const phone = a.receiverPhone || a.receiver_phone || a.phone || "";
  const road = a.roadAddress || a.road_address || a.address || "";
  const detail = a.detailAddress || a.detail_address || "";
  return { name, phone, road, detail };
}

async function getRoles(userId) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw error;
  return (data || []).map((row) => row.role);
}

function applyPermissions() {
  state.canProducts = state.roles.some((role) => PRODUCT_ROLES.has(role));
  state.canShipping = state.roles.some((role) => SHIPPING_ROLES.has(role));
  $$('[data-tab="products"]').forEach((node) => { node.hidden = !state.canProducts; });
  $$('[data-tab="shipping"]').forEach((node) => { node.hidden = !state.canShipping; });
  if (!state.canProducts && state.canShipping) setTab("shipping");
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
  state.canProducts = state.roles.some((role) => PRODUCT_ROLES.has(role));
  state.canShipping = state.roles.some((role) => SHIPPING_ROLES.has(role));
  if (!state.canProducts && !state.canShipping) {
    showPanel("denied");
    return;
  }
  $("[data-user-label]").hidden = false;
  $("[data-user-label]").textContent = session.user.email || "매장 운영자";
  $$('[data-logout]').forEach((node) => { node.hidden = false; });
  showPanel("app");
  applyPermissions();
  await loadAll();
}

async function login(email, password) {
  if (!supabase) throw new Error("운영 서버 설정을 불러오지 못했습니다.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await authorizeSession(data.session);
}

async function logout() {
  await supabase?.auth.signOut();
  state.session = null;
  state.roles = [];
  state.products = [];
  state.orders = [];
  $("[data-user-label]").hidden = true;
  $$('[data-logout]').forEach((node) => { node.hidden = true; });
  showPanel("login");
}

async function loadProducts() {
  if (!state.canProducts) return;
  const { data, error } = await supabase
    .from("products")
    .select("id,slug,name,subtitle,summary,base_price_krw,detail_image_url,active,updated_at,brands(name,slug),product_variants(id,sku,option_model,option_color,grade,pack_size,price_krw,compare_at_krw,stock_qty,thumbnail_url,active)")
    .order("name", { ascending: true });
  if (error) throw error;
  state.products = data || [];
  renderProducts();
  renderSummary();
}

async function loadOrders() {
  if (!state.canShipping) return;
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_no,status,payment_status,total_krw,address_snapshot,created_at,shipping_carrier,tracking_number,shipped_at,delivered_at,order_items(product_name,variant_name,qty)")
    .in("status", ["paid", "shipping_ready", "shipped", "delivered"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  state.orders = data || [];
  renderOrders();
  renderSummary();
}

async function loadAll() {
  setBusy(true);
  try {
    await Promise.all([loadProducts(), loadOrders()]);
  } catch (error) {
    toast(error?.message || "운영 데이터를 불러오지 못했습니다.");
  } finally {
    setBusy(false);
  }
}

function renderSummary() {
  const activeProducts = state.products.filter((p) => p.active).length;
  const lowStock = state.products.flatMap((p) => p.product_variants || []).filter((v) => v.active && Number(v.stock_qty) <= 5).length;
  const shipping = state.orders.filter((o) => ["paid", "shipping_ready", "shipped"].includes(o.status)).length;
  $("[data-summary]").innerHTML = [
    ["판매중 상품", `${activeProducts}개`],
    ["재고 5 이하", `${lowStock} SKU`],
    ["출고 진행", `${shipping}건`],
  ].map(([label, value]) => `<div class="sm-summary-card"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("");
}

function filteredProducts() {
  const q = state.productSearch.trim().toLowerCase();
  if (!q) return state.products;
  return state.products.filter((p) => [p.name, p.slug, p.brands?.name, p.subtitle].filter(Boolean).join(" ").toLowerCase().includes(q));
}

function productRepresentative(product) {
  const variants = product.product_variants || [];
  return variants.find((v) => v.active && v.thumbnail_url)?.thumbnail_url || variants.find((v) => v.thumbnail_url)?.thumbnail_url || product.detail_image_url || "";
}

function renderProducts() {
  if (!state.canProducts) return;
  const list = $("[data-product-list]");
  const products = filteredProducts();
  if (!products.length) {
    list.innerHTML = '<div class="sm-empty">표시할 상품이 없습니다.</div>';
    return;
  }
  list.innerHTML = products.map((product) => {
    const variants = [...(product.product_variants || [])].sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
    const brand = product.brands?.name || "브랜드";
    return `<article class="sm-product" data-product-id="${escapeHtml(product.id)}">
      <div class="sm-product-head">
        <img class="sm-product-image" src="${escapeHtml(mediaUrl(productRepresentative(product)))}" alt="${escapeHtml(product.name)} 대표 사진" />
        <div class="sm-product-title"><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(brand)} · ${escapeHtml(product.slug)}</p></div>
        <div class="sm-product-actions">
          <button class="sm-button sm-button--small" type="button" data-upload="cover" data-product-id="${escapeHtml(product.id)}">대표사진 바꾸기</button>
          <button class="sm-button sm-button--small" type="button" data-upload="detail" data-product-id="${escapeHtml(product.id)}">상세사진 바꾸기</button>
          <a class="sm-button sm-button--small" href="/#/product/${encodeURIComponent(product.slug)}" target="_blank" rel="noopener">쇼핑몰에서 보기</a>
        </div>
      </div>
      <div class="sm-product-body">
        <div class="sm-product-fields">
          <label class="sm-field">상품명<input class="sm-input" name="productName" value="${escapeHtml(product.name)}" /></label>
          <label class="sm-field">설명<input class="sm-input" name="productSubtitle" value="${escapeHtml(product.subtitle || "")}" /></label>
          <label class="sm-status-toggle"><input type="checkbox" name="productActive" ${product.active ? "checked" : ""}/> 판매중</label>
        </div>
        <div class="sm-variants">
          ${variants.map((variant) => `<div class="sm-variant" data-variant-id="${escapeHtml(variant.id)}">
            <strong>${escapeHtml([variant.option_model, gradeLabel(variant.grade), `${variant.pack_size}구`, variant.option_color].filter(Boolean).join(" / "))}<small>${escapeHtml(variant.sku)}</small></strong>
            <label><span class="sm-field">가격</span><input class="sm-input" name="price" type="number" min="1" step="100" value="${Number(variant.price_krw) || 0}" /></label>
            <label><span class="sm-field">재고</span><input class="sm-input" name="stock" type="number" min="0" step="1" value="${Number(variant.stock_qty) || 0}" /></label>
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
  const product = state.products.find((p) => p.id === productId);
  const card = document.querySelector(`[data-product-id="${CSS.escape(productId)}"]`);
  if (!product || !card) return;
  const name = card.querySelector('[name="productName"]')?.value.trim();
  const subtitle = card.querySelector('[name="productSubtitle"]')?.value.trim();
  const productActive = Boolean(card.querySelector('[name="productActive"]')?.checked);
  if (!name) return toast("상품명을 입력하세요.");

  const variants = [...card.querySelectorAll("[data-variant-id]")].map((row) => ({
    id: row.dataset.variantId,
    price: Number(row.querySelector('[name="price"]')?.value),
    stock: Number(row.querySelector('[name="stock"]')?.value),
    active: Boolean(row.querySelector('[name="active"]')?.checked),
  }));
  if (variants.some((v) => !Number.isSafeInteger(v.price) || v.price < 1 || !Number.isSafeInteger(v.stock) || v.stock < 0)) {
    return toast("가격과 재고 숫자를 확인하세요.");
  }
  const activePrices = variants.filter((v) => v.active).map((v) => v.price);
  const basePrice = activePrices.length ? Math.min(...activePrices) : Math.min(...variants.map((v) => v.price));

  setBusy(true);
  try {
    const { error: productError } = await supabase.from("products").update({
      name,
      subtitle: subtitle || null,
      base_price_krw: basePrice,
      active: productActive,
      updated_at: new Date().toISOString(),
    }).eq("id", productId);
    if (productError) throw productError;
    for (const variant of variants) {
      const { error } = await supabase.from("product_variants").update({
        price_krw: variant.price,
        stock_qty: variant.stock,
        active: variant.active,
      }).eq("id", variant.id);
      if (error) throw error;
    }
    toast("상품 정보가 저장되었습니다.");
    await loadProducts();
  } catch (error) {
    toast(error?.message || "상품 저장에 실패했습니다.");
  } finally {
    setBusy(false);
  }
}

async function imageToWebp(file) {
  if (!file || file.size > 8 * 1024 * 1024) throw new Error("사진은 8MB 이하로 선택해 주세요.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d", { alpha: false }).drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (!blob) throw new Error("사진을 변환하지 못했습니다.");
  return blob;
}

async function uploadImage(file, product) {
  const blob = await imageToWebp(file);
  const path = `${safeSlug(product.slug)}/${Date.now()}-${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function handleMediaSelection(file) {
  const context = state.uploadContext;
  state.uploadContext = null;
  if (!context || !file) return;
  const product = state.products.find((p) => p.id === context.productId);
  if (!product) return toast("상품을 찾을 수 없습니다.");
  setBusy(true);
  try {
    const publicUrl = await uploadImage(file, product);
    if (context.kind === "detail") {
      const { error } = await supabase.from("products").update({ detail_image_url: publicUrl, updated_at: new Date().toISOString() }).eq("id", product.id);
      if (error) throw error;
    } else if (context.kind === "variant") {
      const { error } = await supabase.from("product_variants").update({ thumbnail_url: publicUrl }).eq("id", context.variantId);
      if (error) throw error;
    } else {
      const variantIds = (product.product_variants || []).map((v) => v.id);
      for (const variantId of variantIds) {
        const { error } = await supabase.from("product_variants").update({ thumbnail_url: publicUrl }).eq("id", variantId);
        if (error) throw error;
      }
    }
    toast("사진이 업로드되고 상품에 반영되었습니다.");
    await loadProducts();
  } catch (error) {
    toast(error?.message || "사진 업로드에 실패했습니다.");
  } finally {
    setBusy(false);
    $("[data-media-picker]").value = "";
  }
}

function filteredOrders() {
  const q = state.orderSearch.trim().toLowerCase();
  if (!q) return state.orders;
  return state.orders.filter((order) => {
    const a = addressValue(order);
    return [order.order_no, a.name, a.phone, ...(order.order_items || []).map((i) => i.product_name)].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
}

function renderOrders() {
  if (!state.canShipping) return;
  const list = $("[data-order-list]");
  const orders = filteredOrders();
  if (!orders.length) {
    list.innerHTML = '<div class="sm-empty">출고 관리할 주문이 없습니다.</div>';
    return;
  }
  list.innerHTML = orders.map((order) => {
    const a = addressValue(order);
    const itemText = (order.order_items || []).map((item) => `${item.product_name}${item.variant_name ? ` · ${item.variant_name}` : ""} × ${item.qty}`).join("<br>");
    const isDelivered = order.status === "delivered";
    const isShipped = order.status === "shipped";
    const canReady = order.status === "paid";
    return `<article class="sm-order" data-order-id="${escapeHtml(order.id)}">
      <div class="sm-order-top">
        <div><h3>${escapeHtml(order.order_no)}</h3><div class="sm-order-meta">${escapeHtml(formatDate(order.created_at))} · ₩${money.format(Number(order.total_krw) || 0)}</div></div>
        <span class="sm-badge ${order.status === "paid" ? "sm-badge--warn" : ""}">${escapeHtml(statusLabel(order.status))}</span>
      </div>
      <div class="sm-order-grid">
        <div class="sm-order-box"><b>${escapeHtml(a.name || "수취인 미입력")}</b> · ${escapeHtml(a.phone)}<br>${escapeHtml(a.road)} ${escapeHtml(a.detail)}</div>
        <div class="sm-order-box">${itemText || "상품 정보 없음"}</div>
      </div>
      ${isDelivered ? `<div class="sm-order-meta" style="margin-top:12px">배송완료 · ${escapeHtml(order.shipping_carrier || "")} ${escapeHtml(order.tracking_number || "")}</div>` : `
      <div class="sm-shipping-form">
        <select class="sm-select" name="carrier">
          ${["CJ대한통운","한진택배","롯데택배","우체국택배","로젠택배","경동택배"].map((carrier) => `<option ${order.shipping_carrier === carrier ? "selected" : ""}>${carrier}</option>`).join("")}
        </select>
        <input class="sm-input" name="tracking" placeholder="송장번호" value="${escapeHtml(order.tracking_number || "")}" inputmode="numeric" />
        ${canReady ? '<button class="sm-button" type="button" data-shipping-status="shipping_ready">배송준비</button>' : ""}
        <button class="sm-button sm-button--primary" type="button" data-shipping-status="shipped">${isShipped ? "송장 수정" : "송장 저장 · 출고"}</button>
        ${isShipped ? '<button class="sm-button" type="button" data-shipping-status="delivered">배송완료 처리</button>' : ""}
      </div>`}
    </article>`;
  }).join("");
}

async function updateShipping(orderId, status, card) {
  const carrier = card.querySelector('[name="carrier"]')?.value.trim() || "";
  const trackingNumber = card.querySelector('[name="tracking"]')?.value.trim() || "";
  if (status === "shipped" && (!carrier || !/^[A-Za-z0-9-]{4,80}$/.test(trackingNumber))) {
    return toast("택배사와 송장번호를 확인하세요. 송장번호는 숫자·영문·하이픈만 가능합니다.");
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return toast("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  setBusy(true);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-shipping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ orderId, status, carrier, trackingNumber }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || "배송 정보를 저장하지 못했습니다.");
    toast(status === "delivered" ? "배송완료로 처리했습니다." : status === "shipping_ready" ? "배송준비 상태로 변경했습니다." : "송장을 저장하고 출고 처리했습니다.");
    await loadOrders();
  } catch (error) {
    toast(error?.message || "배송 정보를 저장하지 못했습니다.");
  } finally {
    setBusy(false);
  }
}

function setTab(tab) {
  if (tab === "products" && !state.canProducts) tab = "shipping";
  if (tab === "shipping" && !state.canShipping) tab = "products";
  $$('[data-tab]').forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tab));
  $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
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
    } catch (error) {
      message.textContent = "이메일·비밀번호 또는 운영 권한을 확인해 주세요.";
    }
  });
  $$('[data-logout]').forEach((node) => node.addEventListener("click", logout));
  $$('[data-tab]').forEach((node) => node.addEventListener("click", () => setTab(node.dataset.tab)));
  $("[data-reload-products]")?.addEventListener("click", loadProducts);
  $("[data-reload-orders]")?.addEventListener("click", loadOrders);
  $("[data-product-search]")?.addEventListener("input", (event) => { state.productSearch = event.target.value; renderProducts(); });
  $("[data-order-search]")?.addEventListener("input", (event) => { state.orderSearch = event.target.value; renderOrders(); });
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
  $("[data-order-list]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-shipping-status]");
    if (!button) return;
    const card = button.closest("[data-order-id]");
    updateShipping(card.dataset.orderId, button.dataset.shippingStatus, card);
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
