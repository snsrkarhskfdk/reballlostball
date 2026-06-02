const ASSET_PATH = "./assets/figma";
const SUPABASE_URL = "https://qbftalhhyfcndanrcwpy.supabase.co";
const SUPABASE_KEY = "sb_publishable_K876i166RCGtBxdp3xRQZw_yJxPaKwL";

const money = new Intl.NumberFormat("ko-KR");
const app = document.querySelector("#app");

const icons = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg>',
  cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h15l-2 8H8L6 3H3"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.8-4 5-6 8-6s6.2 2 8 6"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/></svg>',
  box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M4.5 7.7 12 12l7.5-4.3M12 12v9"/></svg>',
  truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10v10H4z"/><path d="M14 9h4l2 3v4h-6"/><circle cx="8" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.1L12 17l-5.6 3 1.1-6.1L3 9.5l6.2-.9L12 3Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
  coupon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8a2 2 0 0 1 2-2h16v5a2 2 0 0 0 0 4v5H6a2 2 0 0 1-2-2v-5a2 2 0 0 0 0-4V8Z"/><path d="M13 7v2M13 11v2M13 15v2"/></svg>',
};

const products = [
  {
    brandSlug: "titleist",
    brandName: "타이틀리스트",
    slug: "titleist-pro-v1-v1x-lostball",
    name: "타이틀리스트 PRO V1 / PRO V1X 로스트볼",
    line: "PRO V1 / PRO V1X",
    copy: "투어 레벨 우레탄 계열의 타구감과 스핀 밸런스를 기준으로 선별합니다.",
    price: 12900,
    colors: ["화이트", "혼합"],
    models: ["PRO V1", "PRO V1X"],
    image: "ball-titleist.webp",
    accent: "#0f3a2a",
    stock: 42,
  },
  {
    brandSlug: "bridgestone",
    brandName: "브리지스톤",
    slug: "bridgestone-tour-b-lostball",
    name: "브리지스톤 TOUR B 로스트볼",
    line: "TOUR B",
    copy: "TOUR B, TOUR B X, TOUR B XS 중심의 부드러운 타구감과 안정감을 제공합니다.",
    price: 10900,
    colors: ["화이트", "혼합"],
    models: ["TOUR B", "TOUR B X", "TOUR B XS"],
    image: "ball-bridgestone.webp",
    accent: "#173f35",
    stock: 35,
  },
  {
    brandSlug: "taylormade",
    brandName: "테일러메이드",
    slug: "taylormade-tp5-lostball",
    name: "테일러메이드 TP5 로스트볼",
    line: "TP5",
    copy: "5피스 투어 계열의 반응성과 비거리 성향을 함께 확인할 수 있는 구성입니다.",
    price: 11900,
    colors: ["화이트", "혼합"],
    models: ["TP5", "TP5 Pix"],
    image: "ball-taylormade.webp",
    accent: "#0b3d2e",
    stock: 46,
  },
  {
    brandSlug: "saintnine",
    brandName: "세인트나인",
    slug: "saintnine-lostball",
    name: "세인트나인 로스트볼",
    line: "혼합 라인",
    copy: "입문부터 실전 라운드까지 부담 없이 고르기 쉬운 국내 친숙형 라인입니다.",
    price: 8900,
    colors: ["화이트", "컬러혼합"],
    models: ["Q Soft", "N-PRO", "혼합"],
    image: "ball-saintnine.webp",
    accent: "#167a48",
    stock: 60,
  },
  {
    brandSlug: "volvik",
    brandName: "볼빅",
    slug: "volvik-lostball",
    name: "볼빅 로스트볼",
    line: "프리미엄 혼합",
    copy: "컬러볼 시인성과 개성을 중시하는 골퍼에게 맞춘 선별 구성을 제공합니다.",
    price: 7900,
    colors: ["컬러혼합", "화이트"],
    models: ["프리미엄 혼합", "컬러 혼합"],
    image: "ball-volvik.webp",
    accent: "#a76418",
    stock: 55,
  },
  {
    brandSlug: "srixon",
    brandName: "스릭슨",
    slug: "srixon-z-star-lostball",
    name: "스릭슨 Z-STAR 로스트볼",
    line: "Z-STAR",
    copy: "접근 스핀과 타구감을 중시하는 Z-STAR 계열 중심의 선별 라인입니다.",
    price: 9900,
    colors: ["화이트", "옐로우", "혼합"],
    models: ["Z-STAR", "Z-STAR XV", "혼합"],
    image: "ball-srixon.webp",
    accent: "#7d6a02",
    stock: 40,
  },
];

const gradeOptions = [
  { id: "A+", label: "A+", delta: 0, text: "거의 새것 같은 최상급" },
  { id: "A", label: "A", delta: -1200, text: "상태가 좋은 우수급" },
  { id: "B", label: "B", delta: -2600, text: "사용감 있는 실속형" },
];
const packOptions = [
  { id: "10구", qty: 10, multiplier: 1 },
  { id: "30구", qty: 30, multiplier: 2.62 },
];

const state = {
  route: parseRoute(),
  products,
  cart: load("reball.cart", []),
  orders: load("reball.orders", []),
  activeBanner: 0,
  selected: {},
  myTab: "orders",
  adminTab: "dashboard",
  menuOpen: false,
};

const banners = [
  {
    id: "quality",
    image: "hero-poster.webp",
    eyebrow: "검증된 품질의 로스트볼",
    title: "새 볼 같은 경험을\n합리적인 가격으로",
    body: "전문적인 15단계 검수와 동일한 이미지 기준으로 상품을 고릅니다.",
    cta: "대표 상품 보기",
    route: "/",
  },
  {
    id: "store",
    image: "banner-store-event.webp",
    eyebrow: "오프라인 매장 이벤트",
    title: "부천 매장 직운영\n방문 혜택 준비",
    body: "매장 방문 고객에게 현장 상담과 전용 혜택을 제공합니다.",
    cta: "매장소개 보기",
    route: "/store",
  },
  {
    id: "premium",
    image: "banner-premium-selection.webp",
    eyebrow: "믿을 수 있는 품질",
    title: "프리미엄 선별\nREBALL LOSTBALL",
    body: "성능과 외관을 기준으로 분류한 로스트볼을 같은 기준으로 제공합니다.",
    cta: "지금 쇼핑하기",
    route: "/",
  },
];

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, "") || "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function routeTo(route) {
  state.menuOpen = false;
  location.hash = route;
  if (parseRoute() === route) {
    renderRoute();
  }
}

function asset(name) {
  return `${ASSET_PATH}/${name}`;
}

function productBySlug(slug) {
  return products.find((product) => product.slug === slug) ?? products[0];
}

function productByBrand(brandSlug) {
  return products.filter((product) => product.brandSlug === brandSlug);
}

function getSelection(product) {
  const selected = state.selected[product.slug] ?? {};
  return {
    model: selected.model ?? product.models[0],
    grade: selected.grade ?? "A+",
    pack: selected.pack ?? "10구",
    color: selected.color ?? product.colors[0],
  };
}

function selectedPrice(product) {
  const selection = getSelection(product);
  const grade = gradeOptions.find((item) => item.id === selection.grade) ?? gradeOptions[0];
  const pack = packOptions.find((item) => item.id === selection.pack) ?? packOptions[0];
  return Math.max(5900, Math.round((product.price + grade.delta) * pack.multiplier));
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function layout(content, options = {}) {
  app.innerHTML = `
    <div class="app-shell">
      ${renderHeader()}
      <main>${content}</main>
      ${options.admin ? "" : renderFooter()}
      ${renderToast()}
    </div>
  `;
  bindGlobalEvents();
  bindPageEvents();
}

function renderHeader() {
  const items = [
    ["검수기준", "/inspection"],
    ["브랜드 스토리", "/brand-story"],
    ["매장소개", "/store"],
    ["고객센터", "/customer-center"],
  ];

  return `
    <header class="site-header">
      <a class="brand-lockup" href="#/" aria-label="리볼 로스트볼 홈">
        <img src="${asset("reball-logo.webp")}" alt="" />
        <span>리볼 로스트볼</span>
      </a>
      <nav class="site-nav" aria-label="주요 메뉴">
        <div class="nav-menu-wrap">
          <button class="nav-link" type="button" data-product-menu>상품소개</button>
          ${renderProductMenu("desktop-product-menu")}
        </div>
        ${items.map(([label, route]) => `<a class="nav-link" href="#${route}">${label}</a>`).join("")}
      </nav>
      <div class="header-actions">
        <button class="icon-btn" type="button" data-product-menu aria-label="상품 선택">${icons.search}</button>
        <a class="text-btn" href="#/cart">장바구니 <b>${state.cart.length}</b></a>
        <a class="icon-btn" href="#/mypage" aria-label="마이페이지">${icons.user}</a>
      </div>
      <button class="mobile-menu" type="button" data-product-menu aria-label="상품 메뉴">${icons.menu}</button>
      ${renderProductMenu("mobile-product-menu")}
    </header>
  `;
}

function renderProductMenu(extraClass) {
  return `
    <div class="product-menu ${extraClass} ${state.menuOpen ? "is-open" : ""}" data-product-panel>
      <a href="#/">전체(로스트볼)</a>
      ${products.map((product) => `<a href="#/category/${product.brandSlug}">${escapeHtml(product.brandName)}</a>`).join("")}
      <a href="#/category/mix">브랜드 혼합/가성비 라인</a>
    </div>
  `;
}

function renderFooter() {
  return `
    <footer class="site-footer">
      <div>
        <strong>리볼 로스트볼</strong>
        <p>사업자 정보는 owner 확인 후 확정합니다. 현재 공개용 사업자 정보는 검증 필요 상태입니다.</p>
      </div>
      <nav>
        <a href="#/">상품</a>
        <a href="#/inspection">검수기준</a>
        <a href="#/store">매장소개</a>
        <a href="#/customer-center">고객센터</a>
        <a href="#/mypage">마이페이지</a>
        <a href="#/admin">관리자</a>
      </nav>
    </footer>
  `;
}

function renderToast() {
  return `<div class="toast" data-toast aria-live="polite"></div>`;
}

function renderHome() {
  layout(`
    <section class="hero-carousel" aria-label="프로모션 배너">
      <div class="hero-track" style="transform: translateX(-${state.activeBanner * 100}%);">
        ${banners.map((banner) => renderBanner(banner)).join("")}
      </div>
      <div class="hero-dots">
        ${banners
          .map(
            (_, index) =>
              `<button class="${state.activeBanner === index ? "is-active" : ""}" type="button" data-banner-index="${index}" aria-label="${index + 1}번 배너 보기"></button>`
          )
          .join("")}
      </div>
    </section>
    <section class="trust-strip">
      ${renderTrustItem(icons.shield, "15단계 검수", "표준화된 등급 기준")}
      ${renderTrustItem(icons.star, "등급 선택", "A+ / A / B 구성")}
      ${renderTrustItem(icons.box, "10구 / 30구", "필요 수량에 맞춘 구성")}
      ${renderTrustItem(icons.truck, "15시 출고 준비", "빠른 확인 후 포장")}
    </section>
    <section class="section-head" id="products">
      <p>대표 상품</p>
      <h1>로스트볼 6종을 같은 기준으로 고르세요</h1>
    </section>
    <section class="product-grid">
      ${products.map(renderProductCard).join("")}
    </section>
  `);
}

function renderBanner(banner) {
  return `
    <article class="hero-slide">
      <img src="${asset(banner.image)}" alt="" />
      <div class="hero-copy">
        <span>${escapeHtml(banner.eyebrow)}</span>
        <h1>${escapeHtml(banner.title).replaceAll("\n", "<br />")}</h1>
        <p>${escapeHtml(banner.body)}</p>
        <button class="primary-btn" type="button" data-route="${banner.route}">${escapeHtml(banner.cta)} ${icons.chevron}</button>
      </div>
    </article>
  `;
}

function renderTrustItem(icon, title, body) {
  return `<article>${icon}<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div></article>`;
}

function renderProductCard(product) {
  return `
    <article class="product-card">
      <button class="product-media" type="button" data-route="/product/${product.slug}">
        <img src="${asset(product.image)}" alt="${escapeHtml(product.name)}" />
      </button>
      <div class="product-body">
        <div class="product-top"><span>${escapeHtml(product.brandName)}</span><b>로스트볼</b></div>
        <h2>${escapeHtml(product.name)}</h2>
        <p>${escapeHtml(product.copy)}</p>
        <dl>
          <div><dt>등급</dt><dd>A+ / A / B</dd></div>
          <div><dt>구성</dt><dd>10구 / 30구</dd></div>
          <div><dt>재고</dt><dd>${product.stock}세트</dd></div>
        </dl>
        <div class="product-bottom">
          <strong>₩${money.format(product.price)}부터</strong>
          <button class="round-action" type="button" data-add-card="${product.slug}" aria-label="장바구니 담기">${icons.cart}</button>
        </div>
      </div>
    </article>
  `;
}

function renderCategory(brandSlug) {
  const list = brandSlug === "mix" ? products : productByBrand(brandSlug);
  const title = brandSlug === "mix" ? "브랜드 혼합/가성비 라인" : list[0]?.brandName ?? "전체 상품";
  layout(`
    <section class="page-title">
      <p>상품</p>
      <h1>${escapeHtml(title)}</h1>
      <span>상단 상품 메뉴에서 6개 브랜드를 세로 목록으로 선택할 수 있습니다.</span>
    </section>
    <section class="product-grid">${list.map(renderProductCard).join("")}</section>
  `);
}

function renderDetail(slug) {
  const product = productBySlug(slug);
  const selection = getSelection(product);
  const price = selectedPrice(product);

  layout(`
    <section class="detail-page">
      <div class="breadcrumb"><a href="#/">홈</a><span>›</span><a href="#/category/${product.brandSlug}">${escapeHtml(product.brandName)}</a><span>›</span><strong>${escapeHtml(product.line)}</strong></div>
      <div class="detail-layout">
        <section class="detail-gallery">
          <div class="gallery-stage"><img src="${asset(product.image)}" alt="${escapeHtml(product.name)}" /></div>
          <div class="thumb-row">
            ${["정면", "로고", "딤플", "스탬프", "측면"].map((item, index) => `<button class="${index === 0 ? "is-active" : ""}" type="button">${escapeHtml(item)}</button>`).join("")}
          </div>
          <button class="ghost-btn" type="button" data-open-gallery>더 많은 이미지 보기</button>
        </section>
        <aside class="buy-panel">
          <div class="badge-row"><span>재고 있음</span><b>${selection.grade}</b></div>
          <p>${escapeHtml(product.brandName)} / 로스트볼</p>
          <h1>${escapeHtml(product.name)}</h1>
          <small>${escapeHtml(product.copy)}</small>
          <strong class="detail-price">₩${money.format(price)}부터</strong>
          <div class="option-stack">
            ${renderOptionGroup(product, "model", "모델", product.models)}
            ${renderOptionGroup(product, "grade", "등급", gradeOptions.map((item) => item.id))}
            ${renderOptionGroup(product, "pack", "구성", packOptions.map((item) => item.id))}
            ${renderOptionGroup(product, "color", "색상", product.colors)}
          </div>
          <div class="selected-box">
            <span>선택한 옵션</span>
            <strong>${escapeHtml(selection.model)} / ${escapeHtml(selection.grade)} / ${escapeHtml(selection.pack)} / ${escapeHtml(selection.color)}</strong>
            <b>₩${money.format(price)}</b>
          </div>
          <div class="action-row">
            <button class="primary-btn" type="button" data-add-detail="${product.slug}">장바구니 담기 ${icons.cart}</button>
            <button class="secondary-btn" type="button" data-buy-now="${product.slug}">바로 구매</button>
          </div>
        </aside>
      </div>
      <section class="trust-strip detail-trust">
        ${renderTrustItem(icons.shield, "리볼 기준 선별", "공식 기준에 맞춘 품질")}
        ${renderTrustItem(icons.star, "등급 선택", "원하는 상태 선택")}
        ${renderTrustItem(icons.box, "10구 / 30구", "수량별 합리적 구성")}
        ${renderTrustItem(icons.truck, "빠른 출고", "15시 전 출고 준비")}
      </section>
      <section class="info-panels">
        <article><h2>등급 가이드</h2><p>A+는 마크와 스크래치가 거의 없는 최상급, A는 라운드 사용에 적합한 우수급, B는 연습과 가성비에 맞춘 실속형입니다.</p></article>
        <article><h2>상품 상세 정보</h2><p>상품 이미지는 동일한 크기, 명도, 채도, 조명 방향의 누끼 이미지를 기준으로 관리합니다.</p></article>
        <article><h2>배송 안내</h2><p>주문 확인 후 검수 기준에 맞춰 포장하며, 15시 이전 결제 건은 당일 출고 준비 대상입니다.</p></article>
      </section>
    </section>
    <div class="modal" data-modal aria-hidden="true">
      <button type="button" class="modal-backdrop" data-close-modal></button>
      <section class="modal-card">
        <header><strong>상품 이미지 보기</strong><button type="button" data-close-modal>${icons.close}</button></header>
        <img src="${asset(product.image)}" alt="${escapeHtml(product.name)} 확대 이미지" />
      </section>
    </div>
  `);
}

function renderOptionGroup(product, key, label, values) {
  const selection = getSelection(product);
  return `
    <div class="option-group">
      <p>${escapeHtml(label)}</p>
      <div>
        ${values
          .map(
            (value) =>
              `<button class="${selection[key] === value ? "is-active" : ""}" type="button" data-select-option="${product.slug}|${key}|${escapeHtml(value)}">${escapeHtml(value)}</button>`
          )
          .join("")}
      </div>
    </div>
  `;
}

function addToCart(slug, quantity = 1) {
  const product = productBySlug(slug);
  const selection = getSelection(product);
  const price = selectedPrice(product);
  const key = `${slug}|${selection.model}|${selection.grade}|${selection.pack}|${selection.color}`;
  const existing = state.cart.find((item) => item.key === key);

  if (existing) {
    existing.quantity += quantity;
  } else {
    state.cart.push({
      key,
      slug,
      name: product.name,
      brandName: product.brandName,
      image: product.image,
      selection,
      price,
      quantity,
    });
  }

  save("reball.cart", state.cart);
  showToast("장바구니에 담았습니다.");
  renderRoute();
}

function renderCart() {
  const total = cartTotal();
  layout(`
    <section class="page-title">
      <p>장바구니</p>
      <h1>선택한 로스트볼 구성</h1>
    </section>
    <section class="cart-layout">
      <div class="cart-list">
        ${
          state.cart.length
            ? state.cart.map(renderCartItem).join("")
            : `<article class="empty-card"><strong>장바구니가 비어 있습니다.</strong><button class="primary-btn" type="button" data-route="/">상품 보러가기</button></article>`
        }
      </div>
      <aside class="summary-panel">
        <h2>결제 금액</h2>
        <div><span>상품금액</span><strong>₩${money.format(total)}</strong></div>
        <div><span>배송비</span><strong>${total >= 30000 || total === 0 ? "무료" : "₩2,500"}</strong></div>
        <div><span>쿠폰</span><strong>- ₩${total ? money.format(Math.min(3000, Math.round(total * 0.08))) : "0"}</strong></div>
        <hr />
        <div class="grand"><span>총 결제금액</span><strong>₩${money.format(Math.max(0, total + (total >= 30000 || total === 0 ? 0 : 2500) - (total ? Math.min(3000, Math.round(total * 0.08)) : 0)))}</strong></div>
        <button class="primary-btn" type="button" data-route="/checkout" ${state.cart.length ? "" : "disabled"}>주문서 작성</button>
      </aside>
    </section>
  `);
}

function renderCartItem(item) {
  return `
    <article class="cart-item">
      <img src="${asset(item.image)}" alt="" />
      <div>
        <span>${escapeHtml(item.brandName)}</span>
        <h2>${escapeHtml(item.name)}</h2>
        <p>${escapeHtml(item.selection.model)} / ${escapeHtml(item.selection.grade)} / ${escapeHtml(item.selection.pack)} / ${escapeHtml(item.selection.color)}</p>
        <strong>₩${money.format(item.price)}</strong>
      </div>
      <div class="qty-control">
        <button type="button" data-qty="${item.key}|-1">-</button>
        <b>${item.quantity}</b>
        <button type="button" data-qty="${item.key}|1">+</button>
      </div>
      <button class="icon-btn" type="button" data-remove="${item.key}" aria-label="삭제">${icons.close}</button>
    </article>
  `;
}

function renderCheckout() {
  const total = cartTotal();
  layout(`
    <section class="page-title">
      <p>주문서</p>
      <h1>배송지와 결제 정보를 확인하세요</h1>
    </section>
    <form class="checkout-layout" data-checkout-form>
      <section class="checkout-form">
        <label>받는 사람<input name="name" required value="홍길동" /></label>
        <label>휴대폰 번호<input name="phone" required value="010-1234-5678" /></label>
        <label>배송지<input name="address" required value="서울특별시 강남구 테헤란로 123, 4층" /></label>
        <label>배송 메모<select name="memo"><option>부재 시 문 앞에 놓아주세요.</option><option>배송 전 연락 주세요.</option></select></label>
        <fieldset>
          <legend>결제수단</legend>
          <label><input type="radio" name="payment" value="card" checked /> 신용/체크카드</label>
          <label><input type="radio" name="payment" value="transfer" /> 계좌이체</label>
          <label><input type="radio" name="payment" value="virtual" /> 가상계좌</label>
        </fieldset>
      </section>
      <aside class="summary-panel">
        <h2>주문 요약</h2>
        ${state.cart.map((item) => `<div><span>${escapeHtml(item.name)} x ${item.quantity}</span><strong>₩${money.format(item.price * item.quantity)}</strong></div>`).join("")}
        <hr />
        <div class="grand"><span>총 결제 예정금액</span><strong>₩${money.format(total)}</strong></div>
        <button class="primary-btn" type="submit" ${state.cart.length ? "" : "disabled"}>결제 완료 처리</button>
        <small>실결제 승인 전까지는 데모 주문으로 저장됩니다.</small>
      </aside>
    </form>
  `);
}

function createOrder(formData) {
  const total = cartTotal();
  const order = {
    id: `RB${Date.now()}`,
    date: new Date().toLocaleString("ko-KR"),
    status: "결제확인",
    delivery: "상품준비중",
    total,
    customer: {
      name: formData.get("name"),
      phone: formData.get("phone"),
      address: formData.get("address"),
      memo: formData.get("memo"),
      payment: formData.get("payment"),
    },
    items: state.cart,
  };

  state.orders.unshift(order);
  state.cart = [];
  save("reball.orders", state.orders);
  save("reball.cart", state.cart);
  routeTo(`/order/${order.id}`);
}

function renderOrder(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) {
    layout(`<section class="empty-card"><strong>주문을 찾을 수 없습니다.</strong><button class="primary-btn" type="button" data-route="/mypage">마이페이지로 이동</button></section>`);
    return;
  }

  layout(`
    <section class="complete-page">
      <div class="complete-icon">${icons.check}</div>
      <h1>구매결정이 완료되었습니다.</h1>
      <p>${escapeHtml(order.customer.name)}님의 주문이 접수되었습니다.</p>
      <dl>
        <div><dt>주문번호</dt><dd>${escapeHtml(order.id)}</dd></div>
        <div><dt>주문일</dt><dd>${escapeHtml(order.date)}</dd></div>
        <div><dt>배송상태</dt><dd>${escapeHtml(order.delivery)}</dd></div>
        <div><dt>결제금액</dt><dd>₩${money.format(order.total)}</dd></div>
      </dl>
      <div class="action-row center">
        <button class="primary-btn" type="button" data-route="/mypage">주문내역 보기</button>
        <button class="secondary-btn" type="button" data-route="/">메인으로 이동</button>
      </div>
    </section>
  `);
}

function renderMypage() {
  const tabs = [
    ["orders", "주문목록 / 배송조회"],
    ["returns", "취소 / 반품 / 교환 / 환불"],
    ["coupons", "쿠폰 / 이용권"],
    ["points", "적립금"],
    ["recent", "최근 본 상품"],
    ["wishlist", "찜 리스트"],
    ["posts", "게시물 관리"],
    ["profile", "개인정보관리 / 수정"],
  ];

  layout(`
    <section class="mypage-layout">
      <aside class="mypage-side">
        <h2>MY 쇼핑</h2>
        ${tabs.map(([id, label]) => `<button class="${state.myTab === id ? "is-active" : ""}" type="button" data-my-tab="${id}">${escapeHtml(label)}</button>`).join("")}
      </aside>
      <section class="mypage-content">
        ${renderMypageContent()}
      </section>
    </section>
  `);
}

function renderMypageContent() {
  if (state.myTab === "orders") {
    return `
      <div class="page-title compact"><p>MY 쇼핑</p><h1>주문목록</h1></div>
      <div class="order-list">
        ${
          state.orders.length
            ? state.orders.map(renderOrderRow).join("")
            : `<article class="empty-card"><strong>주문 내역이 없습니다.</strong><button class="primary-btn" type="button" data-route="/">쇼핑하러 가기</button></article>`
        }
      </div>
    `;
  }
  if (state.myTab === "coupons") {
    return `<div class="page-title compact"><p>MY 혜택</p><h1>쿠폰 / 이용권</h1></div><article class="coupon-card">${icons.coupon}<strong>신규 회원가입 축하 쿠폰</strong><b>3,000원 할인</b><span>발급일로부터 7일 이내</span></article>`;
  }
  if (state.myTab === "points") {
    return `<div class="page-title compact"><p>MY 쇼핑</p><h1>적립금</h1></div><section class="stat-grid"><article><span>총 적립금</span><strong>0원</strong></article><article><span>사용가능 적립금</span><strong>0원</strong></article><article><span>미가용 적립금</span><strong>0원</strong></article></section><article class="empty-card">적립금 내역이 없습니다.</article>`;
  }
  if (state.myTab === "recent") {
    return `<div class="page-title compact"><p>MY 활동</p><h1>최근 본 상품</h1></div><section class="product-grid small">${products.slice(0, 3).map(renderProductCard).join("")}</section>`;
  }
  if (state.myTab === "wishlist" || state.myTab === "posts") {
    return `<div class="page-title compact"><p>MY 활동</p><h1>${state.myTab === "wishlist" ? "찜 리스트" : "게시물 관리"}</h1></div><article class="empty-card">표시할 내역이 없습니다.</article>`;
  }
  if (state.myTab === "profile") {
    return `<div class="page-title compact"><p>MY 정보</p><h1>개인정보관리 / 수정</h1></div><form class="profile-form"><label>이름<input value="홍길동" /></label><label>이메일<input value="honggildong@example.com" /></label><label>휴대폰 번호<input value="010-1234-5678" /></label><button class="primary-btn" type="button">정보 수정</button></form>`;
  }
  return `<div class="page-title compact"><p>MY 활동</p><h1>${tabsLabel(state.myTab)}</h1></div><article class="empty-card">진행 내역이 없습니다.</article>`;
}

function tabsLabel(id) {
  return {
    returns: "취소 / 반품 / 교환 / 환불",
  }[id] ?? "마이페이지";
}

function renderOrderRow(order) {
  return `
    <article class="order-row">
      <div><span>${escapeHtml(order.date)}</span><h2>${escapeHtml(order.id)}</h2><p>${order.items.length}개 상품 · ₩${money.format(order.total)}</p></div>
      <ol class="delivery-steps"><li class="done">주문접수</li><li class="done">결제확인</li><li class="active">상품준비</li><li>배송중</li><li>배송완료</li></ol>
      <button class="secondary-btn" type="button" data-route="/order/${order.id}">상세보기</button>
    </article>
  `;
}

function renderStore() {
  layout(`
    <section class="store-hero">
      <img src="${asset("banner-store-event.webp")}" alt="부천 매장 직운영 이벤트" />
    </section>
    <section class="store-grid">
      <article><h2>부천 매장 직운영</h2><p>6월 이벤트 기간 동안 방문 고객에게 현장 전용 혜택을 제공합니다.</p></article>
      <article><h2>브랜드별 상담</h2><p>타이틀리스트, 브리지스톤, 테일러메이드 등 선호 브랜드와 예산에 맞춰 추천합니다.</p></article>
      <article><h2>검수 기준 안내</h2><p>A+, A, B 등급 기준과 실제 선별 과정을 매장 상담에서 확인할 수 있습니다.</p></article>
    </section>
    <section class="dark-cta">
      <p>REBALL LOSTBALL STORE</p>
      <h1>매장 방문 전 원하는 브랜드를 먼저 골라보세요.</h1>
      <button class="light-btn" type="button" data-route="/">상품 보러가기</button>
      <button class="outline-light-btn" type="button" data-route="/customer-center">고객센터 문의</button>
    </section>
  `);
}

function renderInspection() {
  layout(`
    <section class="page-title">
      <p>검수기준</p>
      <h1>등급과 이미지 기준을 투명하게 공개합니다</h1>
    </section>
    <section class="grade-grid">
      ${gradeOptions
        .map(
          (grade) => `
            <article>
              <b>${grade.label}</b>
              <h2>${escapeHtml(grade.text)}</h2>
              <p>마킹, 변색, 스크래치, 표면 손상을 같은 조명 조건에서 확인합니다.</p>
            </article>
          `
        )
        .join("")}
    </section>
    <section class="process-card">
      ${["입고", "세척", "외관 검수", "등급 분류", "상품화", "출고 준비"].map((step, index) => `<span><b>${String(index + 1).padStart(2, "0")}</b>${step}</span>`).join("")}
    </section>
  `);
}

function renderBrandStory() {
  layout(`
    <section class="page-title">
      <p>브랜드 스토리</p>
      <h1>로스트볼을 다시 신뢰할 수 있게 만드는 기준</h1>
      <span>상품 이미지 표준화, 공 딤플 밀도, 컴팩트한 컬러 순환 마크, 워드마크 비율을 중심으로 브랜드 경험을 정리했습니다.</span>
    </section>
    <section class="story-panel">
      <img src="${asset("reball-logo.webp")}" alt="" />
      <div>
        <h2>리볼 로스트볼</h2>
        <p>동일한 크기, 명도, 채도, 조명 방향의 누끼 이미지를 기준으로 상품 상세와 카드 이미지를 관리합니다.</p>
      </div>
    </section>
  `);
}

function renderCustomerCenter() {
  layout(`
    <section class="page-title">
      <p>고객센터</p>
      <h1>주문, 배송, 교환 문의를 한 곳에서 처리합니다</h1>
    </section>
    <section class="customer-grid">
      <article><h2>070-1234-5678</h2><p>평일 09:00 - 18:00<br />점심 12:30 - 13:30</p></article>
      <article><h2>배송 문의</h2><p>주문번호와 수령자명을 함께 남겨주시면 빠르게 확인합니다.</p></article>
      <article><h2>교환/환불</h2><p>검수 등급 불일치, 파손, 오배송은 사진과 함께 접수해주세요.</p></article>
    </section>
  `);
}

function renderAdmin() {
  const tabs = [
    ["dashboard", "대시보드"],
    ["products", "상품"],
    ["orders", "주문"],
    ["returns", "반품"],
    ["coupons", "쿠폰"],
    ["settings", "설정"],
  ];
  layout(
    `
      <section class="admin-layout">
        <aside class="admin-side">
          <strong>REBALL ADMIN</strong>
          ${tabs.map(([id, label]) => `<button class="${state.adminTab === id ? "is-active" : ""}" type="button" data-admin-tab="${id}">${escapeHtml(label)}</button>`).join("")}
          <button type="button" data-route="/">쇼핑몰 보기</button>
        </aside>
        <section class="admin-content">${renderAdminContent()}</section>
      </section>
    `,
    { admin: true }
  );
}

function renderAdminContent() {
  if (state.adminTab === "products") {
    return `<div class="page-title compact"><p>관리자</p><h1>상품 관리</h1></div><table><thead><tr><th>브랜드</th><th>상품</th><th>가격</th><th>재고</th></tr></thead><tbody>${products.map((p) => `<tr><td>${p.brandName}</td><td>${p.name}</td><td>₩${money.format(p.price)}</td><td>${p.stock}</td></tr>`).join("")}</tbody></table>`;
  }
  if (state.adminTab === "orders") {
    return `<div class="page-title compact"><p>관리자</p><h1>주문 관리</h1></div><table><thead><tr><th>주문번호</th><th>고객</th><th>상태</th><th>금액</th></tr></thead><tbody>${state.orders.map((o) => `<tr><td>${o.id}</td><td>${o.customer.name}</td><td>${o.delivery}</td><td>₩${money.format(o.total)}</td></tr>`).join("") || `<tr><td colspan="4">주문 데이터가 없습니다.</td></tr>`}</tbody></table>`;
  }
  if (state.adminTab === "coupons") {
    return `<div class="page-title compact"><p>관리자</p><h1>쿠폰 / 배너</h1></div><section class="admin-cards"><article>신규가입 쿠폰 3,000원</article><article>홈 배너 3개 활성</article><article>매장 방문 이벤트 준비</article></section>`;
  }
  return `<div class="page-title compact"><p>관리자</p><h1>${tabsAdminLabel(state.adminTab)}</h1></div><section class="stat-grid"><article><span>상품</span><strong>${products.length}</strong></article><article><span>주문</span><strong>${state.orders.length}</strong></article><article><span>장바구니</span><strong>${state.cart.length}</strong></article><article><span>배너</span><strong>3</strong></article></section>`;
}

function tabsAdminLabel(id) {
  return { dashboard: "대시보드", returns: "반품 관리", settings: "설정" }[id] ?? "관리자";
}

function showToast(message) {
  state.toast = message;
  const node = document.querySelector("[data-toast]");
  if (node) {
    node.textContent = message;
    node.classList.add("is-open");
    window.setTimeout(() => node.classList.remove("is-open"), 1800);
  }
}

function bindGlobalEvents() {
  document.querySelectorAll("[data-route]").forEach((node) => {
    node.addEventListener("click", () => routeTo(node.dataset.route));
  });
  document.querySelectorAll("[data-product-menu]").forEach((node) => {
    node.addEventListener("click", () => {
      state.menuOpen = !state.menuOpen;
      renderRoute();
    });
  });
}

function bindPageEvents() {
  document.querySelectorAll("[data-banner-index]").forEach((node) => {
    node.addEventListener("click", () => {
      state.activeBanner = Number(node.dataset.bannerIndex);
      renderRoute();
    });
  });
  document.querySelectorAll("[data-add-card]").forEach((node) => node.addEventListener("click", () => addToCart(node.dataset.addCard)));
  document.querySelectorAll("[data-add-detail]").forEach((node) => node.addEventListener("click", () => addToCart(node.dataset.addDetail)));
  document.querySelectorAll("[data-buy-now]").forEach((node) =>
    node.addEventListener("click", () => {
      addToCart(node.dataset.buyNow);
      routeTo("/checkout");
    })
  );
  document.querySelectorAll("[data-select-option]").forEach((node) => {
    node.addEventListener("click", () => {
      const [slug, key, value] = node.dataset.selectOption.split("|");
      state.selected[slug] = { ...state.selected[slug], [key]: value };
      renderDetail(slug);
    });
  });
  document.querySelectorAll("[data-qty]").forEach((node) => {
    node.addEventListener("click", () => {
      const [key, delta] = node.dataset.qty.split("|");
      const item = state.cart.find((entry) => entry.key === key);
      if (item) item.quantity = Math.max(1, item.quantity + Number(delta));
      save("reball.cart", state.cart);
      renderCart();
    });
  });
  document.querySelectorAll("[data-remove]").forEach((node) => {
    node.addEventListener("click", () => {
      state.cart = state.cart.filter((item) => item.key !== node.dataset.remove);
      save("reball.cart", state.cart);
      renderCart();
    });
  });
  document.querySelector("[data-checkout-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createOrder(new FormData(event.currentTarget));
  });
  document.querySelectorAll("[data-my-tab]").forEach((node) => {
    node.addEventListener("click", () => {
      state.myTab = node.dataset.myTab;
      renderMypage();
    });
  });
  document.querySelectorAll("[data-admin-tab]").forEach((node) => {
    node.addEventListener("click", () => {
      state.adminTab = node.dataset.adminTab;
      renderAdmin();
    });
  });
  const modal = document.querySelector("[data-modal]");
  document.querySelector("[data-open-gallery]")?.addEventListener("click", () => modal?.classList.add("is-open"));
  document.querySelectorAll("[data-close-modal]").forEach((node) => node.addEventListener("click", () => modal?.classList.remove("is-open")));
}

async function hydrateFromSupabase() {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=slug,name,base_price_krw,product_variants(stock_qty)&active=eq.true`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!response.ok) return;
    const rows = await response.json();
    for (const product of state.products) {
      const row = rows.find((item) => item.slug === product.slug);
      if (row) {
        product.price = row.base_price_krw ?? product.price;
        product.stock = row.product_variants?.reduce((sum, item) => sum + (item.stock_qty ?? 0), 0) || product.stock;
      }
    }
    renderRoute();
  } catch {
    // Local catalog remains the fallback for offline review.
  }
}

function renderRoute() {
  state.route = parseRoute();
  const [base, a] = state.route.split("/").filter(Boolean);

  if (!base) return renderHome();
  if (base === "product") return renderDetail(a);
  if (base === "category") return renderCategory(a);
  if (base === "cart") return renderCart();
  if (base === "checkout") return renderCheckout();
  if (base === "order") return renderOrder(a);
  if (base === "mypage") return renderMypage();
  if (base === "store") return renderStore();
  if (base === "inspection") return renderInspection();
  if (base === "brand-story") return renderBrandStory();
  if (base === "customer-center") return renderCustomerCenter();
  if (base === "admin") return renderAdmin();
  renderHome();
}

window.addEventListener("hashchange", () => {
  state.menuOpen = false;
  renderRoute();
});
window.setInterval(() => {
  state.activeBanner = (state.activeBanner + 1) % banners.length;
  if (parseRoute() === "/") renderHome();
}, 5200);

renderRoute();
hydrateFromSupabase();
