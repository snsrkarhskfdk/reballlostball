const ASSET_PATH = "./assets/figma";
const ASSET_VERSION = "20260606-02";
const SUPABASE_URL = "https://qbftalhhyfcndanrcwpy.supabase.co";
const SUPABASE_KEY = "sb_publishable_K876i166RCGtBxdp3xRQZw_yJxPaKwL";
const ADMIN_MEMBERS_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/admin-members`;
const SIGNUP_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/signup-with-login-id`;
const AUTH_REDIRECT_DEFAULT = "/mypage";
const LEGACY_MEMBER_STATE_RESET_VERSION = "20260605-supabase-auth-cutover-v1";
const PENDING_SIGNUP_EMAIL_KEY = "reball.pendingSignupEmail";
const PENDING_SIGNUP_LOGIN_ID_KEY = "reball.pendingSignupLoginId";
const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{3,19}$/;

const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
    storageKey: "reballlostball.auth",
  },
});

const money = new Intl.NumberFormat("ko-KR");
const app = document.querySelector("#app");
const inlineIcon = (name) => `<img class="inline-action-icon" src="${ASSET_PATH}/ui-icons/${name}.png?v=${ASSET_VERSION}" alt="" />`;
const svgUiIconNames = new Set(["order-fast", "safe-pack"]);
const shopIconFileMap = {
  cart: "shop-cart",
  "header-cart": "shop-cart",
  "mini-cart": "shop-cart",
  "bundle-cart": "shop-cart",
  "order-cart": "shop-cart",
  search: "shop-search",
  "header-search": "shop-search",
  "process-inspect": "shop-search",
  cardPay: "shop-payment",
  "order-payment": "shop-payment",
  "service-truck": "shop-truck",
  "order-truck": "shop-truck",
  "order-fast": "shop-truck",
  truck: "shop-truck",
  "service-box": "shop-package",
  "process-inbound": "shop-box-up",
  "process-pack": "shop-box-check",
  "order-box": "shop-box-check",
  box: "shop-box-check",
  "service-return": "shop-return",
  "process-test": "shop-return",
  "why-leaf": "shop-return",
  "why-shield": "shop-shield",
  shield: "shop-shield",
  "safe-pack": "shop-shield",
  "why-medal": "shop-box-check",
  "why-headset": "shop-shield",
  "service-headset": "shop-shield",
};

const icons = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  search: inlineIcon("search"),
  cart: inlineIcon("cart"),
  cardPay: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/></svg>',
  bank: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9 12 4l9 5"/><path d="M5 10h14"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/><path d="M4 18h16"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-2-1.5L12 21l-3-1.5L7 21V3Z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 5 13h5l-1 9 8-11h-5l1-9Z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V8a4 4 0 1 1 8 0v2"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6A3 3 0 0 0 14 14"/><path d="M9.5 5.4A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a18.2 18.2 0 0 1-3.2 4.2"/><path d="M6.2 6.8A18.3 18.3 0 0 0 2.5 12s3.5 7 9.5 7a10.4 10.4 0 0 0 4.2-.9"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.8-4 5-6 8-6s6.2 2 8 6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 5.6a5 5 0 0 0-7.1 0L12 6.9l-1.3-1.3a5 5 0 0 0-7.1 7.1L12 21l8.4-8.3a5 5 0 0 0 0-7.1Z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/></svg>',
  box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M4.5 7.7 12 12l7.5-4.3M12 12v9"/></svg>',
  truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10v10H4z"/><path d="M14 9h4l2 3v4h-6"/><circle cx="8" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.1L12 17l-5.6 3 1.1-6.1L3 9.5l6.2-.9L12 3Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
  coupon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8a2 2 0 0 1 2-2h16v5a2 2 0 0 0 0 4v5H6a2 2 0 0 1-2-2v-5a2 2 0 0 0 0-4V8Z"/><path d="M13 7v2M13 11v2M13 15v2"/></svg>',
};

const shopIcons = {
  cart: renderShopIcon("cart", "inline-action-icon"),
  cardPay: renderShopIcon("cardPay", "inline-action-icon"),
  shield: renderShopIcon("shield", "inline-action-icon"),
};

const ORDER_STATUS_LABELS = {
  draft: "주문 접수",
  payment_ready: "결제 대기",
  payment_auth_started: "결제 진행 중",
  waiting_for_deposit: "입금 대기",
  paid: "결제 완료",
  payment_failed: "결제 실패",
  cancel_requested: "취소 요청",
  canceled: "주문 취소",
  partially_canceled: "부분 취소",
  refunded: "환불 완료",
  shipping_ready: "상품 준비중",
  shipped: "배송중",
  delivered: "배송완료",
};

const PAYMENT_METHOD_LABELS = {
  card: "카드",
  transfer: "계좌이체",
  virtual_account: "가상계좌",
  easy_pay: "간편결제",
};

const businessProfile = {
  name: "리볼로스트볼",
  owner: "이영석",
  businessNumber: "867-01-03727",
  mailOrderNumber: "제 2025 - 부천소사 -0655 호",
  address: "부천 소사구 송내동 300-12 1층",
  supportPhone: "010-8484-4646",
  supportEmail: "evil1229@naver.com",
  operationHours: "09시 ~ 18:00시",
  returnAddress: "부천 소사구 송내동 300-12 1층",
  tossEmail: "evil1229@naver.com",
  settlementBank: "국민은행",
  settlementAccount: "839201-04-201761",
  settlementHolder: "이영석 (리볼 로스트볼)",
  settlementManager: "이영석",
  taxInvoiceEmail: "evil1229@naver.com",
  documentBusinessRegistration: "legal/business-registration.jpg",
  documentMailOrder: "legal/mail-order-license.jpg",
};

const shippingPolicy = {
  baseFee: 3500,
  freeThreshold: 50000,
  islandExtra: 2000,
  cutoffTime: "오후 3시",
  averageLeadTime: "1~2일",
  simpleReturnFee: 7000,
  simpleReturnWindow: "수령 후 7일 이내",
  defectWindow: "제품 문제 발생 시 30일 이내",
  simpleReturnText: "구매자 단순변심은 수령 후 7일 이내 가능하며 배송비는 구매자 부담입니다.",
  defectReturnText: "제품에 문제가 있을 경우 30일 이내 교환/환불 가능하며 배송비는 판매자가 부담합니다.",
};

const paymentProfile = {
  methods: ["카드", "계좌이체", "가상계좌", "간편결제"],
  transferLabel: "계좌이체 입금 계좌",
};

const lostballNotice = [
  "본 상품은 수거·세척·선별 과정을 거친 로스트볼(중고 골프공)입니다.",
  "등급별 기준에 따라 선별하여 판매하고 있으며, 로스트볼 특성상 미세 스크래치, 펜마킹, 로고, 변색 등이 일부 존재할 수 있습니다.",
  "상품 상태는 등급 기준을 참고해 주시기 바라며, 사용에 지장이 있는 공은 제외 후 출고됩니다.",
  "실제 상품 상태는 브랜드 및 등급에 따라 차이가 있을 수 있습니다.",
];

const faqItems = [
  {
    category: "등급",
    question: "A+ / A / B 등급은 어떻게 구분하나요?",
    answer:
      "A+는 외관 사용감이 가장 적은 상품, A는 연습 및 라운딩에 무난한 상품, B는 스크래치나 마킹이 있을 수 있는 실속형 상품으로 분류합니다.",
  },
  {
    category: "상품",
    question: "사진과 동일한 로고나 번호의 공이 오나요?",
    answer:
      "로스트볼 특성상 모델, 번호, 로고, 펜마킹 상태는 재고 구성에 따라 달라질 수 있습니다. 사용에 지장이 있는 공은 선별 과정에서 제외합니다.",
  },
  {
    category: "배송",
    question: "언제 출고되나요?",
    answer: `${shippingPolicy.cutoffTime} 이전 주문은 당일 출고 준비를 기준으로 운영합니다. 평균 배송 기간은 ${shippingPolicy.averageLeadTime}이며 지역과 택배사 사정에 따라 달라질 수 있습니다.`,
  },
  {
    category: "주문",
    question: "비회원 주문도 조회할 수 있나요?",
    answer: "비회원 주문조회 화면에서 주문자명, 주문번호, 비회원 주문 비밀번호를 입력하면 주문 진행 상태를 확인할 수 있습니다.",
  },
  {
    category: "교환/반품",
    question: "단순변심 반품이 가능한가요?",
    answer: `${shippingPolicy.simpleReturnWindow} 단순변심 반품 접수가 가능하며, 왕복 반품 배송비는 ${money.format(shippingPolicy.simpleReturnFee)}원 기준으로 안내합니다.`,
  },
  {
    category: "고객센터",
    question: "상담은 어디로 하면 되나요?",
    answer: `고객센터 ${businessProfile.supportPhone} 또는 ${businessProfile.supportEmail}로 문의할 수 있습니다. 운영시간은 평일 ${businessProfile.operationHours}입니다.`,
  },
];

const noticeItems = [
  {
    category: "운영",
    date: "2025.07.01",
    title: "리볼 로스트볼 쇼핑몰 오픈 안내",
    body:
      "리볼 로스트볼 공식 쇼핑몰이 2025년 7월에 오픈했습니다. 엄격한 검수 기준을 통과한 로스트볼을 등급별로 확인하고, 원하는 브랜드와 구성을 온라인에서 편하게 주문하실 수 있습니다.",
    pinned: true,
  },
  {
    category: "배송",
    date: "2025.07.08",
    title: "오후 3시 이전 주문 당일 출고 준비 안내",
    body:
      "평일 오후 3시 이전 결제 완료 주문은 당일 출고 준비를 기준으로 운영합니다. 택배사 물량, 도서산간 지역, 공휴일 전후 일정에 따라 실제 배송 기간은 달라질 수 있습니다.",
  },
  {
    category: "상품",
    date: "2025.07.15",
    title: "로스트볼 등급 표기 기준 안내",
    body:
      "상품 상세페이지의 S, A, B 등급은 외관 사용감과 실전 사용 적합성을 기준으로 분류합니다. 로스트볼 특성상 로고, 번호, 펜마킹은 재고 구성에 따라 다를 수 있습니다.",
  },
  {
    category: "혜택",
    date: "2025.07.22",
    title: "신규 회원 3,000원 쿠폰 지급 안내",
    body:
      "신규 일반회원 가입 시 바로 사용할 수 있는 3,000원 쿠폰이 지급됩니다. 쿠폰은 마이페이지 쿠폰함에서 확인할 수 있으며, 사용 조건은 주문 단계에서 함께 안내됩니다.",
  },
];

const brandMenu = [
  ["titleist", "타이틀리스트"],
  ["taylormade", "테일러메이드"],
  ["bridgestone", "브리지스톤"],
  ["callaway", "캘러웨이"],
  ["srixon", "스릭슨"],
  ["volvik", "볼빅"],
  ["saintnine", "세인트나인"],
  ["mix", "브랜드혼합"],
];

const products = [
  {
    brandSlug: "titleist",
    brandName: "타이틀리스트",
    slug: "titleist-pro-v1-v1x-lostball",
    name: "타이틀리스트 로스트볼",
    line: "PRO V1 / PRO V1X / 투어스피드 / 트루필 / 벨로시티",
    copy: "PRO V1, PRO V1X, 투어스피드, 트루필, 벨로시티 옵션을 등급별로 선별합니다.",
    price: 12900,
    colors: ["화이트"],
    models: ["PRO V1", "PRO V1X", "투어스피드", "트루필", "벨로시티"],
    image: "ball-titleist.png",
    detailImage: "detail-titleist.webp",
    galleryVideo: "product-videos/reball-titleist-rotation.mp4",
    galleryImages: [
      { image: "gallery/titleist-02.png", label: "타이틀리스트 PRO V1 정렬선" },
      { image: "gallery/titleist-05.png", label: "타이틀리스트 스탠딩 로고" },
      { image: "gallery/titleist-07.png", label: "타이틀리스트 스탠딩 좌측" },
      { image: "gallery/titleist-08.png", label: "타이틀리스트 기본 정면" },
    ],
    detailVariants: {
      "PRO V1": "detail-titleist-pro-v1.webp",
      "PRO V1X": "detail-titleist-pro-v1x.webp",
    },
    accent: "#113A2A",
    stock: 42,
  },
  {
    brandSlug: "bridgestone",
    brandName: "브리지스톤",
    slug: "bridgestone-tour-b-lostball",
    name: "브리지스톤 로스트볼",
    line: "투어 X / XS / E12 / 혼합",
    copy: "투어 X, XS, E12, 혼합 옵션을 중심으로 직진성과 타구감 밸런스를 맞춘 구성입니다.",
    price: 10900,
    colors: ["화이트", "혼합"],
    models: ["투어 X", "XS", "E12", "혼합"],
    image: "ball-bridgestone.png",
    detailImage: "detail-bridgestone.webp",
    galleryVideo: "product-videos/reball-bridgestone-rotation.mp4",
    galleryImages: [
      { image: "gallery/bridgestone-01.png", label: "브리지스톤 TOUR B X 측면" },
      { image: "gallery/bridgestone-02.png", label: "브리지스톤 로고" },
      { image: "gallery/bridgestone-03.png", label: "브리지스톤 기본 정면" },
    ],
    accent: "#113A2A",
    stock: 35,
  },
  {
    brandSlug: "taylormade",
    brandName: "테일러메이드",
    slug: "taylormade-tp5-lostball",
    name: "테일러메이드 로스트볼",
    line: "TP5 / TP5X / TP5 Pix / 투어 리스폰스 / 혼합",
    copy: "TP5, TP5X, TP5 Pix, 투어 리스폰스, 혼합 옵션을 상황에 맞게 선택할 수 있습니다.",
    price: 11900,
    colors: ["화이트", "혼합"],
    models: ["TP5", "TP5X", "TP5 Pix", "투어 리스폰스", "혼합"],
    image: "ball-taylormade.png",
    detailImage: "detail-taylormade.webp",
    galleryVideo: "product-videos/reball-taylormade-rotation.mp4",
    galleryImages: [
      { image: "gallery/taylormade-01.png", label: "테일러메이드 TP5 정렬선" },
      { image: "gallery/taylormade-02.png", label: "테일러메이드 로고 정면" },
      { image: "gallery/taylormade-03.png", label: "테일러메이드 로고 우측" },
      { image: "gallery/taylormade-04.png", label: "테일러메이드 기본 정면" },
    ],
    accent: "#113A2A",
    stock: 46,
  },
  {
    brandSlug: "saintnine",
    brandName: "세인트나인",
    slug: "saintnine-lostball",
    name: "세인트나인 로스트볼",
    line: "화이트 / 컬러",
    copy: "화이트와 컬러 옵션 중심의 국내 친숙형 라인으로 가성비 연습 구성을 부담 없이 고를 수 있습니다.",
    price: 8900,
    colors: ["화이트", "컬러"],
    models: ["화이트", "컬러"],
    image: "ball-saintnine.png",
    detailImage: "detail-saintnine.webp",
    galleryVideo: "product-videos/reball-saintnine-rotation.mp4",
    galleryImages: [
      { image: "gallery/saintnine-01.png", label: "세인트나인 로고" },
      { image: "gallery/saintnine-02.png", label: "세인트나인 캐릭터 좌측" },
      { image: "gallery/saintnine-03.png", label: "세인트나인 캐릭터 우측" },
      { image: "gallery/saintnine-04.png", label: "세인트나인 캐릭터 정면" },
    ],
    accent: "#12A869",
    stock: 60,
  },
  {
    brandSlug: "volvik",
    brandName: "볼빅",
    slug: "volvik-lostball",
    name: "볼빅 로스트볼",
    line: "비비드 컬러 / 화이트 / 반반볼 크리스탈",
    copy: "비비드 컬러, 화이트, 반반볼 크리스탈 구성으로 시인성과 개성을 함께 챙길 수 있습니다.",
    price: 7900,
    colors: ["컬러", "화이트"],
    models: ["비비드 컬러", "화이트", "반반볼 크리스탈"],
    image: "ball-volvik.png",
    detailImage: "detail-volvik.webp",
    galleryVideo: "product-videos/reball-volvik-rotation.mp4",
    galleryImages: [
      { image: "gallery/volvik-01.png", label: "볼빅 VTU3 후면" },
      { image: "gallery/volvik-02.png", label: "볼빅 VTU3 측면" },
      { image: "gallery/volvik-03.png", label: "볼빅 VTU3 로고" },
      { image: "gallery/volvik-04.png", label: "볼빅 VTU3 정면" },
      { image: "gallery/volvik-05.png", label: "볼빅 TIGER" },
    ],
    accent: "#E7D8B8",
    stock: 55,
  },
  {
    brandSlug: "callaway",
    brandName: "캘러웨이",
    slug: "callaway-chrome-tour-lostball",
    aliasSlugs: ["callaway-lostball"],
    name: "캘러웨이 CHROME TOUR 로스트볼",
    line: "CHROME TOUR / 트리플트랙 / ERC 소프트",
    copy: "페어웨이에서 더 긴 비거리를 경험할 수 있는 캘러웨이 크롬투어 로스트볼 구성입니다.",
    price: 11900,
    colors: ["화이트", "옐로우", "트리플트랙"],
    models: ["CHROME TOUR", "360 트리플트랙 화이트", "360 트리플트랙 옐로우"],
    image: "ball-callaway.png",
    detailImage: "detail-callaway.png",
    galleryVideo: "callaway-rotation.mp4",
    galleryImages: [
      { image: "gallery/callaway-01.png", label: "캘러웨이 CHROME TOUR 정면" },
      { image: "gallery/callaway-02.png", label: "캘러웨이 전면 트리플트랙" },
      { image: "gallery/callaway-03.png", label: "캘러웨이 로고 오른쪽" },
      { image: "gallery/callaway-04.png", label: "캘러웨이 로고 왼쪽" },
      { image: "gallery/callaway-05.png", label: "캘러웨이 로고 왼쪽 클로즈업" },
      { image: "gallery/callaway-06.png", label: "캘러웨이 CHROME TOUR 누끼" },
    ],
    accent: "#B68935",
    stock: 44,
  },
  {
    brandSlug: "srixon",
    brandName: "스릭슨",
    slug: "srixon-z-star-lostball",
    name: "스릭슨 로스트볼",
    line: "Z-STAR / 반반볼",
    copy: "Z-STAR와 반반볼 중심의 선별 라인으로 스핀 컨트롤과 실속 구성을 함께 제공합니다.",
    price: 9900,
    colors: ["화이트", "혼합"],
    models: ["Z-STAR", "반반볼"],
    image: "ball-srixon.png",
    detailImage: "detail-srixon.webp",
    galleryImages: [
      { image: "gallery/srixon-01.png", label: "스릭슨 Z-STAR 측면" },
      { image: "gallery/srixon-02.png", label: "스릭슨 Z-STAR 후면" },
      { image: "gallery/srixon-03.png", label: "스릭슨 로고 정면" },
      { image: "gallery/srixon-04.png", label: "스릭슨 기본 정면" },
    ],
    accent: "#113A2A",
    stock: 40,
  },
  {
    brandSlug: "mix",
    brandName: "브랜드혼합",
    slug: "brand-mix-lostball",
    name: "브랜드혼합 로스트볼",
    line: "화이트 / 컬러 혼합",
    copy: "브랜드 지정 없이 화이트 또는 컬러 계열로 실속 있게 구성한 혼합 라인입니다.",
    price: 7500,
    colors: ["화이트", "컬러"],
    models: ["화이트", "컬러"],
    image: "ball-volvik.png",
    detailImage: "detail-volvik.webp",
    galleryImages: [
      { image: "ball-volvik.png", label: "브랜드혼합 대표 화이트 볼" },
      { image: "gallery/mix-02-bridgestone.png", label: "브랜드혼합 예시 브리지스톤 TOUR B X" },
      { image: "gallery/mix-03-taylormade.png", label: "브랜드혼합 예시 테일러메이드 TP5" },
      { image: "gallery/mix-04-saintnine.png", label: "브랜드혼합 예시 세인트나인 캐릭터 볼" },
      { image: "gallery/mix-05-callaway.png", label: "브랜드혼합 예시 캘러웨이 CHROME TOUR" },
      { image: "gallery/mix-06-srixon.png", label: "브랜드혼합 예시 스릭슨 Z-STAR" },
    ],
    accent: "#113A2A",
    stock: 70,
  },
];

products.sort(
  (left, right) =>
    brandMenu.findIndex(([slug]) => slug === left.brandSlug) -
    brandMenu.findIndex(([slug]) => slug === right.brandSlug)
);

const gradeOptions = [
  { id: "S", label: "S", delta: 1800, text: "새 볼에 가까운 최상급" },
  { id: "A", label: "A", delta: 0, text: "실전 라운드용 우수급" },
  { id: "B", label: "B", delta: -1800, text: "연습과 가성비 중심 실속급" },
];
const packOptions = [
  { id: "10구", qty: 10, multiplier: 1 },
  { id: "30구", qty: 30, multiplier: 2.62 },
];

const defaultNotifications = {
  order: false,
  delivery: false,
  coupon: false,
  marketing: false,
  restock: false,
};

const defaultCoupons = [
  {
    id: "WELCOME3000",
    title: "신규 회원가입 축하 쿠폰",
    benefit: "3,000원 할인",
    benefitAmount: 3000,
    period: "2026.06.04 - 2026.06.30",
    status: "사용 가능",
    useCount: 129,
  },
];

const defaultPosts = [
  {
    id: "POST-001",
    type: "문의",
    title: "PRO V1 A급 재입고 문의",
    date: "2026-06-04",
    status: "답변 완료",
    body: "PRO V1 A+ 등급 10구 화이트 재입고 일정이 궁금합니다.",
    answer:
      "안녕하세요, 리볼 로스트볼입니다.\nPRO V1 A+ 등급은 금일 검수분 기준으로 소량 입고 예정이며, 15시 재고 업데이트 후 구매 가능합니다.\n입고 수량이 적어 빠르게 품절될 수 있어 상품 상세 페이지의 재고 현황을 함께 확인해 주세요.",
    answeredAt: "2026-06-04 15:10",
  },
  { id: "POST-002", type: "후기", title: "타이틀리스트 10구 구성 후기", date: "2026-06-02", status: "게시 완료" },
];

function defaultAdminCredentials() {
  return {
    id: "admin",
    password: "",
  };
}

function defaultAdminProfile() {
  return {
    id: "admin",
    role: "관리자",
    email: businessProfile.supportEmail,
  };
}

function defaultAdminBanners() {
  return [
    { id: "BN-001", title: "홈 메인 배너", meta: "첫 번째 캐러셀", status: "노출중", order: 1, placement: "홈" },
    { id: "BN-002", title: "매장 이벤트 배너", meta: "두 번째 캐러셀", status: "노출중", order: 2, placement: "홈" },
    { id: "BN-003", title: "프리미엄 선별 배너", meta: "세 번째 캐러셀", status: "노출중", order: 3, placement: "홈" },
  ];
}

resetSeededMemberStorage();

const state = {
  route: parseRoute(),
  products,
  cart: load("reball.cart", []),
  wishlist: load("reball.wishlist", []),
  orders: [],
  ephemeralOrders: [],
  viewer: null,
  authSession: null,
  authUser: null,
  authReady: false,
  authBusy: false,
  authRedirect: AUTH_REDIRECT_DEFAULT,
  accountLoading: false,
  addresses: [],
  paymentMethods: [],
  notifications: normalizeNotifications(load("reball.notifications", defaultNotifications)),
  coupons: load("reball.coupons", defaultCoupons),
  posts: normalizePosts(load("reball.posts", defaultPosts)),
  activeBanner: 0,
  pendingScrollTarget: null,
  postSearch: "",
  expandedInquiryId: null,
  selected: {},
  myTab: "orders",
  selectedReviewOrderId: "",
  adminTab: "dashboard",
  adminUser: load("reball.adminUser", null),
  adminCredentials: load("reball.adminCredentials", defaultAdminCredentials()),
  adminProfile: load("reball.adminProfile", defaultAdminProfile()),
  adminBanners: load("reball.adminBanners", defaultAdminBanners()),
  adminCustomers: load("reball.adminCustomers", []),
  adminMembers: [],
  adminMembersLoading: false,
  adminMembersLoaded: false,
  adminMembersError: "",
  adminProducts: load("reball.adminProducts", []),
  adminModal: null,
  adminModalContext: null,
  adminSearch: "",
  adminLoginError: "",
  menuOpen: false,
  cartPromptOpen: false,
};

const bundleRegistry = new Map();

const banners = [
  {
    id: "quality",
    image: "banner-home-main-user-clean.webp",
    mobileImage: "banner-home-main-mobile.webp",
    showOverlay: true,
    eyebrow: "엄선된 품질, 합리적인 가격",
    title: "검수된 로스트볼,\n새 볼같은 경험",
    body: "등급 기준과 선별 검수로 믿을 수 있는\n프리미엄 로스트볼을 만나보세요.",
    cta: "대표 상품 보기",
    secondaryCta: "브랜드 전체 보기",
    secondaryScrollTarget: "products",
    route: "/product/titleist-pro-v1-v1x-lostball",
  },
  {
    id: "store",
    image: "banner-store-event-clean.webp",
    mobileImage: "banner-store-event-mobile.webp",
    showOverlay: false,
    mobileOverlay: true,
    eyebrow: "오프라인 매장 이벤트",
    title: "부천 매장 직운영\n방문 혜택 준비",
    body: "매장 방문 고객에게 현장 상담과 전용 혜택을 제공합니다.",
    cta: "매장소개 보기",
    route: "/store",
  },
  {
    id: "premium",
    image: "banner-premium-selection-clean.webp",
    mobileImage: "banner-premium-selection-mobile.webp",
    showOverlay: false,
    mobileOverlay: true,
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

function resetSeededMemberStorage() {
  try {
    if (localStorage.getItem("reball.memberInfoResetVersion") === LEGACY_MEMBER_STATE_RESET_VERSION) return;

    [
      "reball.viewer",
      "reball.orders",
      "reball.addresses",
      "reball.paymentMethods",
      "reball.notifications",
      "reball.coupons",
      "reball.posts",
    ].forEach((key) => localStorage.removeItem(key));

    localStorage.setItem("reball.memberInfoResetVersion", LEGACY_MEMBER_STATE_RESET_VERSION);
  } catch {
    localStorage.setItem("reball.memberInfoResetVersion", LEGACY_MEMBER_STATE_RESET_VERSION);
  }
}

function setAuthRedirect(route = AUTH_REDIRECT_DEFAULT) {
  const nextRoute = String(route || AUTH_REDIRECT_DEFAULT);
  state.authRedirect = nextRoute.startsWith("/") ? nextRoute : AUTH_REDIRECT_DEFAULT;
}

function consumeAuthRedirect() {
  const nextRoute = state.authRedirect || AUTH_REDIRECT_DEFAULT;
  state.authRedirect = AUTH_REDIRECT_DEFAULT;
  return nextRoute;
}

function setPendingSignupEmail(email) {
  try {
    localStorage.setItem(PENDING_SIGNUP_EMAIL_KEY, email);
  } catch {}
}

function setPendingSignupLoginId(loginId) {
  try {
    localStorage.setItem(PENDING_SIGNUP_LOGIN_ID_KEY, loginId);
  } catch {}
}

function getPendingSignupEmail() {
  try {
    return localStorage.getItem(PENDING_SIGNUP_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

function getPendingSignupLoginId() {
  try {
    return localStorage.getItem(PENDING_SIGNUP_LOGIN_ID_KEY) || "";
  } catch {
    return "";
  }
}

function clearPendingSignupEmail() {
  try {
    localStorage.removeItem(PENDING_SIGNUP_EMAIL_KEY);
  } catch {}
}

function clearPendingSignupLoginId() {
  try {
    localStorage.removeItem(PENDING_SIGNUP_LOGIN_ID_KEY);
  } catch {}
}

function clearPendingSignup() {
  clearPendingSignupEmail();
  clearPendingSignupLoginId();
}

function normalizeLoginId(value) {
  return stringOrEmpty(value).trim().toLowerCase();
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function validateLoginId(loginId) {
  if (!loginId) return "아이디를 입력하세요.";
  if (isEmailLike(loginId)) return "아이디는 이메일 주소가 아닌 영문/숫자 조합으로 입력하세요.";
  if (!LOGIN_ID_PATTERN.test(loginId)) return "아이디는 영문 소문자 또는 숫자로 시작하고, 영문/숫자/./_/- 조합 4~20자로 입력하세요.";
  return "";
}

function showToastAfterNavigation(message) {
  const emit = () => window.requestAnimationFrame(() => showToast(message));
  window.addEventListener("hashchange", emit, { once: true });
  window.setTimeout(emit, 300);
}

async function signInWithIdentifier(identifier, password) {
  const normalizedIdentifier = stringOrEmpty(identifier).trim().toLowerCase();
  if (!isEmailLike(normalizedIdentifier)) {
    const invalidMessage = validateLoginId(normalizeLoginId(normalizedIdentifier));
    if (invalidMessage) throw new Error(invalidMessage);
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/login-with-identifier`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({ identifier: normalizedIdentifier, password }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || "아이디 또는 비밀번호를 확인하세요.");
  if (!payload?.access_token || !payload?.refresh_token) throw new Error("로그인 응답을 처리하지 못했습니다.");

  const { data, error } = await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  });
  if (error) throw error;
  return data;
}

async function signUpWithLoginId(payload) {
  const response = await fetch(SIGNUP_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || "회원가입을 처리하지 못했습니다.");
  if (!result?.access_token || !result?.refresh_token) throw new Error("회원가입 세션을 처리하지 못했습니다.");

  const { data, error } = await supabase.auth.setSession({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
  });
  if (error) throw error;
  return data;
}

function handleAuthCallbackHash() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash || hash.startsWith("/")) return false;

  const params = new URLSearchParams(hash);
  const hasAuthToken = params.has("access_token") || params.has("refresh_token");
  const hasAuthError = params.has("error") || params.has("error_code");
  if (!hasAuthToken && !hasAuthError) return false;

  if (hasAuthError) {
    showToastAfterNavigation("인증 링크가 이미 처리되었거나 만료되었습니다. 가입한 아이디 또는 이메일로 로그인해 주세요.");
    routeTo("/login");
    return true;
  }

  showToastAfterNavigation("이메일 인증이 완료되었습니다.");
  routeTo("/mypage");
  return true;
}

function setFormBusy(form, pending) {
  state.authBusy = pending;
  const submitButton = form?.querySelector('[type="submit"]');
  if (submitButton) {
    submitButton.disabled = pending;
    submitButton.dataset.originalLabel ||= submitButton.textContent;
    submitButton.textContent = pending ? "처리 중..." : submitButton.dataset.originalLabel;
  }
}

async function ensureProfileRecord(user, profileOverrides = null) {
  const { data: currentProfile, error: selectError } = await supabase
    .from("profiles")
    .select("id, login_id, auth_email, name, phone, telephone, email, provider, marketing_email, marketing_sms, birth_date, anniversary_date, spouse_birth_date, region")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (currentProfile && !profileOverrides) return currentProfile;

  const metadata = user.user_metadata ?? {};
  const payload = {
    id: user.id,
    login_id: normalizeLoginId(profileOverrides?.login_id ?? currentProfile?.login_id ?? metadata.login_id),
    auth_email: stringOrEmpty(currentProfile?.auth_email ?? user.email),
    name: stringOrEmpty(profileOverrides?.name ?? currentProfile?.name ?? metadata.name),
    phone: stringOrEmpty(profileOverrides?.phone ?? currentProfile?.phone ?? metadata.phone),
    telephone: stringOrEmpty(profileOverrides?.telephone ?? currentProfile?.telephone ?? metadata.telephone),
    email: stringOrEmpty(profileOverrides?.email ?? currentProfile?.email ?? user.email),
    provider: stringOrEmpty(profileOverrides?.provider ?? currentProfile?.provider ?? user.app_metadata?.provider ?? metadata.provider ?? "email"),
    marketing_email: profileOverrides?.marketing_email ?? currentProfile?.marketing_email ?? Boolean(metadata.marketing_email),
    marketing_sms: profileOverrides?.marketing_sms ?? currentProfile?.marketing_sms ?? Boolean(metadata.marketing_sms),
    birth_date: stringOrEmpty(profileOverrides?.birth_date ?? currentProfile?.birth_date ?? metadata.birth_date),
    anniversary_date: stringOrEmpty(profileOverrides?.anniversary_date ?? currentProfile?.anniversary_date ?? metadata.anniversary_date),
    spouse_birth_date: stringOrEmpty(profileOverrides?.spouse_birth_date ?? currentProfile?.spouse_birth_date ?? metadata.spouse_birth_date),
    region: stringOrEmpty(profileOverrides?.region ?? currentProfile?.region ?? metadata.region),
    updated_at: new Date().toISOString(),
  };

  const profileQuery = currentProfile
    ? supabase
        .from("profiles")
        .update({
          name: payload.name,
          phone: payload.phone,
          telephone: payload.telephone,
          email: payload.email,
          marketing_email: payload.marketing_email,
          marketing_sms: payload.marketing_sms,
          birth_date: payload.birth_date,
          anniversary_date: payload.anniversary_date,
          spouse_birth_date: payload.spouse_birth_date,
          region: payload.region,
          updated_at: payload.updated_at,
        })
        .eq("id", user.id)
    : supabase.from("profiles").insert(payload);

  const { data: profile, error: upsertError } = await profileQuery
    .select("id, login_id, auth_email, name, phone, telephone, email, provider, marketing_email, marketing_sms, birth_date, anniversary_date, spouse_birth_date, region")
    .single();

  if (upsertError) throw upsertError;
  return profile;
}

async function loadAccountData(user, options = {}) {
  const { silent = false } = options;
  state.accountLoading = true;
  if (!silent && parseRoute() === "/mypage") renderMypage();

  try {
    const profile = await ensureProfileRecord(user);
    const [addressesResult, ordersResult, orderItemsResult] = await Promise.all([
      supabase
        .from("addresses")
        .select("id, profile_id, receiver_name, receiver_phone, zip_code, road_address, detail_address, is_default")
        .order("is_default", { ascending: false })
        .order("id", { ascending: true }),
      supabase
        .from("orders")
        .select("id, order_no, status, payment_status, payment_method, total_krw, created_at, address_snapshot")
        .order("created_at", { ascending: false }),
      supabase
        .from("order_items")
        .select("order_id, product_name, variant_name, qty, unit_price_krw, line_total_krw"),
    ]);

    if (addressesResult.error) throw addressesResult.error;
    if (ordersResult.error) throw ordersResult.error;
    if (orderItemsResult.error) throw orderItemsResult.error;

    const itemsByOrderId = new Map();
    for (const item of orderItemsResult.data ?? []) {
      const group = itemsByOrderId.get(item.order_id) ?? [];
      group.push(item);
      itemsByOrderId.set(item.order_id, group);
    }

    state.viewer = buildViewer(user, profile);
    state.addresses = (addressesResult.data ?? []).map(mapAddressRecord);
    state.orders = (ordersResult.data ?? []).map((order) => mapOrderRecord(order, itemsByOrderId.get(order.id) ?? []));
    state.paymentMethods = [];
  } finally {
    state.accountLoading = false;
  }
}

async function syncSessionState(session, options = {}) {
  const { silent = false } = options;

  if (!session?.user) {
    emptyAuthData();
    return;
  }

  state.authSession = session;
  state.authUser = session.user;
  await loadAccountData(session.user, { silent });
}

async function initializeAuth() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw error;
    await syncSessionState(session, { silent: true });
  } catch (error) {
    emptyAuthData();
    showToast(normalizeAuthError(error, "로그인 상태를 확인하지 못했습니다."));
  } finally {
    state.authReady = true;
    if (!handleAuthCallbackHash()) renderRoute();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    Promise.resolve()
      .then(async () => {
        if (event === "SIGNED_OUT") {
          emptyAuthData();
          state.adminMembers = [];
          state.adminMembersLoaded = false;
          state.adminMembersError = "";
          if (parseRoute() === "/mypage") routeTo("/login");
          else renderRoute();
          return;
        }

        if (session?.user) {
          state.authSession = session;
          state.authUser = session.user;
          if (event !== "TOKEN_REFRESHED") await loadAccountData(session.user, { silent: true });
          else if (!state.viewer) state.viewer = buildViewer(session.user);

          if ((event === "SIGNED_IN" || event === "USER_UPDATED") && parseRoute().startsWith("/login")) {
            routeTo(consumeAuthRedirect());
            return;
          }

          if (parseRoute().startsWith("/admin")) {
            state.adminMembersLoaded = false;
          }
          renderRoute();
        }
      })
      .catch((error) => showToast(normalizeAuthError(error)));
  });
}

async function handleAuthFormSubmit(form) {
  const mode = form.dataset.authMode;
  const formData = new FormData(form);
  const identifier = stringOrEmpty(formData.get("identifier") ?? formData.get("loginId") ?? formData.get("email")).trim();
  const password = stringOrEmpty(formData.get("password"));

  if (!identifier || !password) {
    showToast("아이디와 비밀번호를 입력하세요.");
    return;
  }

  setAuthRedirect(form.dataset.authRedirect || AUTH_REDIRECT_DEFAULT);
  setFormBusy(form, true);

  try {
    if (mode === "signup") {
      const loginId = normalizeLoginId(formData.get("loginId"));
      const loginIdError = validateLoginId(loginId);
      if (loginIdError) {
        showToast(loginIdError);
        return;
      }

      const email = stringOrEmpty(formData.get("contactEmail")).trim().toLowerCase();
      if (!email || !isEmailLike(email)) {
        showToast("주문 안내를 받을 이메일 주소를 입력하세요.");
        return;
      }

      const passwordConfirm = stringOrEmpty(formData.get("passwordConfirm"));
      if (password !== passwordConfirm) {
        showToast("비밀번호 확인이 일치하지 않습니다.");
        return;
      }

      const name = stringOrEmpty(formData.get("name")).trim();
      const phone = stringOrEmpty(formData.get("phone")).trim();
      if (!name || !phone) {
        showToast("이름과 휴대전화를 입력하세요.");
        return;
      }

      const signupPayload = {
        loginId,
        email,
        password,
        profile: {
          name,
          phone,
          telephone: stringOrEmpty(formData.get("tel")).trim(),
          contact_email: email,
          marketing_email: boolFromYesNo(formData.get("emailOptIn")),
          marketing_sms: boolFromYesNo(formData.get("smsOptIn")),
          birth_date: stringOrEmpty(formData.get("birthday")).trim(),
          anniversary_date: stringOrEmpty(formData.get("anniversary")).trim(),
          spouse_birth_date: stringOrEmpty(formData.get("spouseBirthday")).trim(),
          region: stringOrEmpty(formData.get("region")).trim(),
          default_address_zip: "",
          default_address_road: stringOrEmpty(formData.get("address")).trim(),
          default_address_detail: "",
          provider: "email",
        },
      };

      const data = await signUpWithLoginId(signupPayload);
      const signedUpUser = data.user ?? data.session?.user;
      if (!signedUpUser) throw new Error("회원가입 응답을 처리하지 못했습니다.");

      clearPendingSignup();
      await loadAccountData(signedUpUser);
      showToast("회원가입이 완료되었습니다. 바로 쇼핑할 수 있습니다.");
      routeTo(consumeAuthRedirect());

      return;
    }

    const data = await signInWithIdentifier(identifier, password);
    const signedInUser = data.user ?? data.session?.user;
    if (!signedInUser) throw new Error("로그인 응답을 처리하지 못했습니다.");

    await loadAccountData(signedInUser);
    clearPendingSignup();
    showToast("로그인되었습니다.");
    routeTo(consumeAuthRedirect());
  } catch (error) {
    showToast(normalizeAuthError(error));
  } finally {
    setFormBusy(form, false);
  }
}

async function handleLogout(redirect = "/") {
  try {
    await supabase.auth.signOut();
    emptyAuthData();
    showToast("로그아웃되었습니다.");
    routeTo(redirect);
  } catch (error) {
    showToast(normalizeAuthError(error, "로그아웃하지 못했습니다."));
  }
}

async function loadAdminMembers(options = {}) {
  const { force = false, silent = true } = options;
  if (!state.adminUser || state.adminMembersLoading) return;
  if (state.adminMembersLoaded && !force) return;
  if (!state.authReady) return;

  if (!state.authSession?.access_token) {
    state.adminMembersLoaded = true;
    state.adminMembersError = "관리자 회원 목록은 Supabase owner_admin 세션으로 로그인해야 조회할 수 있습니다.";
    if (!silent && parseRoute().startsWith("/admin")) renderAdmin();
    return;
  }

  state.adminMembersLoading = true;
  state.adminMembersError = "";
  if (!silent && parseRoute().startsWith("/admin")) renderAdmin();

  try {
    const response = await fetch(ADMIN_MEMBERS_FUNCTION_URL, {
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${state.authSession.access_token}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || "회원 목록을 불러오지 못했습니다.");
    state.adminMembers = Array.isArray(payload.members) ? payload.members : [];
    state.adminMembersLoaded = true;
  } catch (error) {
    state.adminMembersLoaded = true;
    state.adminMembersError = normalizeAuthError(error, "회원 목록을 불러오지 못했습니다.");
  } finally {
    state.adminMembersLoading = false;
    if (parseRoute().startsWith("/admin")) renderAdmin();
  }
}

async function handleProfileSave(form) {
  if (!state.authUser) {
    showToast("로그인 상태를 다시 확인해 주세요.");
    routeTo("/login");
    return;
  }

  const formData = new FormData(form);
  const payload = {
    name: stringOrEmpty(formData.get("name")).trim(),
    phone: stringOrEmpty(formData.get("phone")).trim(),
    telephone: stringOrEmpty(formData.get("telephone")).trim(),
    email: stringOrEmpty(formData.get("email")).trim() || stringOrEmpty(state.authUser.email),
    marketing_sms: boolFromYesNo(formData.get("smsOptIn")),
    marketing_email: boolFromYesNo(formData.get("emailOptIn")),
    birth_date: stringOrEmpty(formData.get("birthday")).trim(),
    anniversary_date: stringOrEmpty(formData.get("anniversary")).trim(),
    spouse_birth_date: stringOrEmpty(formData.get("spouseBirthday")).trim(),
    region: stringOrEmpty(formData.get("region")).trim(),
  };

  try {
    const profile = await ensureProfileRecord(state.authUser, payload);
    state.viewer = buildViewer(state.authUser, profile);
    showToast("회원 정보가 수정되었습니다.");
    renderMypage();
  } catch (error) {
    showToast(normalizeAuthError(error, "회원 정보를 저장하지 못했습니다."));
  }
}

async function handleAddressCreate(form) {
  if (!state.authUser) {
    showToast("로그인 상태를 다시 확인해 주세요.");
    routeTo("/login");
    return;
  }

  const formData = new FormData(form);
  const payload = {
    profile_id: state.authUser.id,
    receiver_name: stringOrEmpty(formData.get("recipient")).trim(),
    receiver_phone: stringOrEmpty(formData.get("phone")).trim(),
    zip_code: stringOrEmpty(formData.get("zipCode")).trim(),
    road_address: stringOrEmpty(formData.get("roadAddress")).trim(),
    detail_address: stringOrEmpty(formData.get("detailAddress")).trim(),
    is_default: state.addresses.length === 0,
  };

  if (!payload.receiver_name || !payload.receiver_phone || !payload.road_address) {
    showToast("수령인, 연락처, 주소를 입력하세요.");
    return;
  }

  try {
    const { error } = await supabase.from("addresses").insert(payload);
    if (error) throw error;
    await loadAccountData(state.authUser, { silent: true });
    showToast("배송지를 추가했습니다.");
    renderMypage();
  } catch (error) {
    showToast(normalizeAuthError(error, "배송지를 저장하지 못했습니다."));
  }
}

async function handleAddressDefault(addressId) {
  if (!state.authUser) return;

  try {
    const { error: clearError } = await supabase.from("addresses").update({ is_default: false }).eq("profile_id", state.authUser.id);
    if (clearError) throw clearError;
    const { error: setError } = await supabase.from("addresses").update({ is_default: true }).eq("id", addressId).eq("profile_id", state.authUser.id);
    if (setError) throw setError;
    await loadAccountData(state.authUser, { silent: true });
    showToast("기본 배송지를 변경했습니다.");
    renderMypage();
  } catch (error) {
    showToast(normalizeAuthError(error, "기본 배송지를 변경하지 못했습니다."));
  }
}

async function handleAddressDelete(addressId) {
  if (!state.authUser) return;

  try {
    const deletingAddress = state.addresses.find((address) => address.id === addressId);
    const { error: deleteError } = await supabase.from("addresses").delete().eq("id", addressId).eq("profile_id", state.authUser.id);
    if (deleteError) throw deleteError;

    if (deletingAddress?.isDefault) {
      const { data: remainingRows, error: remainingError } = await supabase
        .from("addresses")
        .select("id, is_default")
        .eq("profile_id", state.authUser.id)
        .order("id", { ascending: true });

      if (remainingError) throw remainingError;
      if (remainingRows?.length && !remainingRows.some((row) => row.is_default)) {
        const { error: defaultError } = await supabase.from("addresses").update({ is_default: true }).eq("id", remainingRows[0].id).eq("profile_id", state.authUser.id);
        if (defaultError) throw defaultError;
      }
    }

    await loadAccountData(state.authUser, { silent: true });
    showToast("배송지를 삭제했습니다.");
    renderMypage();
  } catch (error) {
    showToast(normalizeAuthError(error, "배송지를 삭제하지 못했습니다."));
  }
}

function normalizeNotifications(notifications) {
  return {
    ...defaultNotifications,
    ...(notifications && typeof notifications === "object" && !Array.isArray(notifications) ? notifications : {}),
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function siteUrl() {
  return `${location.origin}${location.pathname}`;
}

function stringOrEmpty(value) {
  return value == null ? "" : String(value);
}

function asYesNo(value) {
  return value ? "yes" : "no";
}

function boolFromYesNo(value) {
  return String(value || "").toLowerCase() === "yes";
}

function formatDateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric" }).format(date);
}

function formatAccountAddress(address) {
  return [address.zipCode, address.roadAddress, address.detailAddress].filter(Boolean).join(" ").trim();
}

function translateOrderStatus(status) {
  return ORDER_STATUS_LABELS[status] ?? status ?? "주문 접수";
}

function translatePaymentMethod(method) {
  return PAYMENT_METHOD_LABELS[method] ?? method ?? "결제수단 미정";
}

function allOrders() {
  return [...state.ephemeralOrders, ...state.orders];
}

function findOrderById(orderId) {
  return allOrders().find((item) => item.id === orderId);
}

function normalizeAuthError(error, fallback = "요청을 처리하지 못했습니다.") {
  const message = String(error?.message || fallback);
  if (message.includes("Invalid login credentials")) return "아이디 또는 비밀번호를 확인하세요.";
  if (message.includes("Email not confirmed")) return "이메일 인증 후 다시 로그인해 주세요.";
  if (message.includes("User already registered")) return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (message.includes("Email already registered")) return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (message.includes("Login id already exists")) return "이미 사용 중인 아이디입니다.";
  if (message.includes("Admin access denied")) return "관리자 권한이 있는 계정으로 로그인해 주세요.";
  if (message.includes("Admin session required")) return "관리자 회원 목록을 보려면 관리자 권한 계정으로 로그인해 주세요.";
  if (message.includes("Database error saving new user")) return "이미 사용 중인 아이디이거나 회원 정보를 저장하지 못했습니다.";
  if (message.includes("Password should be at least")) return "비밀번호는 6자 이상으로 입력해 주세요.";
  return message;
}

function emptyAuthData() {
  state.viewer = null;
  state.authSession = null;
  state.authUser = null;
  state.orders = [];
  state.addresses = [];
  state.paymentMethods = [];
}

function buildViewer(user, profile = {}) {
  const metadata = user?.user_metadata ?? {};
  const appMetadata = user?.app_metadata ?? {};
  return {
    id: user?.id ?? profile.id ?? "",
    loginId: stringOrEmpty(profile.login_id ?? metadata.login_id),
    loginEmail: stringOrEmpty(user?.email),
    email: stringOrEmpty(profile.email ?? user?.email),
    name: stringOrEmpty(profile.name ?? metadata.name ?? user?.email?.split("@")[0]),
    phone: stringOrEmpty(profile.phone ?? metadata.phone),
    telephone: stringOrEmpty(profile.telephone ?? metadata.telephone),
    smsOptIn: asYesNo(profile.marketing_sms ?? metadata.marketing_sms),
    emailOptIn: asYesNo(profile.marketing_email ?? metadata.marketing_email),
    birthday: stringOrEmpty(profile.birth_date ?? metadata.birth_date),
    anniversary: stringOrEmpty(profile.anniversary_date ?? metadata.anniversary_date),
    spouseBirthday: stringOrEmpty(profile.spouse_birth_date ?? metadata.spouse_birth_date),
    region: stringOrEmpty(profile.region ?? metadata.region),
    provider: stringOrEmpty(profile.provider ?? appMetadata.provider ?? metadata.provider ?? "email"),
  };
}

function mapAddressRecord(row) {
  const address = {
    id: row.id,
    profileId: row.profile_id,
    label: row.is_default ? "기본 배송지" : "배송지",
    recipient: stringOrEmpty(row.receiver_name),
    phone: stringOrEmpty(row.receiver_phone),
    zipCode: stringOrEmpty(row.zip_code),
    roadAddress: stringOrEmpty(row.road_address),
    detailAddress: stringOrEmpty(row.detail_address),
    address: [row.zip_code, row.road_address, row.detail_address].filter(Boolean).join(" "),
    memo: "",
    isDefault: Boolean(row.is_default),
  };
  return address;
}

function guessProductFromOrderItem(item) {
  const name = stringOrEmpty(item?.product_name);
  return state.products.find((product) => name.includes(product.brandName) || name.includes(product.name.replace(" 로스트볼", ""))) ?? null;
}

function mapOrderRecord(row, items = []) {
  const normalizedItems = items.map((item) => {
    const product = guessProductFromOrderItem(item);
    return {
      key: `${row.order_no || row.id}-${item.product_name}-${item.variant_name}`,
      slug: product?.slug ?? "",
      name: stringOrEmpty(item.product_name),
      brandName: product?.brandName ?? stringOrEmpty(item.product_name).split(" ")[0],
      image: product?.image ?? "ball-titleist.png",
      selection: { model: stringOrEmpty(item.variant_name) },
      price: Number(item.unit_price_krw ?? 0),
      quantity: Number(item.qty ?? 0),
    };
  });

  const payment = translatePaymentMethod(row.payment_method);
  return {
    id: stringOrEmpty(row.order_no || row.id),
    dbId: row.id,
    date: formatDateLabel(row.created_at),
    status: translateOrderStatus(row.status),
    delivery: translateOrderStatus(row.status),
    total: Number(row.total_krw ?? 0),
    customer: {
      name: stringOrEmpty(state.viewer?.name),
      phone: stringOrEmpty(state.viewer?.phone),
      address: stringOrEmpty(row.address_snapshot?.road_address || row.address_snapshot?.address || ""),
      memo: stringOrEmpty(row.address_snapshot?.memo || ""),
      payment,
    },
    items: normalizedItems,
  };
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
    window.requestAnimationFrame(flushPendingScroll);
  }
}

function flushPendingScroll() {
  if (parseRoute() !== "/" || !state.pendingScrollTarget) return;
  const target = document.getElementById(state.pendingScrollTarget);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  state.pendingScrollTarget = null;
}

function asset(name) {
  return `${ASSET_PATH}/${name}?v=${ASSET_VERSION}`;
}

function iconAsset(name) {
  return asset(`ui-icons/${name}.${svgUiIconNames.has(name) ? "svg" : "png"}`);
}

function renderUiIcon(name, className = "ui-icon") {
  return `<img class="${className}" src="${iconAsset(name)}" alt="" />`;
}

function shopIconAsset(name) {
  return asset(`ui-icons/${shopIconFileMap[name] ?? name}.png`);
}

function renderShopIcon(name, className = "ui-icon") {
  return `<img class="${className} shop-icon-22" src="${shopIconAsset(name)}" alt="" />`;
}

function productBySlug(slug) {
  return catalogProducts().find((product) => product.slug === slug || product.aliasSlugs?.includes(slug)) ?? catalogProducts()[0];
}

function productByBrand(brandSlug) {
  return catalogProducts().filter((product) => product.brandSlug === brandSlug);
}

function catalogProducts() {
  return [...(state.adminProducts || []), ...products];
}

function brandLabel(brandSlug) {
  return brandMenu.find(([slug]) => slug === brandSlug)?.[1] ?? "전체 상품";
}

function primaryProductSlug(brandSlug) {
  return productByBrand(brandSlug)[0]?.slug;
}

function brandProductRoute(brandSlug) {
  const productSlug = primaryProductSlug(brandSlug);
  return productSlug ? `/product/${productSlug}` : "/";
}

function shippingCost(total) {
  if (!total) return 0;
  return total >= shippingPolicy.freeThreshold ? 0 : shippingPolicy.baseFee;
}

function getSelection(product) {
  const selected = state.selected[product.slug] ?? {};
  return {
    model: selected.model ?? product.models[0],
    grade: selected.grade ?? "A",
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

function bundleId(bundle) {
  if (bundle.id) return bundle.id;
  const title = (bundle.title || "bundle")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const productsKey = bundle.products.map((product) => product.slug).join("-");
  return `${title || "bundle"}__${productsKey}__${bundle.price}`;
}

function registerBundle(bundle) {
  const id = bundleId(bundle);
  bundleRegistry.set(id, {
    id,
    title: bundle.title,
    desc: bundle.desc,
    price: bundle.price,
    image: bundle.image ?? bundle.products[0]?.image,
    brandName: bundle.brandName ?? "추천 세트",
    products: bundle.products.map((product) => ({
      slug: product.slug,
      name: product.name,
      brandName: product.brandName,
      image: product.image,
    })),
  });
  return id;
}

function cartItemDescription(item) {
  if (item.kind === "bundle") return item.summary ?? "세트 구성";
  const selection = item.selection ?? {};
  return [selection.model, selection.grade, selection.pack, selection.color].filter(Boolean).join(" / ");
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function isLoggedIn() {
  return Boolean(state.authUser);
}

function isWished(slug) {
  return state.wishlist.includes(slug);
}

function toggleWishlist(slug) {
  let message;
  if (isWished(slug)) {
    state.wishlist = state.wishlist.filter((item) => item !== slug);
    message = "찜 목록에서 해제했습니다.";
  } else {
    state.wishlist = [...state.wishlist, slug];
    message = "찜 목록에 담았습니다.";
  }
  save("reball.wishlist", state.wishlist);
  renderRoute();
  showToast(message);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMultilineText(value) {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function normalizePosts(posts) {
  const defaultAnswer = defaultPosts.find((post) => post.id === "POST-001");
  const source = Array.isArray(posts) ? posts : defaultPosts;
  return source.map((post) => {
    if (post.id !== "POST-001" || post.answer) return post;
    return {
      ...post,
      status: "답변 완료",
      body: post.body || defaultAnswer.body,
      answer: defaultAnswer.answer,
      answeredAt: defaultAnswer.answeredAt,
    };
  });
}

function layout(content, options = {}) {
  app.innerHTML = `
    <div class="app-shell">
      ${options.noHeader ? "" : renderHeader()}
      <main${options.mainClass ? ` class="${options.mainClass}"` : ""}>${content}</main>
      ${options.admin || options.noFooter ? "" : renderFooter()}
      ${renderToast()}
    </div>
  `;
  bindGlobalEvents();
  bindPageEvents();
}

function renderHeader() {
  const route = parseRoute();
  const isExcludedIconRoute = route.startsWith("/mypage") || route.startsWith("/admin");
  const headerSearchIcon = isExcludedIconRoute ? renderUiIcon("search", "header-glyph-img") : renderShopIcon("search", "header-glyph-img");
  const headerCartIcon = isExcludedIconRoute ? renderUiIcon("cart", "header-glyph-img") : renderShopIcon("cart", "header-glyph-img");
  const items = [
    ["검수기준", "/inspection"],
    ["매장소개", "/store"],
    ["고객센터", "/customer-center"],
    ["장바구니", "/cart"],
    ["마이페이지", "/mypage"],
  ];

  return `
    <header class="site-header">
      <a class="brand-lockup" href="#/" aria-label="리볼 로스트볼 홈">
        <img src="${asset("reball-logo.png")}" alt="" />
      </a>
      <nav class="site-nav" aria-label="주요 메뉴">
        <div class="nav-menu-wrap">
          <button class="nav-link" type="button" data-product-menu>상품</button>
          ${renderProductMenu("desktop-product-menu")}
        </div>
        ${items.map(([label, route]) => `<a class="nav-link" href="#${route}">${label}</a>`).join("")}
      </nav>
      <div class="header-actions">
        ${renderHeaderAuth()}
        <button class="icon-btn plain-header-icon image-icon-btn" type="button" data-product-menu aria-label="상품 선택">${headerSearchIcon}</button>
        <a class="icon-btn plain-header-icon image-icon-btn" href="#/cart" aria-label="장바구니">${headerCartIcon}<b>${state.cart.length}</b></a>
      </div>
      <button class="mobile-menu ${state.menuOpen ? "is-open" : ""}" type="button" data-product-menu aria-label="상품 메뉴"><span></span><span></span><span></span></button>
      ${renderProductMenu("mobile-product-menu")}
    </header>
  `;
}

function renderHeaderAuth() {
  if (isLoggedIn()) {
    return `<button class="auth-link" type="button" data-logout>로그아웃</button>`;
  }

  return `
    <div class="header-auth" aria-label="회원 메뉴">
      <button class="auth-link auth-link-primary" type="button" data-route="/signup">회원가입</button>
      <button class="auth-link" type="button" data-route="/login">로그인</button>
      <button class="auth-link" type="button" data-route="/login/order">주문조회</button>
    </div>
  `;
}

function renderProductMenu(extraClass) {
  const isMobileMenu = extraClass.includes("mobile-product-menu");
  return `
    <div class="product-menu ${extraClass} ${state.menuOpen ? "is-open" : ""}" data-product-panel>
      <a href="#/">전체(로스트볼)</a>
      ${brandMenu
        .map(([slug, label]) => {
          const href = `#${brandProductRoute(slug)}`;
          return `<a href="${href}">${escapeHtml(label)}</a>`;
        })
        .join("")}
      ${isMobileMenu ? '<a class="product-menu-account" href="#/mypage">마이페이지</a>' : ""}
    </div>
  `;
}

function renderFooter() {
  const shoppingLinks = [
    ["전체 상품", "/"],
    ["등급 안내", "/inspection"],
  ];
  const supportLinks = [
    ["공지사항", "/notice"],
    ["자주 묻는 질문", "/faq"],
    ["문의하기", "/customer-center"],
  ];
  const shippingLinks = [
    ["주문 안내", "/customer-center"],
    ["배송 안내", "/customer-center"],
    ["교환/반품 안내", "/customer-center"],
    ["배송 조회", "/mypage"],
  ];
  const companyLinks = [
    ["회사 소개", "/brand-story"],
    ["이용 약관", "/customer-center"],
    ["개인정보처리방침", "/customer-center"],
    ["사업자 정보 확인", "/customer-center"],
    ["관리자", "/admin"],
  ];

  return `
    <footer class="site-footer">
      <section class="site-footer-card">
        <div class="footer-main">
          <div class="footer-brand">
            <a class="footer-brand-lockup" href="#/" aria-label="리볼 로스트볼 홈">
              <img src="${asset("reball-logo.png")}" alt="" />
              <div class="footer-brand-text">
                <strong>리볼 로스트볼</strong>
                <span>REBALL LOSTBALL</span>
              </div>
            </a>
            <p>좋은 품질의 로스트볼을 합리적인 가격으로 제공합니다.</p>
          </div>
          ${renderFooterColumn("쇼핑", shoppingLinks)}
          ${renderFooterColumn("고객센터", supportLinks)}
          ${renderFooterColumn("주문/배송", shippingLinks)}
          ${renderFooterColumn("회사 정보", companyLinks)}
          <div class="footer-contact">
            <h2>고객센터</h2>
            <a href="tel:${businessProfile.supportPhone.replaceAll("-", "")}">${businessProfile.supportPhone}</a>
            <p>${businessProfile.supportEmail}</p>
            <span>평일 ${businessProfile.operationHours}</span>
          </div>
        </div>
        <div class="footer-bottom">
          <p>대표 ${businessProfile.owner} · 사업자등록번호 ${businessProfile.businessNumber} · 이메일 ${businessProfile.supportEmail}</p>
          <small>Copyright(C) 2025 REBALL LOSTBALL. All rights reserved.</small>
        </div>
      </section>
    </footer>
  `;
}

function renderFooterColumn(title, items) {
  return `
    <nav class="footer-column" aria-label="${escapeHtml(title)}">
      <h2>${escapeHtml(title)}</h2>
      ${items.map(([label, route]) => `<a href="#${route}">${escapeHtml(label)}</a>`).join("")}
    </nav>
  `;
}

function renderToast() {
  return `
    <div class="toast" data-toast aria-live="polite"></div>
    ${renderCartMovePrompt()}
  `;
}

function renderCartMovePrompt() {
  return `
    <div class="cart-move-prompt ${state.cartPromptOpen ? "is-open" : ""}" data-cart-prompt aria-hidden="${state.cartPromptOpen ? "false" : "true"}">
      <button class="modal-backdrop" type="button" data-cart-continue aria-label="계속 쇼핑"></button>
      <section class="cart-move-card" role="dialog" aria-modal="true" aria-labelledby="cart-move-title">
        <p>장바구니 담기 완료</p>
        <h2 id="cart-move-title">장바구니 화면으로 이동하시겠습니까?</h2>
        <div>
          <button class="secondary-btn compact" type="button" data-cart-continue>계속 쇼핑</button>
          <button class="gold-cart-btn compact" type="button" data-cart-confirm>장바구니 이동 ${shopIcons.cart}</button>
        </div>
      </section>
    </div>
  `;
}

function renderHome() {
  const titleist = productByBrand("titleist")[0];
  const taylormade = productByBrand("taylormade")[0];
  const bridgestone = productByBrand("bridgestone")[0];
  const callaway = productByBrand("callaway")[0];
  const srixon = productByBrand("srixon")[0];
  const volvik = productByBrand("volvik")[0];
  const saintnine = productByBrand("saintnine")[0];
  const mix = productByBrand("mix")[0];
  const bestSellers = [
    { ...titleist, line: "PRO V1", name: "타이틀리스트 PRO V1 로스트볼", grade: "S", review: "실전 라운드와 선물용으로 많이 찾는 구성입니다" },
    { ...taylormade, line: "TP5 / TP5X", grade: "A", review: "투어 계열 타구감과 비거리를 함께 챙기기 좋습니다" },
    { ...bridgestone, line: "투어 X / XS", grade: "A", review: "직진성 위주로 찾는 고객 문의가 많은 구성입니다" },
    { ...volvik, line: "비비드 컬러", name: "볼빅 비비드 컬러 로스트볼", grade: "B", review: "컬러볼 입문과 연습용으로 부담 없이 고를 수 있습니다" },
    { ...callaway, line: "CHROME TOUR", grade: "A", review: "비거리와 컨트롤 밸런스를 찾는 고객에게 맞는 구성입니다" },
    { ...srixon, line: "Z-STAR", grade: "A", review: "재구매 비중이 높은 스핀 컨트롤 중심 라인입니다" },
  ];
  const storeProducts = [
    { product: titleist, title: "타이틀리스트 로스트볼", meta: "PRO V1 / PRO V1X / 투어스피드 / 트루필 / 벨로시티", note: "S / A / 10구 · 30구" },
    { product: taylormade, title: "테일러메이드 로스트볼", meta: "TP5 / TP5X / TP5 Pix / 투어리스폰스 / 혼합", note: "A / 10구 · 30구" },
    { product: bridgestone, title: "브리지스톤 로스트볼", meta: "투어 X / XS / E12 / 혼합", note: "A / 10구 · 30구" },
    { product: callaway, title: "캘러웨이 CHROME TOUR 로스트볼", meta: "CHROME TOUR / 트리플트랙", note: "A / 10구 · 30구" },
    { product: srixon, title: "스릭슨 로스트볼", meta: "Z-STAR / 반반볼", note: "A / 10구 · 30구" },
    { product: volvik, title: "볼빅 로스트볼", meta: "비비드 컬러 / 화이트 / 반반볼 크리스탈", note: "B / 10구 · 30구" },
    { product: saintnine, title: "세인트나인 로스트볼", meta: "화이트 / 컬러", note: "A / 10구 · 30구" },
    { product: mix, title: "브랜드혼합 로스트볼", meta: "화이트 / 컬러", note: "B / 실속형" },
  ];
  const bundleSets = [
    { title: "타이틀리스트 인기 세트", products: [titleist, titleist], desc: "PRO V1 10구 + PRO V1X 10구", price: 25800 },
    { title: "스핀 & 컨트롤 세트", products: [taylormade, srixon], desc: "TP5 / TP5X 10구 + Z-STAR 10구", price: 23800 },
    { title: "직진성 추천 세트", products: [bridgestone, callaway], desc: "투어 X / XS 10구 + CHROME TOUR 10구", price: 23800 },
    { title: "가성비 실속 세트", products: [saintnine, mix], desc: "세인트나인 10구 + 브랜드혼합 10구", price: 18900 },
  ];
  const homeFilterChips = [
    ["전체", "/"],
    ...brandMenu.map(([slug, label]) => [label, brandProductRoute(slug)]),
  ];
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

    <section class="home-filter panel-card" id="products">
      <div>
        <p>인기 제품</p>
        <span>지금 많이 찾는 제품이에요</span>
      </div>
      <div class="chip-row" aria-label="상품 필터">
        ${homeFilterChips
          .map(
            ([label, route], index) =>
              `<button class="${index === 0 ? "is-active" : ""}" type="button" data-route="${route}">${escapeHtml(label)}</button>`
          )
          .join("")}
      </div>
      <div class="home-filter-actions">
        <button class="gold-cart-btn compact" type="button" data-add-card="${titleist.slug}">장바구니 담기 ${shopIcons.cart}</button>
        <button class="secondary-btn compact" type="button" data-route="/product/${titleist.slug}">전체보기</button>
      </div>
    </section>

    <section class="home-section panel-card bestseller-section">
      <header class="home-section-head">
        <div>
          <p>베스트셀러</p>
          <h1>많이 찾는 인기 브랜드</h1>
        </div>
        <button class="secondary-btn compact" type="button" data-route="/product/${titleist.slug}">전체 상품 보기</button>
      </header>
      <div class="best-grid">
        ${bestSellers.map(renderBestSellerCard).join("")}
      </div>
    </section>

    <section class="home-section panel-card">
      <header class="home-section-head">
        <div>
          <p>왜 리볼 로스트볼인가요?</p>
          <span>이미지 A컷 신뢰 혜택 카드</span>
        </div>
      </header>
      <div class="reason-grid">
        ${renderReasonCard("why-shield", "엄격한 선별 기준", "전문가의 3단계 검수를 통과한 볼만 제공합니다.")}
        ${renderReasonCard("why-leaf", "합리적인 가격", "새 볼 대비 부담 없는 가격으로 퍼포먼스를 경험하세요.")}
        ${renderReasonCard("why-medal", "다양한 선택", "모델·등급·구성·색상까지 원하는 옵션을 선택합니다.")}
        ${renderReasonCard("why-headset", "믿을 수 있는 서비스", "빠른 출고와 문의 응대로 언제나 만족을 드립니다.")}
      </div>
    </section>

    ${renderHomeGradeOverviewSection()}
    ${renderHomeInspectionProcessSection()}
    ${renderHomeOrderProcessSection()}

    <section class="home-section panel-card">
      <header class="home-section-head">
        <div>
          <p>배송 및 주문 안내</p>
          <span>컴포넌트B의 다크 서비스 카드</span>
        </div>
      </header>
      <div class="service-grid">
        ${renderServiceCard("service-truck", "출고 마감", `${shippingPolicy.cutoffTime} 이전 주문은 당일 출고 준비`)}
        ${renderServiceCard("service-box", "무료 배송 기준", `₩${money.format(shippingPolicy.freeThreshold)} 이상 구매 시 무료 배송`)}
        ${renderServiceCard("service-return", "교환/반품 정책", `${shippingPolicy.simpleReturnWindow} 단순변심 반품 · 왕복 ${money.format(shippingPolicy.simpleReturnFee)}원`)}
        ${renderServiceCard("service-headset", "고객센터", `${businessProfile.supportPhone}\n${businessProfile.operationHours} 운영`)}
      </div>
    </section>

    <section class="home-section panel-card store-select-section">
      <header class="home-section-head">
        <div>
          <p>상품 선택과 매장 안내</p>
          <span>상품을 먼저 선택하고 매장/검수 기준으로 신뢰를 확인합니다.</span>
        </div>
      </header>
      <div class="store-select-grid">
        <article class="store-notice">
          <h2>${businessProfile.address}</h2>
          <p>운영시간 ${businessProfile.operationHours}<br />고객센터 ${businessProfile.supportPhone}<br />반품 주소 동일</p>
          <div>
            <button class="secondary-btn compact dark" type="button" data-route="/store">매장소개 보기</button>
            <button class="secondary-btn compact" type="button" data-route="/inspection">검수 기준 공개</button>
          </div>
        </article>
        <div class="store-product-list">
          ${storeProducts.map(renderStoreProduct).join("")}
        </div>
      </div>
    </section>

    <section class="home-section panel-card">
      <header class="home-section-head">
        <div>
          <p>함께 보면 좋은 추천 세트</p>
          <span>이미지B의 번들 카드</span>
        </div>
      </header>
      <div class="bundle-grid">
        ${bundleSets.map(renderBundleCard).join("")}
      </div>
    </section>

    <section class="home-bottom-cta">
      <div>
        <h2>지금 바로 프리미엄 로스트볼을 경험하세요!</h2>
        <p>정직한 품질과 합리적인 가격, 리볼 로스트볼이 약속드립니다.</p>
      </div>
      <button class="gold-cart-btn compact home-bottom-cta-btn" type="button" data-product-menu>전체 상품 보러가기</button>
    </section>
  `);
}

function renderBanner(banner) {
  const label = `${banner.eyebrow} ${banner.title.replaceAll("\n", " ")} ${banner.cta}`;
  const buttonsOnly = banner.buttonsOnly === true;
  const body = escapeHtml(banner.body).replaceAll("\n", "<br />");
  const image = `
        <picture>
          ${banner.mobileImage ? `<source media="(max-width: 680px)" srcset="${asset(banner.mobileImage)}" />` : ""}
          <img src="${asset(banner.image)}" alt="${banner.showOverlay === false ? escapeHtml(label) : ""}" ${banner.id === "quality" ? `fetchpriority="high" decoding="sync"` : ""} />
        </picture>`;
  const copy = (className = "") => `
            <div class="hero-copy ${className} ${buttonsOnly ? "hero-copy--buttons-only" : ""}">
              ${
                buttonsOnly
                  ? ""
                  : `<span>${escapeHtml(banner.eyebrow)}</span>
              <h1>${escapeHtml(banner.title).replaceAll("\n", "<br />")}</h1>
              <p>${body}</p>`
              }
              <div class="hero-cta-row">
                <button class="gold-cart-btn compact" type="button" data-route="${banner.route}">${escapeHtml(banner.cta)} ${icons.chevron}</button>
                ${
                  banner.secondaryCta
                    ? `<button class="secondary-btn compact" type="button" ${banner.secondaryScrollTarget ? `data-scroll-to="${banner.secondaryScrollTarget}"` : `data-route="${banner.secondaryRoute || "/"}"`}>${escapeHtml(banner.secondaryCta)} ${icons.chevron}</button>`
                    : ""
                }
              </div>
            </div>`;
  return `
    <article class="hero-slide hero-slide--${banner.id} ${banner.showOverlay === false ? "image-only" : "has-copy"}">
      ${image}
      ${
        banner.showOverlay === false
          ? `<button class="hero-image-link" type="button" data-route="${banner.route}" aria-label="${escapeHtml(label)}"></button>${banner.mobileOverlay ? copy("hero-copy--mobile-only") : ""}`
          : copy()
      }
    </article>
  `;
}

function renderHomeProtectedSectionImage(name, alt) {
  return `
    <section class="home-protected-section" aria-label="${escapeHtml(alt)}">
      <img src="${asset(name)}" alt="${escapeHtml(alt)}" loading="eager" decoding="sync" />
    </section>
  `;
}

function renderHomeGradeOverviewSection() {
  const gradeCards = [
    {
      id: "S",
      image: "home-grade-s.png",
      title: "새 볼에 가까운 최상급",
      body: "스크래치와 변색이 매우 적어 선물용과 실전 라운드에 적합합니다.",
      label: "프리미엄 추천",
      rating: 4,
      tone: "strong",
    },
    {
      id: "A",
      image: "home-grade-a.png",
      title: "실전 라운드용 우수급",
      body: "미세한 사용감은 있으나 퍼포먼스와 가격 균형이 가장 좋습니다.",
      label: "가장 많이 선택",
      rating: 3,
      tone: "soft",
    },
    {
      id: "B",
      image: "home-grade-b.png",
      title: "연습과 가성비 중심 실속급",
      body: "연습장, 스크린, 부담 없는 필드용으로 편하게 쓰기 좋습니다.",
      label: "실속 구매",
      rating: 2,
      tone: "warm",
    },
  ];
  return `
    <section class="home-section panel-card home-system-section home-grade-overview">
      <header class="home-system-head">
        <h2>등급 안내</h2>
        <p>S · A · B 상태를 한눈에 보기</p>
      </header>
      <div class="home-grade-system-grid" aria-label="S A B 등급 안내 카드">
        ${gradeCards.map(renderHomeGradeSystemCard).join("")}
      </div>
    </section>
  `;
}

function renderHomeGradeSystemCard(card) {
  const score = "●".repeat(card.rating) + "○".repeat(Math.max(0, 4 - card.rating));
  return `
    <article class="home-grade-system-card ${escapeHtml(card.tone)}">
      <span class="home-grade-letter" aria-hidden="true">
        <img src="${asset(card.image)}" alt="" loading="lazy" decoding="async" />
      </span>
      <div>
        <small><span>${escapeHtml(card.label)}</span><b>${escapeHtml(score)}</b></small>
        <h3>${escapeHtml(card.id)} 등급 · ${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.body)}</p>
      </div>
    </article>
  `;
}

function renderHomeInspectionProcessSection() {
  const steps = [
    ["process-inbound", "입고 및 선별", "도착 당일 1차 선별"],
    ["process-test", "세척 및 표면 정리", "오염과 이물질 정리"],
    ["process-inspect", "외관 검사", "스크래치, 변색 확인"],
    ["why-shield", "성능 확인", "탄성, 무게, 밸런스"],
    ["process-pack", "등급 분류 및 포장", "S·A·B 등급 포장"],
  ];
  return renderHomeProcessSystemSection("5단계 검수 프로세스", "공급부터 포장까지 단계별로 확인합니다", steps, "inspection");
}

function renderHomeOrderProcessSection() {
  const steps = [
    ["order-cart", "장바구니 담기", "원하는 상품을 담아주세요"],
    ["order-payment", "주문 & 결제", "주문 정보 입력 및 결제"],
    ["order-box", "상품 준비", "검수 완료 후 안전하게 준비"],
    ["order-truck", "배송 완료", "신속하고 안전하게 배송"],
  ];
  return renderHomeProcessSystemSection("4단계 주문 프로세스", "간단한 4단계로 주문을 완료합니다", steps, "order");
}

function renderHomeProcessSystemSection(title, body, steps, variant) {
  return `
    <section class="home-section panel-card home-system-section home-process-system home-process-system--${escapeHtml(variant)}">
      <header class="home-system-head">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(body)}</p>
      </header>
      ${renderHomeSystemImageBody(
        variant === "inspection" ? "home-inspection-process-body.png" : "home-order-process-body.png",
        variant === "inspection" ? "5단계 검수 프로세스" : "4단계 주문 프로세스"
      )}
    </section>
  `;
}

function renderHomeSystemImageBody(name, alt) {
  return `
    <div class="home-system-image-body">
      <img src="${asset(name)}" alt="${escapeHtml(alt)}" loading="eager" decoding="sync" />
    </div>
  `;
}

function renderTrustItem(iconName, title, body) {
  return `<article>${renderShopIcon(iconName, "trust-icon")}<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div></article>`;
}

function renderBestSellerCard(product) {
  const wished = isWished(product.slug);
  const isPlaceholder = Boolean(product.isPlaceholder || !product.image);
  return `
    <article class="best-item">
      <div class="best-card">
        <div class="best-media ${isPlaceholder ? "best-media-placeholder" : "product-hover-zone"}">
          ${
            isPlaceholder
              ? `<div class="best-media-placeholder-copy"><strong>${escapeHtml(product.brandName)}</strong><small>${escapeHtml(product.line)}</small></div>`
              : `<button class="product-media-link" type="button" data-route="/product/${product.slug}" aria-label="${escapeHtml(product.name)} 상세 보기">
                  <img src="${asset(product.image)}" alt="${escapeHtml(product.name)}" />
                </button>`
          }
          <b>${escapeHtml(product.grade ?? "A")}</b>
          ${isPlaceholder ? "" : renderHoverActions(product, wished)}
        </div>
        <div class="best-body">
          <span>${escapeHtml(product.brandName)}</span>
          <h2>${escapeHtml(product.line)}</h2>
          <p>재고 보유 · 15시 당일 업데이트</p>
          <strong>${isPlaceholder ? "원본 이미지 연결 예정" : `₩${money.format(product.price)}부터`}</strong>
        </div>
      </div>
      <div class="best-review ${isPlaceholder ? "no-action" : ""}">
        <small><span class="best-review-stars">★★★★★</span>${escapeHtml(product.review ?? "상태확인 후 출고 준비")}</small>
        ${
          isPlaceholder
            ? ""
            : `<button class="mini-cart-btn" type="button" data-add-card="${product.slug}" aria-label="${escapeHtml(product.name)} 장바구니 담기"><img class="mini-product-img" src="${asset(product.image)}" alt="" /></button>`
        }
      </div>
    </article>
  `;
}

function renderReasonCard(iconName, title, body) {
  return `<article>${renderShopIcon(iconName, "section-icon reason-icon")}<div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></div></article>`;
}

function renderGradeCard(grade) {
  const tone = grade.id === "S" ? "strong" : grade.id === "A" ? "soft" : "warm";
  return `
    <article class="${tone}">
      <b>${escapeHtml(grade.label)}</b>
      <div>
        <h2>${escapeHtml(grade.text)}</h2>
        <p>${grade.id === "S" ? "스크래치와 변색이 매우 적어 새 볼에 가까운 상태입니다." : grade.id === "A" ? "미세한 사용감은 있으나 실전 라운드용으로 안정적입니다." : "연습과 가성비 구매에 적합한 실속 등급입니다."}</p>
        <span>추천도 ●●●${grade.id === "B" ? "○" : "●"}</span>
      </div>
    </article>
  `;
}

function renderProcessStep(step, index) {
  const [iconName, title, body] = Array.isArray(step) ? step : ["process-inbound", step, ""];
  return `
    <article>
      <span>${renderShopIcon(iconName, "process-icon")}</span>
      <b>${String(index + 1).padStart(2, "0")}</b>
      <strong>${escapeHtml(title)}</strong>
      ${body ? `<small>${escapeHtml(body)}</small>` : ""}
    </article>
  `;
}

function renderServiceCard(iconName, title, body) {
  return `
    <article>
      ${renderShopIcon(iconName, "service-icon")}
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(body).replaceAll("\n", "<br />")}</p>
      </div>
    </article>
  `;
}

function renderStoreProduct(item) {
  return `
    <button class="store-product" type="button" data-route="/product/${item.product.slug}">
      <img src="${asset(item.product.image)}" alt="${escapeHtml(item.title)}" />
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.meta)}</small>
        <b>${escapeHtml(item.note)}</b>
      </span>
      ${renderUiIcon("chevron-24", "chevron-img")}
    </button>
  `;
}

function renderBundleCard(bundle) {
  const id = registerBundle(bundle);
  return `
    <article class="bundle-card">
      <div class="bundle-media" aria-hidden="true">
        <img src="${asset(bundle.products[0].image)}" alt="" />
        <span>+</span>
        <img src="${asset(bundle.products[1].image)}" alt="" />
      </div>
      <h2>${escapeHtml(bundle.title)}</h2>
      <p>${escapeHtml(bundle.desc)}</p>
      <strong>₩${money.format(bundle.price)}</strong>
      <button class="bundle-cart-btn" type="button" data-add-bundle="${id}" aria-label="${escapeHtml(bundle.title)} 장바구니 담기">${renderShopIcon("bundle-cart", "bundle-cart-img")}</button>
    </article>
  `;
}

function renderProductCard(product) {
  const wished = isWished(product.slug);
  return `
    <article class="product-card">
      <div class="product-media product-hover-zone">
        <button class="product-media-link" type="button" data-route="/product/${product.slug}" aria-label="${escapeHtml(product.name)} 상세 보기">
          <img src="${asset(product.image)}" alt="${escapeHtml(product.name)}" />
        </button>
        ${renderHoverActions(product, wished)}
      </div>
      <div class="product-body">
        <div class="product-top"><span>${escapeHtml(product.brandName)}</span><b>로스트볼</b></div>
        <h2>${escapeHtml(product.name)}</h2>
        <p>${escapeHtml(product.copy)}</p>
        <dl>
          <div><dt>등급</dt><dd>S / A / B</dd></div>
          <div><dt>구성</dt><dd>10구 / 30구</dd></div>
          <div><dt>재고</dt><dd>${product.stock}세트</dd></div>
        </dl>
        <div class="product-bottom">
          <strong>₩${money.format(product.price)}부터</strong>
          <button class="gold-cart-btn card-cart-btn" type="button" data-add-card="${product.slug}">장바구니 담기 ${shopIcons.cart}</button>
        </div>
      </div>
    </article>
  `;
}

function renderHoverActions(product, wished) {
  return `
    <div class="hover-actions" aria-label="${escapeHtml(product.name)} 빠른 작업">
      <button class="hover-action-btn wish ${wished ? "is-active" : ""}" type="button" data-wish-card="${product.slug}" aria-pressed="${wished ? "true" : "false"}">
        <span>WISH</span>
      </button>
      <button class="hover-action-btn add" type="button" data-add-card="${product.slug}">
        <span>ADD</span>
      </button>
    </div>
  `;
}

function renderCategory(brandSlug) {
  const list = productByBrand(brandSlug);
  const title = list[0]?.brandName ?? brandLabel(brandSlug);
  layout(`
    <section class="page-title">
      <p>상품</p>
      <h1>${escapeHtml(title)}</h1>
      <span>상단 상품 메뉴에서 8개 브랜드 라인을 순서대로 바로 선택할 수 있습니다.</span>
    </section>
    <section class="product-grid">${list.map(renderProductCard).join("")}</section>
  `);
}

function renderDetail(slug) {
  const product = productBySlug(slug);
  const selection = getSelection(product);
  const price = selectedPrice(product);
  const galleryItems = productGalleryItems(product);
  const modalInitialImage = galleryItems[0] ?? { image: product.image, label: product.name };

  layout(`
    <section class="detail-page">
      <div class="breadcrumb"><a href="#/">홈</a><span>›</span><a href="#/category/${product.brandSlug}">${escapeHtml(product.brandName)}</a><span>›</span><strong>${escapeHtml(product.line)}</strong></div>
      <div class="detail-layout">
        <section class="detail-gallery">
          ${renderGalleryStage(product, modalInitialImage)}
          <p class="gallery-note">상품은 10구 / 30구 구성으로 판매되며, 로스트볼 특성상 모델 인쇄·마킹·로고 상태는 브랜드와 등급별로 차이가 있을 수 있습니다.</p>
          <div class="thumb-row" aria-label="상품 이미지 썸네일">
            ${galleryItems.map((item, index) => `
              <button class="${index === 0 ? "is-active" : ""}" type="button" aria-label="${escapeHtml(item.label)} 보기" data-gallery-thumb data-gallery-src="${escapeHtml(item.image)}" data-gallery-label="${escapeHtml(item.label)}">
                <img src="${asset(item.image)}" alt="" loading="eager" decoding="sync" />
              </button>
            `).join("")}
          </div>
        </section>
        <aside class="buy-panel">
          <div class="badge-row"><span>재고 있음</span><b>${selection.grade}</b></div>
          <p class="buy-eyebrow">${escapeHtml(product.brandName)} / 로스트볼</p>
          <h1>${escapeHtml(product.name)}</h1>
          <small>${escapeHtml(product.copy)}</small>
          <strong class="detail-price">₩${money.format(price)}부터</strong>
          <em class="stock-line">재고 현황 · 15시 당일 업데이트 준비</em>
          <dl class="detail-summary-table">
            <div><dt>상품 구성</dt><dd>10구 / 30구 선택</dd></div>
            <div><dt>등급 기준</dt><dd>S / A / B</dd></div>
            <div><dt>상태 안내</dt><dd>랜덤 마킹·로고·미세 스크래치 포함 가능</dd></div>
          </dl>
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
            <button class="gold-cart-btn" type="button" data-add-detail="${product.slug}">장바구니 담기 ${shopIcons.cart}</button>
            <button class="secondary-btn" type="button" data-buy-now="${product.slug}">바로 구매</button>
          </div>
        </aside>
      </div>
      ${renderDetailCheckStrip(product)}
      ${renderDetailInfoSection(product)}
      ${renderDetailSpecSection(product, price)}
      ${renderProtectedDetailAsset(product)}
      ${renderDetailPostContent(product)}
    </section>
    <div class="modal" data-modal aria-hidden="true">
      <button type="button" class="modal-backdrop" data-close-modal></button>
      <section class="modal-card">
        <header><strong>상품 이미지 보기</strong><button type="button" data-close-modal>${icons.close}</button></header>
        <img src="${asset(modalInitialImage.image)}" alt="${escapeHtml(modalInitialImage.label)} 확대 이미지" data-gallery-modal-image />
      </section>
    </div>
  `);
}

function renderProductStory(slug) {
  renderDetail(slug);
}

function productGalleryItems(product) {
  if (Array.isArray(product.galleryImages) && product.galleryImages.length) {
    return product.galleryImages;
  }
  return Array.from({ length: 6 }, (_, index) => ({
    image: product.image,
    label: `${product.name} 이미지 ${index + 1}`,
  }));
}

function renderGalleryStage(product, modalInitialImage) {
  if (product.galleryVideo) {
    return `
      <div class="gallery-stage has-video">
        <video src="${asset(product.galleryVideo)}" poster="${asset(product.image)}" autoplay muted loop playsinline preload="metadata" aria-label="${escapeHtml(product.name)} 회전 영상"></video>
        <button class="gallery-more-btn" type="button" data-open-gallery data-gallery-src="${escapeHtml(modalInitialImage.image)}" data-gallery-label="${escapeHtml(modalInitialImage.label)}">더 많은 이미지 보기</button>
      </div>
    `;
  }
  return `
    <div class="gallery-stage">
      <img src="${asset(modalInitialImage.image)}" alt="${escapeHtml(modalInitialImage.label)}" loading="eager" fetchpriority="high" decoding="sync" />
      <button class="gallery-more-btn" type="button" data-open-gallery data-gallery-src="${escapeHtml(modalInitialImage.image)}" data-gallery-label="${escapeHtml(modalInitialImage.label)}">더 많은 이미지 보기</button>
    </div>
  `;
}

function renderDetailCheckStrip(product) {
  return `
    <section class="detail-check-strip">
      <header>
        <div>
          <p>주문 전 확인</p>
          <span>상세 페이지 구매 전 정보</span>
        </div>
      </header>
      <div class="detail-check-grid">
        ${renderDetailCheckItem("why-shield", "리볼 로스트볼", "공식 기준 선별<br />믿을 수 있는 품질")}
        <article>
          <span class="detail-check-ball"><img src="${asset(product.image)}" alt="" /></span>
          <div><strong>등급 선택</strong><small>S / A / B 구성<br />원하는 등급 선택</small></div>
        </article>
        ${renderDetailCheckItem("order-box", "10구 / 30구", "필요 수량에 맞춰<br />합리적인 선택")}
        ${renderDetailCheckItem("order-truck", `${shippingPolicy.cutoffTime} 전 출고 준비`, `${shippingPolicy.averageLeadTime} 내 수령 예상<br />오늘도 안전하게`)}
      </div>
    </section>
  `;
}

function renderDetailCheckItem(iconName, title, body) {
  return `
    <article>
      <span>${renderShopIcon(iconName, "detail-check-icon")}</span>
      <div><strong>${escapeHtml(title)}</strong><small>${body}</small></div>
    </article>
  `;
}

function renderDetailInfoSection(product) {
  return `
    <section class="detail-info-section">
      <header class="detail-section-head">
        <p>상품 상세 정보</p>
        <span>이미지에서 분해한 정보 카드와 미니 CTA</span>
      </header>
      <div class="detail-info-grid">
        <article class="detail-info-card">
          <span class="detail-info-media detail-info-media-ball">
            <img class="detail-info-ball" src="${asset(product.image)}" alt="" />
          </span>
          <div><strong>제품 정보</strong><small>브랜드 ${escapeHtml(product.brandName)}<br />옵션 ${escapeHtml(product.line)}<br />구성 10구 / 30구 선택</small></div>
        </article>
        <article class="detail-info-card">
          <span class="detail-info-media">
            ${renderShopIcon("order-box", "detail-info-icon")}
          </span>
          <div><strong>구성 안내</strong><small>10구 / 30구 단위 선택 가능<br />등급 S / A / B 선택<br />브랜드별 옵션 구성 상이</small></div>
        </article>
        <article class="detail-info-card">
          <span class="detail-info-media">
            ${renderShopIcon("order-truck", "detail-info-icon")}
          </span>
          <div><strong>배송 안내</strong><small>${shippingPolicy.cutoffTime} 전 주문 시 당일 출고 준비<br />평균 배송 ${shippingPolicy.averageLeadTime}<br />제주/도서산간 ${money.format(shippingPolicy.islandExtra)}원 추가</small></div>
        </article>
      </div>
      <div class="detail-mini-cta">
        <strong>당신의 라운드를 더 가치 있게</strong>
        <span>리볼 로스트볼과 함께 검수된 품질과 합리적인 가격을 바로 확인하세요.</span>
        <button class="detail-mini-cta-btn" type="button" data-buy-now="${product.slug}">지금 바로 구매</button>
      </div>
    </section>
  `;
}

function renderDetailSpecSection(product, price) {
  return `
    <section class="detail-spec-section">
      <header class="detail-section-head">
        <p>특징과 상세 스펙</p>
        <span>상세페이지 하단 정보 정리</span>
      </header>
      <div class="detail-spec-grid">
        <article class="detail-feature-card">
          <div>
            <strong>${escapeHtml(product.brandName)} 로스트볼의 차별점</strong>
            <ul>
              <li>${escapeHtml(product.brandName)}만의 핵심 기술이 적용된 로스트볼</li>
              <li>철저한 선별 과정을 거친 합리적인 품질</li>
              <li>합리적 가격과 다양한 구성 옵션 제공</li>
              <li>빠른 출고와 안전한 포장 서비스</li>
            </ul>
          </div>
          <img src="${asset(product.image)}" alt="" />
        </article>
        <article class="detail-spec-table-card">
          <strong>상품 상세 정보</strong>
          <dl>
            <div><dt>상품 구성</dt><dd>10구 / 30구 선택</dd></div>
            <div><dt>등급 기준</dt><dd>S / A / B</dd></div>
            <div><dt>기준 가격</dt><dd>₩${money.format(price)}부터</dd></div>
          </dl>
        </article>
      </div>
      <div class="detail-policy-note">
        <strong>로스트볼 / 중고볼 상태 고지</strong>
        <ul>
          ${lostballNotice.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
        </ul>
      </div>
    </section>
  `;
}

function detailAssetName(product) {
  const selection = getSelection(product);
  return product.detailVariants?.[selection.model] ?? product.detailImage ?? `detail-${product.brandSlug}.webp`;
}

function protectedDetailMaxWidth() {
  return 724;
}

function renderProtectedDetailAsset(product) {
  const maxWidth = protectedDetailMaxWidth();
  return `
    <section class="product-detail-frame-shot protected-image-zone" style="--protected-image-max-width:${maxWidth}px" aria-label="${escapeHtml(product.name)} 상세 이미지 원본">
      <img src="${asset(detailAssetName(product))}" alt="${escapeHtml(product.name)} 상품별 상세페이지 원본" loading="eager" fetchpriority="high" width="724" height="2172" decoding="async" />
      <button class="protected-detail-cta-hitbox" type="button" data-buy-now="${product.slug}" aria-label="${escapeHtml(product.name)} 상세 이미지 하단 구매 버튼"></button>
    </section>
  `;
}

function detailRelatedBundles(product) {
  return products
    .filter((item) => item.slug !== product.slug && !item.isPlaceholder)
    .slice(0, 4)
    .map((item) => ({
      title: `${product.brandName}와 함께 보는 ${item.brandName}`,
      products: [product, item],
      desc: `${product.line} + ${item.line} / 추천 구성`,
      price: Math.max(0, Math.round((product.price + item.price) * 0.88)),
    }));
}

function renderDetailPostContent(product) {
  const bundles = detailRelatedBundles(product);
  return `
    <section class="home-section panel-card detail-service-section">
      <header class="home-section-head">
        <div>
          <p>배송 및 주문 안내</p>
          <span>상품 상세 하단 서비스 카드</span>
        </div>
      </header>
      <div class="service-grid">
        ${renderServiceCard("service-truck", "출고 마감", `${shippingPolicy.cutoffTime} 이전 주문 시 당일 출고 준비`)}
        ${renderServiceCard("service-box", "무료배송 기준", `₩${money.format(shippingPolicy.freeThreshold)} 이상 구매 시 무료배송`)}
        ${renderServiceCard("service-return", "교환 / 반품", `${shippingPolicy.simpleReturnWindow} 단순변심 반품\n왕복 ${money.format(shippingPolicy.simpleReturnFee)}원`)}
        ${renderServiceCard("service-headset", "고객센터", `${businessProfile.supportPhone}\n${businessProfile.operationHours} 운영`)}
      </div>
    </section>
    <section class="home-section panel-card detail-related-section">
      <header class="home-section-head">
        <div>
          <p>함께 보면 좋은 제품</p>
          <span>추천 구성 카드</span>
        </div>
      </header>
      <div class="bundle-grid">
        ${bundles.map(renderBundleCard).join("")}
      </div>
    </section>
    <section class="home-bottom-cta detail-final-cta">
      <div>
        <h2>${escapeHtml(product.name)}, 지금 합리적으로 만나보세요</h2>
        <p>정직한 품질과 합리적인 가격으로 준비했습니다.</p>
      </div>
      <button class="gold-cart-btn compact home-bottom-cta-btn" type="button" data-buy-now="${product.slug}">지금 바로 구매하기 ${shopIcons.cart}</button>
    </section>
  `;
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
              `<button class="${selection[key] === value ? "is-active" : ""}" type="button" data-option-kind="${escapeHtml(key)}" data-option-value="${escapeHtml(value)}" data-select-option="${product.slug}|${key}|${escapeHtml(value)}">${escapeHtml(value)}</button>`
          )
          .join("")}
      </div>
    </div>
  `;
}

function addToCart(slug, quantity = 1, options = {}) {
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
  state.cartPromptOpen = Boolean(options.promptCart);
  renderRoute();
  showToast("장바구니에 담았습니다.");
}

function addBundleToCart(id, quantity = 1, options = {}) {
  const bundle = bundleRegistry.get(id);
  if (!bundle) return;
  const key = `bundle:${id}`;
  const existing = state.cart.find((item) => item.key === key);

  if (existing) {
    existing.quantity += quantity;
  } else {
    state.cart.push({
      key,
      kind: "bundle",
      slug: id,
      name: bundle.title,
      brandName: bundle.brandName,
      image: bundle.image,
      summary: bundle.desc,
      price: bundle.price,
      quantity,
      bundleProducts: bundle.products,
    });
  }

  save("reball.cart", state.cart);
  state.cartPromptOpen = Boolean(options.promptCart);
  renderRoute();
  showToast("장바구니에 담았습니다.");
}

function renderCart() {
  const total = cartTotal();
  const deliveryFee = shippingCost(total);
  const finalAmount = total + deliveryFee;
  layout(`
    <section class="page-title">
      <p>장바구니</p>
      <h1>선택한 로스트볼 구성</h1>
      <span>₩${money.format(shippingPolicy.freeThreshold)} 이상 구매 시 무료배송, 제주/도서산간은 ${money.format(shippingPolicy.islandExtra)}원 추가됩니다.</span>
    </section>
    <section class="cart-layout">
      <div class="cart-list">
        ${
          state.cart.length
            ? state.cart.map(renderCartItem).join("")
            : `<article class="empty-card"><strong>장바구니가 비어 있습니다.</strong><button class="gold-cart-btn compact empty-shop-btn" type="button" data-route="/">상품 보러가기</button></article>`
        }
      </div>
      <aside class="summary-panel">
        <h2>결제 금액</h2>
        <div><span>상품금액</span><strong>₩${money.format(total)}</strong></div>
        <div><span>배송비</span><strong>${deliveryFee ? `₩${money.format(deliveryFee)}` : "무료"}</strong></div>
        <hr />
        <div class="grand"><span>총 결제금액</span><strong>₩${money.format(finalAmount)}</strong></div>
        <small>기본 배송비는 ${money.format(shippingPolicy.baseFee)}원으로 적용했습니다. 단순변심 반품비 ${money.format(shippingPolicy.simpleReturnFee)}원 기준에 맞춘 운영값입니다.</small>
        <button class="gold-cart-btn" type="button" data-route="/checkout" ${state.cart.length ? "" : "disabled"}>주문서 작성 ${shopIcons.cart}</button>
      </aside>
    </section>
  `);
}

function renderCartItem(item) {
  return `
    <article class="cart-item">
      <div class="cart-item-media">
        <img src="${asset(item.image)}" alt="" />
      </div>
      <div>
        <span>${escapeHtml(item.brandName)}</span>
        <h2>${escapeHtml(item.name)}</h2>
        <p>${escapeHtml(cartItemDescription(item))}</p>
        <strong>₩${money.format(item.price)}</strong>
      </div>
      <div class="qty-control">
        <button type="button" data-qty-key="${escapeHtml(item.key)}" data-qty-delta="-1">-</button>
        <b>${item.quantity}</b>
        <button type="button" data-qty-key="${escapeHtml(item.key)}" data-qty-delta="1">+</button>
      </div>
      <button class="icon-btn" type="button" data-remove="${escapeHtml(item.key)}" aria-label="삭제">${icons.close}</button>
    </article>
  `;
}

function renderCheckoutField(label, control) {
  return `
    <label class="checkout-field">
      <span class="checkout-field-label"><i></i>${escapeHtml(label)}</span>
      ${control}
    </label>
  `;
}

function renderCheckoutMethod(id, label, icon, checked = false) {
  return `
    <label class="checkout-method">
      <input type="radio" name="payment" value="${id}" ${checked ? "checked" : ""} />
      <span class="checkout-method-icon" aria-hidden="true">${icon}</span>
      <span class="checkout-method-label">${escapeHtml(label)}</span>
    </label>
  `;
}

function renderCheckoutPolicyCard(icon, title, body, caption) {
  return `
    <article class="checkout-policy-card">
      <span class="checkout-policy-icon" aria-hidden="true">${icon}</span>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <p>${body}</p>
        <small>${caption}</small>
      </div>
    </article>
  `;
}

function renderCheckoutMainSection() {
  return `
    <section class="checkout-main-card">
      <div class="checkout-section">
        <div class="checkout-section-body">
          ${renderCheckoutField("받는 사람", '<input name="name" required placeholder="수령인 이름을 입력하세요" autocomplete="shipping name" />')}
          ${renderCheckoutField("휴대폰 번호", '<input name="phone" required placeholder="010-0000-0000" inputmode="tel" autocomplete="tel" />')}
          ${renderCheckoutField("배송지", '<input name="address" required placeholder="배송받을 주소를 입력하세요" autocomplete="shipping street-address" />')}
          ${renderCheckoutField(
            "배송 메모",
            `<select name="memo">
              <option>부재 시 문 앞에 놓아주세요.</option>
              <option>배송 전 연락 주세요.</option>
              <option>경비실에 맡겨주세요.</option>
            </select>`
          )}
        </div>
      </div>
      <div class="checkout-section">
        <div class="checkout-section-label">결제수단</div>
        <div class="checkout-method-grid">
          ${renderCheckoutMethod("card", "카드 결제", shopIcons.cardPay, true)}
          ${renderCheckoutMethod("transfer", "계좌이체", icons.bank)}
          ${renderCheckoutMethod("virtual", "가상계좌", icons.receipt)}
          ${renderCheckoutMethod("easy", "간편결제", icons.bolt)}
        </div>
      </div>
      <div class="checkout-policy-stack">
        ${renderCheckoutPolicyCard(
          icons.bank,
          paymentProfile.transferLabel,
          `${businessProfile.settlementBank} ${businessProfile.settlementAccount}<br />예금주 ${businessProfile.settlementHolder}`,
          `배송비 ${money.format(shippingPolicy.baseFee)}원 / ${money.format(shippingPolicy.freeThreshold)}원 이상 무료 / 제주·도서산간 ${money.format(shippingPolicy.islandExtra)}원 추가`
        )}
        ${renderCheckoutPolicyCard(
          shopIcons.shield,
          "교환 / 환불 안내",
          `${shippingPolicy.simpleReturnText}<br />${shippingPolicy.defectReturnText}`,
          `반품 주소 ${businessProfile.returnAddress}`
        )}
      </div>
    </section>
  `;
}

function renderCheckoutSummarySection(deliveryFee, finalAmount) {
  const rows = state.cart.length
    ? state.cart
        .map(
          (item) => `
            <div class="checkout-summary-row">
              <span>${escapeHtml(item.name)} x ${item.quantity}</span>
              <strong>₩${money.format(item.price * item.quantity)}</strong>
            </div>
          `
        )
        .join("")
    : '<div class="checkout-summary-row empty"><span>장바구니가 비어 있습니다.</span><strong>₩0</strong></div>';

  return `
    <aside class="summary-panel checkout-summary-card">
      <div class="checkout-summary-cap"></div>
      <div class="checkout-summary-head">
        <span class="checkout-summary-seal" aria-hidden="true">${icons.star}</span>
        <h2>주문 요약</h2>
      </div>
      <div class="checkout-summary-list">
        ${rows}
        <div class="checkout-summary-row">
          <span>배송비</span>
          <strong>${deliveryFee ? `₩${money.format(deliveryFee)}` : "무료"}</strong>
        </div>
      </div>
      <hr />
      <div class="grand checkout-summary-total">
        <span>총 결제 예정금액</span>
        <strong>₩${money.format(finalAmount)}</strong>
      </div>
      <button class="gold-cart-btn checkout-submit-btn" type="submit" ${state.cart.length ? "" : "disabled"}>
        <span class="checkout-submit-copy">${icons.lock}<b>결제하기</b></span>
        ${icons.chevron}
      </button>
      <small class="checkout-summary-note">토스페이먼츠 가입 이메일 ${businessProfile.tossEmail} / 세금계산서 수신 ${businessProfile.taxInvoiceEmail}</small>
    </aside>
  `;
}

function renderCheckout() {
  const total = cartTotal();
  const deliveryFee = shippingCost(total);
  const finalAmount = total + deliveryFee;
  layout(`
    <section class="page-title checkout-page-title">
      <h1>배송지와 결제 정보를 확인하세요</h1>
      <span>결제수단은 ${paymentProfile.methods.join(" / ")}를 반영하며, 출고 마감은 ${shippingPolicy.cutoffTime}입니다.</span>
    </section>
    <form class="checkout-layout checkout-layout--payment" data-checkout-form>
      ${renderCheckoutMainSection()}
      ${renderCheckoutSummarySection(deliveryFee, finalAmount)}
    </form>
  `);
}

function createOrder(formData) {
  const subtotal = cartTotal();
  const total = subtotal + shippingCost(subtotal);
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

  state.ephemeralOrders.unshift(order);
  state.cart = [];
  save("reball.cart", state.cart);
  routeTo(`/order/${order.id}`);
}

function renderOrder(orderId) {
  const order = findOrderById(orderId);
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
  if (!state.authReady) {
    layout(`<section class="empty-card"><strong>로그인 상태를 확인하고 있습니다.</strong><span>잠시만 기다려 주세요.</span></section>`);
    return;
  }

  if (!isLoggedIn()) {
    setAuthRedirect("/mypage");
    routeTo("/login");
    return;
  }

  const tabGroups = [
    {
      title: "MY 쇼핑",
      tabs: [
        ["orders", "주문목록 / 배송조회"],
        ["points", "적립금 내역"],
        ["coupons", "쿠폰 내역"],
        ["shipping-addresses", "배송 주소록 관리"],
        ["returns", "취소 / 반품 / 교환 / 환불"],
        ["receipts", "영수증 조회 / 출력"],
      ],
    },
    {
      title: "MY 활동",
      tabs: [
        ["recent", "최근 본 상품"],
        ["wishlist", "나의 위시리스트"],
        ["posts", "나의 게시글"],
        ["inquiry", "문의하기"],
        ["inquiries", "문의내역 확인"],
        ["reviews", "리뷰관리"],
      ],
    },
    {
      title: "MY 정보",
      tabs: [
        ["profile", "회원 정보 수정"],
        ["payments", "결제수단 관리"],
        ["addresses", "배송지 관리"],
        ["notifications", "알림 설정"],
        ["withdraw", "회원 탈퇴"],
      ],
    },
  ];

  layout(`
    <section class="mypage-layout">
      <aside class="mypage-side">
        ${tabGroups
          .map(
            (group) => `
              <div class="mypage-menu-group">
                <h2>${escapeHtml(group.title)}</h2>
                ${group.tabs.map(([id, label]) => `<button class="${state.myTab === id || (id === "reviews" && state.myTab === "review-write") ? "is-active" : ""}" type="button" data-my-tab="${id}">${escapeHtml(label)}</button>`).join("")}
              </div>
            `
          )
          .join("")}
        <button class="mypage-logout-btn" type="button" data-logout>로그아웃</button>
        <article class="mypage-support-card">
          <strong>고객센터</strong>
          <a href="tel:${businessProfile.supportPhone.replaceAll("-", "")}">${businessProfile.supportPhone}</a>
          <span>평일 ${businessProfile.operationHours}</span>
          <button class="secondary-btn compact" type="button" data-my-tab="inquiry">1:1 문의하기</button>
        </article>
      </aside>
      <section class="mypage-content">
        ${renderMypageContent()}
      </section>
    </section>
  `);
}

function renderAuthPage(mode = "login", redirect = "/mypage") {
  const isSignup = mode === "signup";
  const isGuestOrder = mode === "guest-order";
  const authRedirect = state.authRedirect || redirect || AUTH_REDIRECT_DEFAULT;

  if (mode === "signup") {
    layout(`
      <section class="signup-choice-page">
        <div class="signup-choice-card">
          <header class="signup-choice-header">
            <h1>회원가입</h1>
            <p>아이디 비밀번호 입력하기 귀찮으시죠?</p>
            <span>귀찮은 입력 없이 간편하게 1초만에 가입하세요.</span>
          </header>
          ${renderSignupBenefitBanner()}
          <button class="id-signup-btn" type="button" data-route="/signup/form">ID/PW로 회원가입</button>
          <div class="signup-divider"><span>또는</span></div>
          <div class="social-signup-row" aria-label="간편 회원가입">
            <button class="kakao-signup-btn" type="button" data-social-signup="kakao" aria-label="카카오 간편가입">
              <span class="kakao-bubble" aria-hidden="true"></span>
            </button>
            <button class="naver-signup-btn" type="button" data-social-signup="naver" aria-label="네이버 간편가입">N</button>
          </div>
        </div>
      </section>
    `);
    return;
  }

  if (mode === "signup-form") {
    layout(`
      <section class="signup-form-page">
        <header class="signup-form-title">
          <h1>회원 정보 입력</h1>
          <p>기본정보와 추가정보를 입력하고 회원정보를 저장합니다.</p>
        </header>
        <form class="signup-detail-form panel-card" data-auth-form data-auth-mode="signup" data-auth-redirect="${escapeHtml(authRedirect)}">
          <fieldset>
            <legend>기본정보</legend>
            <div class="signup-field required">
              <label for="signup-login-id">아이디</label>
              <input id="signup-login-id" name="loginId" autocomplete="username" placeholder="영문/숫자 4~20자" />
            </div>
            <div class="signup-field required">
              <label for="signup-password">비밀번호</label>
              <input id="signup-password" name="password" type="password" autocomplete="new-password" />
            </div>
            <div class="signup-field required">
              <label for="signup-password-confirm">비밀번호 확인</label>
              <input id="signup-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" />
            </div>
            <div class="signup-field required">
              <label for="signup-name">이름</label>
              <input id="signup-name" name="name" autocomplete="name" />
            </div>
            <div class="signup-field">
              <label for="signup-address">주소</label>
              <input id="signup-address" name="address" autocomplete="street-address" placeholder="기본주소" />
            </div>
            <div class="signup-field">
              <label for="signup-tel">일반전화</label>
              <input id="signup-tel" name="tel" inputmode="tel" placeholder="02 -    -" />
            </div>
            <div class="signup-field required">
              <label for="signup-phone">휴대전화</label>
              <input id="signup-phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="010 -    -    " />
            </div>
            <div class="signup-field required">
              <label>SMS 수신여부</label>
              <div class="signup-radio-row">
                <label><input type="radio" name="smsOptIn" value="yes" checked /> 수신함</label>
                <label><input type="radio" name="smsOptIn" value="no" /> 수신안함</label>
              </div>
            </div>
            <div class="signup-field required">
              <label for="signup-contact-email">이메일</label>
              <input id="signup-contact-email" name="contactEmail" type="email" autocomplete="email" placeholder="주문 안내를 받을 이메일" />
            </div>
            <div class="signup-field required">
              <label>이메일 수신여부</label>
              <div class="signup-radio-row">
                <label><input type="radio" name="emailOptIn" value="yes" checked /> 수신함</label>
                <label><input type="radio" name="emailOptIn" value="no" /> 수신안함</label>
              </div>
            </div>
          </fieldset>
          <fieldset>
            <legend>추가정보</legend>
            <div class="signup-field">
              <label for="signup-birth">생년월일</label>
              <input id="signup-birth" name="birthday" placeholder="년    월    일" />
            </div>
            <div class="signup-field">
              <label for="signup-anniversary">결혼기념일</label>
              <input id="signup-anniversary" name="anniversary" placeholder="년    월    일" />
            </div>
            <div class="signup-field">
              <label for="signup-spouse">배우자생일</label>
              <input id="signup-spouse" name="spouseBirthday" placeholder="년    월    일" />
            </div>
            <div class="signup-field">
              <label for="signup-region">지역</label>
              <select id="signup-region" name="region">
                <option value="">선택</option>
                <option>서울</option>
                <option>경기</option>
                <option>인천</option>
                <option>부산</option>
                <option>대구</option>
                <option>광주</option>
                <option>대전</option>
                <option>기타</option>
              </select>
            </div>
          </fieldset>
          <div class="signup-form-actions">
            <button class="secondary-btn" type="button" data-route="/signup">취소</button>
            <button class="primary-btn" type="submit">회원가입 완료</button>
          </div>
        </form>
      </section>
    `);
    return;
  }

  if (mode === "signup-complete") {
    const pendingEmail = getPendingSignupEmail();
    const pendingLoginId = getPendingSignupLoginId();
    layout(`
      <section class="signup-complete-page">
        <article class="signup-complete-card panel-card">
          <span class="signup-complete-kicker">REBALL LOSTBALL</span>
          <h1>회원가입 신청이 완료되었습니다.</h1>
          <p>
            ${
              pendingEmail
                ? `<strong>${escapeHtml(pendingEmail)}</strong> 주소로 인증 메일을 보냈습니다.`
                : "입력하신 이메일 주소로 인증 메일을 보냈습니다."
            }
            ${pendingLoginId ? `<br />인증 후 <strong>${escapeHtml(pendingLoginId)}</strong> 아이디로 로그인할 수 있습니다.` : "메일 인증을 완료한 뒤 로그인해 주세요."}
          </p>
          <div class="signup-complete-notice">
            <b>인증 메일이 보이지 않으면</b>
            <span>스팸함을 확인하거나, 입력 이메일이 잘못된 경우 회원 정보를 다시 입력해 주세요.</span>
          </div>
          <div class="signup-form-actions signup-complete-actions">
            <button class="secondary-btn" type="button" data-route="/signup/form">정보 다시 입력</button>
            <button class="primary-btn" type="button" data-route="/login">인증 후 로그인</button>
          </div>
        </article>
      </section>
    `);
    return;
  }

  layout(`
    <section class="login-choice-page">
      <div class="login-choice-card">
        <div class="login-social-stack" aria-label="간편 로그인">
          <button class="login-social-btn login-social-kakao" type="button" data-social-signup="kakao">
            <span class="kakao-bubble" aria-hidden="true"></span>
            <b>카카오 1초 로그인/회원가입</b>
          </button>
          <button class="login-social-btn login-social-naver" type="button" data-social-signup="naver">
            <span aria-hidden="true">N</span>
            <b>네이버 1초 로그인/회원가입</b>
          </button>
        </div>
        ${renderSignupBenefitBanner()}
        <div class="signup-divider login-divider"><span>또는</span></div>
        ${renderLoginMemberTabs(isGuestOrder)}
        ${isGuestOrder ? renderGuestOrderLookupForm() : renderMemberLoginForm(authRedirect)}
        ${isGuestOrder ? "" : renderLoginHelperLinks()}
      </div>
    </section>
  `);
}

function renderLoginMemberTabs(isGuestOrder) {
  return `
    <div class="login-member-tabs" aria-label="로그인 유형">
      <button class="${isGuestOrder ? "" : "is-active"}" type="button" data-route="/login">기존회원 주문</button>
      <button class="${isGuestOrder ? "is-active" : ""}" type="button" data-route="/login/order">비회원 주문조회</button>
    </div>
  `;
}

function renderMemberLoginForm(redirect) {
  return `
    <form class="login-form" data-auth-form data-auth-mode="login" data-auth-redirect="${escapeHtml(redirect)}">
      <label class="login-field">
        <span>아이디</span>
        <input name="identifier" autocomplete="username" placeholder="아이디 또는 이메일을 입력해주세요." />
      </label>
      <label class="login-field">
        <span>비밀번호</span>
        <span class="password-input-wrap">
          <input name="password" type="password" autocomplete="current-password" placeholder="비밀번호를 입력해주세요." />
          <button type="button" data-toggle-password aria-label="비밀번호 보기" aria-pressed="false">${icons.eye}</button>
        </span>
      </label>
      <button class="gold-cart-btn login-submit-btn" type="submit">로그인</button>
    </form>
  `;
}

function renderGuestOrderLookupForm() {
  return `
    <form class="login-form guest-order-form" data-guest-order-form>
      <label class="login-field">
        <span>주문자명</span>
        <input name="guestName" autocomplete="name" placeholder="주문자명을 입력해주세요" />
      </label>
      <label class="login-field">
        <span>주문번호</span>
        <input name="orderId" inputmode="numeric" autocomplete="off" placeholder="주문번호를 입력해주세요" />
      </label>
      <label class="login-field">
        <span>비회원 주문 비밀번호</span>
        <span class="password-input-wrap">
          <input name="guestPassword" type="password" autocomplete="current-password" placeholder="비회원 주문 비밀번호를 입력해주세요." />
          <button type="button" data-toggle-password aria-label="비회원 주문 비밀번호 보기" aria-pressed="false">${icons.eye}</button>
        </span>
      </label>
      <button class="guest-order-submit-btn" type="submit">비회원 주문조회</button>
    </form>
  `;
}

function renderLoginHelperLinks() {
  return `
    <div class="login-helper-links">
      <span>
        <button type="button" data-auth-assist="id">아이디 찾기</button>
        <button type="button" data-auth-assist="password">비밀번호 찾기</button>
      </span>
      <button type="button" data-route="/signup">회원가입</button>
    </div>
  `;
}

function renderSignupBenefitBanner() {
  return `
    <article class="signup-benefit-banner" aria-label="회원가입 쿠폰 혜택">
      <div class="signup-coupon-top">
        <span>REBALL LOSTBALL</span>
        <b>신규 회원 전용</b>
      </div>
      <div class="signup-coupon-body">
        <p>일반회원 가입 혜택</p>
        <h2>첫 구매 쿠폰</h2>
        <strong>3,000원</strong>
        <small>회원가입 즉시 발급 · 바로 사용 가능</small>
      </div>
      <div class="signup-coupon-foot">
        <span>로스트볼 첫 주문에 적용</span>
        <em>WELCOME</em>
      </div>
    </article>
  `;
}

function renderMypageContent() {
  if (state.accountLoading) {
    return `
      <div class="page-title compact"><p>MY 페이지</p><h1>회원 정보 불러오는 중</h1><span>프로필, 주문, 배송지를 Supabase에서 확인하고 있습니다.</span></div>
      <article class="empty-card"><strong>데이터를 불러오는 중입니다.</strong><span>잠시만 기다려 주세요.</span></article>
    `;
  }

  if (state.myTab === "orders") {
    return `
      <div class="page-title compact"><p>MY 쇼핑</p><h1>주문목록</h1><span>구매하신 상품의 주문 내역과 배송 현황을 확인하실 수 있습니다.</span></div>
      <form class="mypage-search-form" data-order-search-form>
        <input name="query" placeholder="주문한 상품명을 검색해 보세요." />
        <button type="submit" aria-label="주문 검색">${renderUiIcon("search", "button-img-icon")}</button>
      </form>
      <div class="mypage-period-tabs">
        ${["최근 6개월", "2026", "2025"].map((label, index) => `<button class="${index === 0 ? "is-active" : ""}" type="button" data-order-period="${escapeHtml(label)}">${escapeHtml(label)}</button>`).join("")}
      </div>
      ${renderDeliveryTracker()}
      <div class="order-list">
        ${
          state.orders.length
            ? state.orders.map(renderOrderRow).join("")
            : `<article class="empty-card"><strong>주문 내역이 없습니다.</strong><span>상품을 담고 주문서를 작성하면 이곳에서 배송 단계를 확인합니다.</span><button class="primary-btn" type="button" data-route="/">쇼핑하러 가기</button></article>`
        }
      </div>
    `;
  }
  if (state.myTab === "coupons") {
    return `
      <div class="page-title compact"><p>MY 쇼핑</p><h1>쿠폰 내역</h1><span>사용 가능한 쿠폰과 직접 등록한 쿠폰을 관리합니다.</span></div>
      <form class="mypage-inline-form" data-coupon-form>
        <label>쿠폰 코드<input name="code" placeholder="예: REBALL5000" /></label>
        <button class="gold-cart-btn compact" type="submit">쿠폰 등록</button>
      </form>
      <section class="mypage-card-grid">
        ${state.coupons.map(renderCouponCard).join("")}
      </section>
    `;
  }
  if (state.myTab === "points") {
    return `
      <div class="page-title compact"><p>MY 쇼핑</p><h1>적립금 내역</h1><span>주문 완료 후 지급되는 적립금 흐름을 확인합니다.</span></div>
      <section class="mypage-points-summary" aria-label="적립금 요약">
        <article>
          <span>총 적립금</span>
          <strong>0원</strong>
        </article>
        <article>
          <span>사용가능 적립금</span>
          <strong>0원</strong>
        </article>
        <article>
          <span>미가용 적립금</span>
          <strong>0원</strong>
        </article>
      </section>
      <article class="mypage-points-empty">
        <strong>적립금 내역이 없습니다.</strong>
        <span>적립금은 주문 완료 후 지급 기준에 맞춰 표시됩니다.</span>
      </article>
    `;
  }
  if (state.myTab === "returns") {
    return `
      <div class="page-title compact"><p>MY 쇼핑</p><h1>취소 / 반품 / 교환 / 환불</h1></div>
      <section class="mypage-card-grid three">
        <article class="mypage-info-card"><strong>단순변심</strong><p>${shippingPolicy.simpleReturnText}</p><small>반품 배송비 ${money.format(shippingPolicy.simpleReturnFee)}원</small><button class="secondary-btn compact" type="button" data-return-request="simple">접수하기</button></article>
        <article class="mypage-info-card"><strong>상품 이상</strong><p>${shippingPolicy.defectReturnText}</p><small>수령 후 ${shippingPolicy.defectWindow}</small><button class="secondary-btn compact" type="button" data-return-request="defect">교환/환불 요청</button></article>
        <article class="mypage-info-card"><strong>반품 접수</strong><p>고객센터 ${businessProfile.supportPhone}<br />${businessProfile.supportEmail}</p><small>반품 주소 ${businessProfile.returnAddress}</small><button class="secondary-btn compact" type="button" data-route="/customer-center">고객센터 보기</button></article>
      </section>
    `;
  }
  if (state.myTab === "receipts") return renderReceipts();
  if (state.myTab === "recent") {
    return `<div class="page-title compact"><p>MY 활동</p><h1>최근 본 상품</h1></div><section class="product-grid small">${products.slice(0, 3).map(renderProductCard).join("")}</section>`;
  }
  if (state.myTab === "wishlist") {
    const wished = products.filter((product) => state.wishlist.includes(product.slug));
    return `
      <div class="page-title compact"><p>MY 활동</p><h1>찜 리스트</h1></div>
      ${
        wished.length
          ? `<section class="product-grid small">${wished.map(renderProductCard).join("")}</section>`
          : `<article class="empty-card">찜한 상품이 없습니다.</article>`
      }
    `;
  }
  if (state.myTab === "posts") {
    const query = state.postSearch.trim().toLowerCase();
    const posts = state.posts.filter((post) => `${post.type} ${post.title} ${post.status}`.toLowerCase().includes(query));
    return `
      <div class="page-title compact"><p>MY 활동</p><h1>게시물 관리</h1></div>
      <form class="mypage-inline-form" data-post-search-form>
        <label>게시물 검색<input name="query" value="${escapeHtml(state.postSearch)}" placeholder="문의, 후기, 제목 검색" /></label>
        <button class="secondary-btn compact" type="submit">검색</button>
      </form>
      <div class="mypage-list">${posts.map(renderPostRow).join("") || `<article class="empty-card">검색 결과가 없습니다.</article>`}</div>
    `;
  }
  if (state.myTab === "inquiry") return renderInquiryForm();
  if (state.myTab === "inquiries") return renderInquiryHistory();
  if (state.myTab === "reviews") return renderReviewManager();
  if (state.myTab === "review-write") return renderReviewWrite();
  if (state.myTab === "profile") {
    return `
      <div class="page-title compact"><p>MY 정보</p><h1>회원 정보 수정</h1><span>기본 정보와 수신 여부, 추가 정보를 수정합니다.</span></div>
      <form class="member-edit-form" data-profile-form>
        <fieldset>
          <legend>기본정보</legend>
          <div class="signup-field required">
            <label for="member-name">이름</label>
            <input id="member-name" name="name" value="${escapeHtml(state.viewer?.name ?? "")}" autocomplete="name" />
          </div>
          <div class="signup-field">
            <label for="member-telephone">일반전화</label>
            <input id="member-telephone" name="telephone" value="${escapeHtml(state.viewer?.telephone ?? "")}" placeholder="02  -" inputmode="tel" />
          </div>
          <div class="signup-field required">
            <label for="member-phone">휴대전화</label>
            <input id="member-phone" name="phone" value="${escapeHtml(state.viewer?.phone ?? "")}" placeholder="010  -" inputmode="tel" autocomplete="tel" />
          </div>
          <div class="signup-field required">
            <label>SMS 수신여부</label>
            <div class="signup-radio-row">
              <label><input type="radio" name="smsOptIn" value="yes" ${state.viewer?.smsOptIn === "yes" ? "checked" : ""} /> 수신함</label>
              <label><input type="radio" name="smsOptIn" value="no" ${state.viewer?.smsOptIn === "no" ? "checked" : ""} /> 수신안함</label>
            </div>
          </div>
          <div class="signup-field required">
            <label for="member-email">안내 이메일</label>
            <input id="member-email" name="email" type="email" value="${escapeHtml(state.viewer?.email ?? "")}" autocomplete="email" />
          </div>
          <div class="signup-field">
            <label for="member-login-id">로그인 아이디</label>
            <input id="member-login-id" value="${escapeHtml(state.viewer?.loginId || "이메일 로그인")}" readonly />
          </div>
          <div class="signup-field">
            <label for="member-login-email">인증 이메일</label>
            <input id="member-login-email" value="${escapeHtml(state.viewer?.loginEmail ?? "")}" readonly />
          </div>
          <div class="signup-field required">
            <label>이메일 수신여부</label>
            <div class="signup-radio-row">
              <label><input type="radio" name="emailOptIn" value="yes" ${state.viewer?.emailOptIn === "yes" ? "checked" : ""} /> 수신함</label>
              <label><input type="radio" name="emailOptIn" value="no" ${state.viewer?.emailOptIn === "no" ? "checked" : ""} /> 수신안함</label>
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>추가정보</legend>
          <div class="signup-field">
            <label for="member-birthday">생년월일</label>
            <input id="member-birthday" name="birthday" value="${escapeHtml(state.viewer?.birthday ?? "")}" placeholder="YYYY-MM-DD" />
          </div>
          <div class="signup-field">
            <label for="member-anniversary">결혼기념일</label>
            <input id="member-anniversary" name="anniversary" value="${escapeHtml(state.viewer?.anniversary ?? "")}" placeholder="YYYY-MM-DD" />
          </div>
          <div class="signup-field">
            <label for="member-spouse">배우자생일</label>
            <input id="member-spouse" name="spouseBirthday" value="${escapeHtml(state.viewer?.spouseBirthday ?? "")}" placeholder="YYYY-MM-DD" />
          </div>
          <div class="signup-field">
            <label for="member-region">지역</label>
            <select id="member-region" name="region">
              ${["", "서울", "경기", "인천", "부산", "대구", "광주", "대전", "기타"]
                .map((region) => `<option value="${escapeHtml(region)}" ${state.viewer?.region === region ? "selected" : ""}>${region || "선택"}</option>`)
                .join("")}
            </select>
          </div>
        </fieldset>
        <div class="signup-form-actions member-edit-actions">
          <button class="secondary-btn" type="button" data-profile-cancel>취소</button>
          <button class="primary-btn" type="submit">회원정보 수정</button>
        </div>
      </form>
      <article class="empty-card"><strong>기본 배송지는 배송지 관리 탭에서 수정합니다.</strong><span>프로필과 배송지를 분리해 현재 로그인한 회원 데이터만 관리합니다.</span></article>
    `;
  }
  if (state.myTab === "shipping-addresses") return renderAddressBook("배송 주소록 관리");
  if (state.myTab === "addresses") return renderAddressBook();
  if (state.myTab === "payments") return renderPaymentMethods();
  if (state.myTab === "notifications") return renderNotificationSettings();
  if (state.myTab === "withdraw") return renderAccountWithdraw();
  return `<div class="page-title compact"><p>MY 활동</p><h1>마이페이지</h1></div><article class="empty-card">진행 내역이 없습니다.</article>`;
}

function renderMypageSummary() {
  return `
    <section class="mypage-summary">
      <article><span>주문</span><strong>${state.orders.length}</strong></article>
      <article><span>쿠폰</span><strong>${state.coupons.length}</strong></article>
      <article><span>찜</span><strong>${state.wishlist.length}</strong></article>
      <article><span>배송지</span><strong>${state.addresses.length}</strong></article>
    </section>
  `;
}

function renderDeliveryTracker() {
  const services = [
    ["order-fast", "빠른 출고", `평일 ${shippingPolicy.cutoffTime} 이전 주문 시 당일 출고`],
    ["grade-a-plus", "등급 선택", "A+, A, B 등급을 직접 선택"],
    ["order-box", "10구 / 30구", "원하는 구성으로 정확하게"],
    ["safe-pack", "안전 포장", "전용 패키지로 안전하게 배송"],
  ];
  return `
    <section class="mypage-service-strip">
      ${services
        .map(
          ([icon, title, desc]) => `
            <article>
              ${renderUiIcon(icon, "mypage-service-icon")}
              <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(desc)}</span></div>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderOrderRow(order) {
  const item = order.items?.[0];
  const quantity = item?.quantity ?? 1;
  const product = item?.slug ? productBySlug(item.slug) : null;
  const image = item?.image ?? product?.image ?? "ball-titleist.png";
  const name = item?.name ?? product?.name ?? "주문 상품";
  const description = item ? cartItemDescription(item) || "상세 옵션" : "상세 옵션";
  const itemTotal = (item?.price ?? order.total) * quantity;
  return `
    <article class="order-row">
      <div class="order-meta">
        <h2>${escapeHtml(order.date)} 주문</h2>
        <span class="status-pill">${escapeHtml(order.delivery ?? order.status ?? "상품준비")}</span>
        <small>${escapeHtml(order.arrival ?? "배송 준비 중")}</small>
      </div>
      <div class="order-product-thumb"><img src="${asset(image)}" alt="${escapeHtml(name)}" /></div>
      <div class="order-product-copy">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(description)}</span>
        <b>${money.format(itemTotal)}원 · ${quantity}개</b>
      </div>
      <div class="order-actions">
        <button class="plain-link-btn" type="button" data-route="/order/${order.id}">주문 상세보기 〉</button>
        <button class="primary-btn compact" type="button" data-shipping-track="${order.id}">배송 조회</button>
        <button class="secondary-btn compact" type="button" data-return-order="${order.id}">교환/반품 신청</button>
        <div class="order-action-pair">
          <button class="secondary-btn compact" type="button" data-review-order="${order.id}">리뷰 작성하기</button>
          <button class="secondary-btn compact" type="button" data-seller-question="${order.id}">판매자 문의</button>
        </div>
      </div>
    </article>
  `;
}

function renderCouponCard(coupon) {
  return `
    <article class="coupon-card">
      <strong>${escapeHtml(coupon.title)}</strong>
      <b>${escapeHtml(coupon.benefit)}</b>
      <span>${escapeHtml(coupon.status)}</span>
    </article>
  `;
}

function renderPostRow(post) {
  return `
    <article class="mypage-row">
      <div><span>${escapeHtml(post.type)} · ${escapeHtml(post.date)}</span><strong>${escapeHtml(post.title)}</strong></div>
      <b>${escapeHtml(post.status)}</b>
      <button class="secondary-btn compact" type="button" data-post-delete="${post.id}">삭제</button>
    </article>
  `;
}

function renderInquiryRow(post) {
  const hasAnswer = Boolean(post.answer?.trim());
  const isOpen = state.expandedInquiryId === post.id;
  const status = hasAnswer ? "답변 완료" : post.status || "접수 완료";
  const answeredMeta = hasAnswer ? `${post.answeredAt || post.date} 답변` : "답변이 등록되면 여기에서 확인할 수 있습니다.";
  return `
    <article class="mypage-row inquiry-row ${hasAnswer ? "has-answer" : ""} ${isOpen ? "is-open" : ""}">
      <div class="inquiry-row-main">
        <span>${escapeHtml(post.type)} · ${escapeHtml(post.date)}</span>
        <strong>${escapeHtml(post.title)}</strong>
        ${post.body ? `<p>${renderMultilineText(post.body)}</p>` : ""}
      </div>
      <div class="inquiry-row-status">
        <b class="${hasAnswer ? "is-answered" : ""}">${escapeHtml(status)}</b>
        <small>${escapeHtml(answeredMeta)}</small>
      </div>
      <div class="inquiry-row-actions">
        ${
          hasAnswer
            ? `<button class="secondary-btn compact" type="button" data-inquiry-toggle="${post.id}" aria-expanded="${isOpen ? "true" : "false"}">${isOpen ? "답변 접기" : "답변 보기"}</button>`
            : `<button class="secondary-btn compact" type="button" disabled>답변 대기</button>`
        }
        <button class="secondary-btn compact" type="button" data-post-delete="${post.id}">삭제</button>
      </div>
      ${
        hasAnswer && isOpen
          ? `<section class="inquiry-answer" aria-label="문의 답변">
              <div class="inquiry-answer-head">
                <span>REBALL LOSTBALL 답변</span>
                <time>${escapeHtml(post.answeredAt || post.date)}</time>
              </div>
              <p>${renderMultilineText(post.answer)}</p>
            </section>`
          : ""
      }
    </article>
  `;
}

function addMypagePost({ type, title, body = "", status = "접수 완료", orderId = "", answer = "", answeredAt = "" }) {
  state.posts.unshift({
    id: `POST-${Date.now()}`,
    type,
    title,
    body,
    date: todayIso(),
    status,
    orderId,
    answer,
    answeredAt,
  });
  save("reball.posts", state.posts);
}

function renderAddressBook(title = "배송지 관리") {
  return `
    <div class="page-title compact"><p>MY 정보</p><h1>${escapeHtml(title)}</h1><span>배송지 추가, 기본 배송지 지정, 삭제를 바로 관리합니다.</span></div>
    <form class="mypage-inline-form address-form" data-address-form>
      <div class="address-form-row address-form-row-top">
        <label>수령인<input name="recipient" placeholder="수령인" required /></label>
        <label>연락처<input name="phone" placeholder="010-0000-0000" required /></label>
        <label>우편번호<input name="zipCode" placeholder="우편번호" /></label>
      </div>
      <div class="address-form-row address-form-row-bottom">
        <label>기본주소<input name="roadAddress" placeholder="주소를 입력하세요" required /></label>
        <label>상세주소<input name="detailAddress" placeholder="상세 주소" /></label>
        <button class="gold-cart-btn compact" type="submit">배송지 추가</button>
      </div>
    </form>
    <section class="mypage-card-grid">
      ${state.addresses.length ? state.addresses.map(renderAddressCard).join("") : `<article class="empty-card">등록된 배송지가 없습니다.</article>`}
    </section>
  `;
}

function renderAddressCard(address) {
  return `
    <article class="mypage-info-card">
      <div class="mypage-card-title"><strong>${escapeHtml(address.label)}</strong>${address.isDefault ? "<span>기본</span>" : ""}</div>
      <p>${escapeHtml(address.recipient)} · ${escapeHtml(address.phone)}</p>
      <small>${escapeHtml(formatAccountAddress(address) || address.address || "주소 정보 없음")}</small>
      <div class="mypage-card-actions">
        <button class="secondary-btn compact" type="button" data-address-default="${address.id}">기본 설정</button>
        <button class="secondary-btn compact" type="button" data-address-delete="${address.id}">삭제</button>
      </div>
    </article>
  `;
}

function renderPaymentMethods() {
  return `
    <div class="page-title compact"><p>MY 정보</p><h1>결제 정보</h1><span>PG 결제 연동 전이라 실제 결제수단과 결제내역은 아직 저장되지 않습니다.</span></div>
    <article class="empty-card"><strong>등록된 결제 데이터가 없습니다.</strong><span>Toss Payments 연동 단계에서 결제수단과 결제내역을 연결할 예정입니다.</span></article>
  `;
}

function renderPaymentCard(method) {
  return `
    <article class="mypage-info-card">
      <div class="mypage-card-title"><strong>${escapeHtml(method.type)}</strong>${method.isDefault ? "<span>기본</span>" : ""}</div>
      <p>${escapeHtml(method.name)}</p>
      <small>${escapeHtml(method.detail)}</small>
      <div class="mypage-card-actions">
        <button class="secondary-btn compact" type="button" data-payment-default="${method.id}">기본 설정</button>
        <button class="secondary-btn compact" type="button" data-payment-delete="${method.id}">삭제</button>
      </div>
    </article>
  `;
}

function renderNotificationSettings() {
  const items = [
    ["order", "주문 상태", "결제 확인, 상품 준비 상태를 알려드립니다."],
    ["delivery", "배송 안내", "출고와 배송 완료 알림을 받습니다."],
    ["coupon", "쿠폰 / 혜택", "쿠폰 발급과 만료 예정 알림을 받습니다."],
    ["marketing", "마케팅 수신", "이벤트와 기획전 소식을 받습니다."],
    ["restock", "재입고 알림", "품절 상품 입고 시 안내를 받습니다."],
  ];
  return `
    <div class="page-title compact"><p>MY 정보</p><h1>알림 설정</h1></div>
    <section class="mypage-toggle-list">
      ${items
        .map(
          ([id, title, desc]) => `
            <label class="mypage-toggle-row">
              <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(desc)}</small></span>
              <input type="checkbox" data-notification-toggle="${id}" ${state.notifications[id] ? "checked" : ""} />
            </label>
          `
        )
        .join("")}
    </section>
  `;
}

function renderAccountWithdraw() {
  return `
    <div class="page-title compact"><p>MY 정보</p><h1>회원 탈퇴</h1></div>
    <section class="mypage-danger-card">
      <strong>탈퇴 전 확인</strong>
      <p>실제 회원 탈퇴는 운영 확인이 필요한 작업입니다. 고객센터를 통해 요청해 주세요.</p>
      <label>확인 문구<input data-withdraw-confirm-input placeholder="탈퇴합니다" /></label>
      <button class="secondary-btn compact danger" type="button" data-withdraw-account>회원 탈퇴</button>
    </section>
  `;
}

function renderReceipts() {
  if (!state.orders.length) {
    return `
      <div class="page-title compact"><p>MY 쇼핑</p><h1>영수증 조회 / 출력</h1><span>실제 주문과 결제가 생기면 영수증을 이곳에서 확인합니다.</span></div>
      <article class="empty-card"><strong>출력할 영수증이 없습니다.</strong><span>아직 결제 완료된 주문 데이터가 없습니다.</span></article>
    `;
  }

  return `
    <div class="page-title compact"><p>MY 쇼핑</p><h1>영수증 조회 / 출력</h1><span>주문별 영수증과 세금계산서를 확인하고 출력합니다.</span></div>
    <form class="mypage-inline-form" data-receipt-search-form>
      <label>주문번호 또는 상품명<input name="query" placeholder="주문번호 또는 상품명을 입력하세요." /></label>
      <button class="primary-btn compact" type="submit">조회하기</button>
    </form>
    <section class="mypage-table">
      <div class="mypage-table-head"><span>주문일</span><span>주문번호</span><span>상품명</span><span>결제금액</span><span>상세</span></div>
      ${state.orders
        .map((order) => {
          const item = order.items?.[0];
          const title = item?.name ?? "주문 상품";
          return `
            <article class="mypage-table-row">
              <span>${escapeHtml(order.date)}</span>
              <span>${escapeHtml(order.id)}</span>
              <strong>${escapeHtml(title)}</strong>
              <b>₩${money.format(order.total)}</b>
              <button class="secondary-btn compact" type="button" data-print-receipt="${order.id}">영수증 출력</button>
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderInquiryForm() {
  return `
    <div class="page-title compact"><p>MY 활동</p><h1>문의하기</h1><span>상품, 배송, 결제 문의를 남기면 문의내역에서 처리 상태를 확인합니다.</span></div>
    <form class="profile-form mypage-form-card" data-inquiry-form>
      <label>문의 유형<select name="type"><option>상품 문의</option><option>배송 문의</option><option>결제 문의</option><option>교환/반품 문의</option></select></label>
      <label>제목<input name="title" placeholder="문의 제목" required /></label>
      <label>내용<textarea name="body" placeholder="문의 내용을 입력하세요" required></textarea></label>
      <button class="primary-btn" type="submit">문의 등록</button>
    </form>
  `;
}

function renderInquiryHistory() {
  const inquiries = state.posts.filter((post) => post.type.includes("문의") || post.type.includes("반품") || post.type.includes("배송"));
  return `
    <div class="page-title compact"><p>MY 활동</p><h1>문의내역 확인</h1><span>등록한 문의와 반품 접수 상태를 확인합니다.</span></div>
    <div class="mypage-list">${inquiries.map(renderInquiryRow).join("") || `<article class="empty-card">등록된 문의가 없습니다.</article>`}</div>
  `;
}

function reviewPosts() {
  return state.posts.filter((post) => post.type.includes("후기") || post.type.includes("리뷰"));
}

function reviewForOrder(orderId) {
  return reviewPosts().find((review) => review.orderId === orderId);
}

function pendingReviewOrders() {
  return state.orders.filter((order) => !reviewForOrder(order.id));
}

function orderPrimaryItem(order) {
  return order?.items?.[0] ?? null;
}

function reviewProductMeta(order, item) {
  const optionText = item ? cartItemDescription(item) || "옵션 정보 없음" : "옵션 정보 없음";
  return [optionText, order?.date ? `${order.date} 구매` : ""].filter(Boolean).join(" · ");
}

function updateReviewRating(value) {
  const rating = Math.max(1, Math.min(5, Number(value) || 5));
  const input = document.querySelector("[data-review-rating-input]");
  const group = document.querySelector("[data-review-rating]");
  if (input) input.value = String(rating);
  group?.querySelectorAll("[data-review-rating-value]").forEach((button) => {
    const buttonRating = Number(button.dataset.reviewRatingValue);
    const isActive = buttonRating <= rating;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-checked", buttonRating === rating ? "true" : "false");
  });
}

function renderReviewUploadPreviews(input) {
  const form = input.closest("[data-review-write-form]");
  const selectedFiles = Array.from(input.files || []).filter((file) => file.type.startsWith("image/"));
  const files = selectedFiles.slice(0, 4);
  const slots = Array.from(document.querySelectorAll("[data-review-upload-slot]"));
  const countNode = document.querySelector("[data-review-upload-count]");

  if (selectedFiles.length > 4) showToast("사진은 최대 4장까지 첨부할 수 있습니다.");
  if (form) form.dataset.reviewPhotoCount = String(files.length);
  if (countNode) countNode.textContent = files.length ? `${files.length}장 첨부됨` : "최대 4장까지 첨부할 수 있습니다.";

  slots.forEach((slot, index) => {
    if (slot.dataset.previewUrl) URL.revokeObjectURL(slot.dataset.previewUrl);
    delete slot.dataset.previewUrl;
    const file = files[index];
    slot.classList.toggle("has-file", Boolean(file));
    slot.innerHTML = "";
    if (!file) {
      slot.textContent = index === files.length ? "+" : "";
      return;
    }

    const image = document.createElement("img");
    const previewUrl = URL.createObjectURL(file);
    slot.dataset.previewUrl = previewUrl;
    image.src = previewUrl;
    image.alt = file.name;
    const label = document.createElement("span");
    label.textContent = file.name;
    slot.append(image, label);
  });
}

function renderReviewManager() {
  const reviews = reviewPosts();
  const pendingOrders = pendingReviewOrders();
  return `
    <div class="page-title compact"><p>MY 활동</p><h1>리뷰관리</h1><span>작성 대기 리뷰와 작성 완료 리뷰를 관리합니다.</span></div>
    <section class="review-stat-card" aria-label="리뷰 요약">
      <article>
        <span>작성 대기</span>
        <strong>${pendingOrders.length}건</strong>
      </article>
      <article>
        <span>작성 완료</span>
        <strong>${reviews.length}건</strong>
      </article>
    </section>
    <section class="review-product-list" aria-label="작성 대기 상품">
      ${
        pendingOrders.length
          ? pendingOrders
              .map((order) => {
                const item = orderPrimaryItem(order);
                const product = item?.slug ? productBySlug(item.slug) : null;
                const image = item?.image ?? product?.image ?? "ball-titleist.png";
                const name = item?.name ?? product?.name ?? "주문 상품";
                return `
                  <article class="review-product-row">
                    <div class="review-product-thumb"><img src="${asset(image)}" alt="${escapeHtml(name)}" /></div>
                    <div class="review-product-copy">
                      <strong>${escapeHtml(name)}</strong>
                      <span>${escapeHtml(reviewProductMeta(order, item))}</span>
                    </div>
                    <button class="primary-btn compact review-write-entry" type="button" data-review-order="${escapeHtml(order.id)}">리뷰 작성하기</button>
                  </article>
                `;
              })
              .join("")
          : `<article class="review-empty-state"><strong>작성 대기 리뷰가 없습니다.</strong><span>구매 완료 상품의 리뷰 작성 상태가 이곳에 표시됩니다.</span></article>`
      }
    </section>
  `;
}

function renderReviewWrite() {
  const fallbackOrder = pendingReviewOrders()[0] ?? state.orders[0];
  const order = state.orders.find((item) => item.id === state.selectedReviewOrderId) ?? fallbackOrder;
  if (!order) {
    return `
      <div class="page-title compact"><p>MY 활동</p><h1>리뷰 작성</h1><span>리뷰를 작성할 주문을 찾을 수 없습니다.</span></div>
      <article class="empty-card"><strong>작성 가능한 주문이 없습니다.</strong><button class="primary-btn" type="button" data-my-tab="reviews">리뷰관리로 돌아가기</button></article>
    `;
  }

  const item = orderPrimaryItem(order);
  const product = item?.slug ? productBySlug(item.slug) : null;
  const image = item?.image ?? product?.image ?? "ball-titleist.png";
  const name = item?.name ?? product?.name ?? "주문 상품";
  return `
    <div class="page-title compact"><p>MY 활동</p><h1>리뷰 작성</h1><span>구매하신 상품의 만족도와 사용 후기를 남겨주세요.</span></div>
    <article class="review-write-product">
      <div class="review-product-thumb"><img src="${asset(image)}" alt="${escapeHtml(name)}" /></div>
      <div class="review-product-copy">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(reviewProductMeta(order, item))}</span>
      </div>
      <span class="review-status-pill">작성 대기</span>
    </article>
    <form class="review-write-form" data-review-write-form data-review-order-id="${escapeHtml(order.id)}">
      <section class="review-write-section">
        <h2>상품 만족도</h2>
        <div class="review-rating-group" role="radiogroup" aria-label="상품 만족도" data-review-rating>
          <input type="hidden" name="rating" value="5" data-review-rating-input />
          ${[1, 2, 3, 4, 5]
            .map(
              (rating) => `
                <button class="is-active" type="button" role="radio" aria-checked="${rating === 5 ? "true" : "false"}" aria-label="${rating}점" data-review-rating-value="${rating}">
                  <span aria-hidden="true">★</span>
                </button>
              `
            )
            .join("")}
        </div>
        <p>만족도를 선택해 주세요.</p>
      </section>
      <section class="review-write-section review-upload-section">
        <h2>사진 첨부</h2>
        <input class="review-upload-input" type="file" accept="image/*" multiple data-review-file-input />
        <div class="review-upload-slots">
          ${[0, 1, 2, 3]
            .map((index) => `<button type="button" data-review-upload-slot="${index}" aria-label="리뷰 사진 ${index + 1} 첨부">${index === 0 ? "+" : ""}</button>`)
            .join("")}
        </div>
        <p data-review-upload-count>최대 4장까지 첨부할 수 있습니다.</p>
      </section>
      <section class="review-write-section review-body-section">
        <label for="review-body">리뷰 내용</label>
        <textarea id="review-body" name="body" maxlength="500" placeholder="상품 상태, 배송, 실제 사용감을 자세히 남겨주세요."></textarea>
      </section>
      <div class="review-write-actions">
        <button class="secondary-btn" type="button" data-review-cancel>취소</button>
        <button class="primary-btn" type="submit">리뷰 등록하기</button>
      </div>
    </form>
  `;
}

function renderStore() {
  layout(`
    <section class="store-hero">
      <img src="${asset("banner-store-event.webp")}" alt="부천 매장 직운영 이벤트" />
    </section>
    <section class="store-grid">
      <article><h2>매장 주소</h2><p>${businessProfile.address}</p></article>
      <article><h2>운영시간</h2><p>${businessProfile.operationHours}<br />출고 마감 ${shippingPolicy.cutoffTime}</p></article>
      <article><h2>브랜드 상담</h2><p>${brandMenu.map(([, label]) => label).join(" / ")} 순서로 상담 가능합니다.</p></article>
    </section>
    <section class="dark-cta">
      <p>REBALL LOSTBALL STORE</p>
      <h1>매장 방문 전 원하는 브랜드와 등급을 먼저 골라보세요.</h1>
      <button class="light-btn" type="button" data-route="/">상품 보러가기</button>
      <button class="outline-light-btn" type="button" data-route="/customer-center">고객센터 문의</button>
    </section>
  `);
}

function renderInspection() {
  layout(
    `
      <section class="inspection-page">
        <img
          class="inspection-page-image"
          src="${asset("inspection-criteria-guide.png")}" 
          alt="검수 기준 안내 S A B 등급 기준을 투명하게 공개합니다"
          loading="eager"
          decoding="sync"
        />
      </section>
    `,
    { mainClass: "inspection-main", noFooter: true }
  );
}

function renderBrandStory() {
  layout(`
    <section class="page-title">
      <p>브랜드 스토리</p>
      <h1>로스트볼을 다시 신뢰할 수 있게 만드는 기준</h1>
      <span>상품 이미지 표준화, 공 딤플 밀도, 컴팩트한 컬러 순환 마크, 워드마크 비율을 중심으로 브랜드 경험을 정리했습니다.</span>
    </section>
    <section class="story-panel">
      <img src="${asset("reball-logo.png")}" alt="" />
      <div>
        <h2>리볼 로스트볼</h2>
        <p>동일한 크기, 명도, 채도, 조명 방향의 누끼 이미지를 기준으로 상품 상세와 카드 이미지를 관리합니다.</p>
      </div>
    </section>
  `);
}

function renderCustomerCenter() {
  layout(`
    <section class="customer-center-image-view">
      <img src="${asset("customer-center-full.png")}" alt="고객센터 안내 이미지" />
    </section>
  `);
}

function renderNotice() {
  const pinned = noticeItems.find((item) => item.pinned) ?? noticeItems[0];

  layout(`
    <section class="notice-page">
      <div class="notice-hero">
        <div class="notice-hero-copy">
          <p>NOTICE</p>
          <h1>공지사항</h1>
          <span>리볼 로스트볼의 쇼핑몰 운영, 배송, 상품 기준과 회원 혜택 소식을 확인하세요.</span>
        </div>
        <article class="notice-pin-card">
          <span>${escapeHtml(pinned.category)}</span>
          <time>${escapeHtml(pinned.date)}</time>
          <strong>${escapeHtml(pinned.title)}</strong>
          <p>${escapeHtml(pinned.body)}</p>
        </article>
      </div>

      <div class="notice-summary-strip" aria-label="공지 분류">
        ${["전체", ...new Set(noticeItems.map((item) => item.category))].map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
      </div>

      <section class="notice-list" aria-label="공지사항 목록">
        ${noticeItems.map(renderNoticeItem).join("")}
      </section>
    </section>
  `);
}

function renderNoticeItem(item, index) {
  return `
    <details class="notice-item" ${index === 0 ? "open" : ""}>
      <summary>
        <span>${escapeHtml(item.category)}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <time>${escapeHtml(item.date)}</time>
        <b aria-hidden="true">${icons.chevron}</b>
      </summary>
      <p>${escapeHtml(item.body)}</p>
    </details>
  `;
}

function renderFaq() {
  const categories = [...new Set(faqItems.map((item) => item.category))];

  layout(`
    <section class="faq-page">
      <div class="faq-hero">
        <div class="faq-hero-copy">
          <p>FAQ</p>
          <h1>자주 묻는 질문</h1>
          <span>주문 전후로 가장 많이 확인하는 등급, 배송, 교환/반품 안내를 한곳에 정리했습니다.</span>
        </div>
        <div class="faq-contact-card">
          <span class="faq-contact-icon">${renderShopIcon("service-headset", "faq-contact-img")}</span>
          <strong>${businessProfile.supportPhone}</strong>
          <p>평일 ${businessProfile.operationHours}<br />${businessProfile.supportEmail}</p>
          <button class="secondary-btn compact" type="button" data-route="/customer-center">고객센터 보기</button>
        </div>
      </div>

      <div class="faq-category-strip" aria-label="FAQ 분류">
        ${categories.map((category) => `<span>${escapeHtml(category)}</span>`).join("")}
      </div>

      <section class="faq-list" aria-label="자주 묻는 질문 목록">
        ${faqItems.map(renderFaqItem).join("")}
      </section>
    </section>
  `);
}

function renderFaqItem(item, index) {
  return `
    <details class="faq-item" ${index === 0 ? "open" : ""}>
      <summary>
        <span>${escapeHtml(item.category)}</span>
        <strong>${escapeHtml(item.question)}</strong>
        <b aria-hidden="true">${icons.chevron}</b>
      </summary>
      <p>${escapeHtml(item.answer)}</p>
    </details>
  `;
}

function renderCustomerSummaryItem(title, body, iconName) {
  return `
    <article class="customer-service-summary-item">
      ${renderShopIcon(iconName, "customer-service-summary-icon")}
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(body)}</span>
    </article>
  `;
}

function renderCustomerInfoCard(title, body, iconName) {
  return `
    <article class="customer-info-card">
      <div class="customer-info-head">
        <span class="customer-info-icon-wrap">${renderShopIcon(iconName, "customer-info-icon")}</span>
        <h2>${escapeHtml(title)}</h2>
      </div>
      <div class="customer-info-body">${body}</div>
    </article>
  `;
}

function renderCustomerFactList(items) {
  return `
    <div class="customer-info-fact-list">
      ${items
        .map(
          ([label, value]) => `
            <p>
              <strong>${escapeHtml(label)}</strong>
              <span>${escapeHtml(value)}</span>
            </p>
          `
        )
        .join("")}
    </div>
  `;
}

const adminNavGroups = [
  {
    title: "홈",
    items: [["dashboard", "대시보드", "menu"]],
  },
  {
    title: "주문/관리",
    items: [
      ["orders", "주문관리", "cart"],
      ["product", "상품관리", "box"],
      ["customer", "고객/회원관리", "user"],
      ["returns", "취소/반품/교환관리", "truck"],
      ["inquiry", "문의답변", "bell"],
      ["coupon", "쿠폰/배너관리", "coupon"],
      ["review", "리뷰관리", "star"],
    ],
  },
  {
    title: "운영/정산",
    items: [
      ["pos", "포스기 관리", "receipt"],
      ["settlement", "정산/통계", "cardPay"],
      ["settings", "설정/권한", "shield"],
    ],
  },
];

function renderAdmin() {
  state.adminTab = normalizeAdminTab(state.adminTab);
  if (!state.adminUser) {
    renderAdminLogin();
    return;
  }

  layout(
    `
      <section class="admin-shell" data-admin-root>
        ${renderAdminSidebar()}
        <section class="admin-workspace">
          ${renderAdminTopbar()}
          ${renderAdminContent()}
        </section>
        ${renderAdminModal()}
      </section>
    `,
    { admin: true, noHeader: true, mainClass: "admin-main" }
  );
  void loadAdminMembers();
}

function renderAdminLogin() {
  const profile = state.adminProfile;
  layout(
    `
      <section class="admin-auth-shell">
        <form class="admin-auth-card" data-admin-login-form>
          <a class="admin-auth-logo" href="#/" aria-label="리볼 로스트볼 홈">
            <img src="${asset("reball-logo.png")}" alt="" />
            <span><strong>REBALL LOSTBALL</strong><em>ADMIN</em></span>
          </a>
          <div class="admin-auth-copy">
            <p>관리자 페이지</p>
            <h1>아이디와 암호를 입력하세요</h1>
            <span>인증 전에는 관리자 대시보드, 주문, 상품, 정산 화면에 접근할 수 없습니다.</span>
          </div>
          <label>
            아이디
            <input name="adminId" autocomplete="username" placeholder="${escapeHtml(profile.id)}" required />
          </label>
          <label>
            암호
            <input name="adminPassword" type="password" autocomplete="current-password" placeholder="관리자 암호" required />
          </label>
          ${state.adminLoginError ? `<p class="admin-auth-error">${escapeHtml(state.adminLoginError)}</p>` : ""}
          <button class="primary-btn admin-auth-submit" type="submit">${renderInlineSvg("lock")} 로그인</button>
          <button class="secondary-btn" type="button" data-route="/">쇼핑몰로 돌아가기</button>
        </form>
      </section>
    `,
    { admin: true, noHeader: true, mainClass: "admin-main admin-auth-main" }
  );
}

function normalizeAdminTab(tab) {
  const aliases = { products: "product", coupons: "coupon" };
  const normalized = aliases[tab] ?? tab ?? "dashboard";
  return adminNavGroups.some((group) => group.items.some(([id]) => id === normalized)) ? normalized : "dashboard";
}

function renderAdminSidebar() {
  return `
    <aside class="admin-sidebar">
      <a class="admin-sidebar-brand" href="#/admin" aria-label="관리자 대시보드">
        <strong>REBALL LOSTBALL</strong>
        <span>ADMIN</span>
      </a>
      <nav class="admin-nav" aria-label="관리자 메뉴">
        ${adminNavGroups
          .map(
            (group) => `
              <div class="admin-nav-group">
                <p>${escapeHtml(group.title)}</p>
                ${group.items
                  .map(
                    ([id, label, icon]) => `
                      <button class="${state.adminTab === id ? "is-active" : ""}" type="button" data-admin-tab="${id}">
                        ${renderAdminIcon(icon)}
                        <span>${escapeHtml(label)}</span>
                      </button>
                    `
                  )
                  .join("")}
              </div>
            `
          )
          .join("")}
      </nav>
      <div class="admin-support-card">
        <strong>관리자 고객센터</strong>
        <a href="tel:${businessProfile.supportPhone.replaceAll("-", "")}">${businessProfile.supportPhone}</a>
        <span>평일 ${businessProfile.operationHours}</span>
        <button class="secondary-btn compact" type="button" data-route="/customer-center">1:1 문의하기</button>
      </div>
      <button class="admin-shop-link" type="button" data-route="/">쇼핑몰 보기</button>
    </aside>
  `;
}

function renderAdminTopbar() {
  const profile = state.adminProfile;
  const badge = (profile.id || "A").trim().charAt(0).toUpperCase() || "A";
  return `
    <header class="admin-topbar">
      <div class="admin-breadcrumb">
        <span>홈</span>
        <b>${escapeHtml(adminTabLabel(state.adminTab))}</b>
      </div>
      <form class="admin-search" data-admin-search-form>
        <input name="adminSearch" value="${escapeHtml(state.adminSearch)}" placeholder="주문번호, 고객명, 상품명 검색" />
        <button type="submit" aria-label="검색">${renderUiIcon("search", "admin-search-img")}</button>
      </form>
      <button class="admin-icon-button" type="button" data-admin-modal="notifications" aria-label="알림">
        ${renderAdminIcon("bell")}
        <b>3</b>
      </button>
      <button class="admin-profile-button" type="button" data-admin-modal="profileSettings">
        <span>${escapeHtml(badge)}</span>
        <em>${escapeHtml(profile.id)}<br /><small>${escapeHtml(profile.role)}</small></em>
      </button>
      <button class="admin-logout" type="button" data-admin-logout>로그아웃</button>
    </header>
  `;
}

function renderAdminContent() {
  const title = adminTabLabel(state.adminTab);
  return `
    <section class="admin-page-head">
      <div>
        <p>${escapeHtml(adminTabEyebrow(state.adminTab))}</p>
        <h1>${escapeHtml(title)}</h1>
        <span>${escapeHtml(adminTabDescription(state.adminTab))}</span>
      </div>
      <div class="admin-head-actions">${renderAdminActionButtons(state.adminTab, true)}</div>
    </section>
    ${renderAdminStats(state.adminTab)}
    <section class="admin-panel-grid">
      <article class="admin-panel admin-panel-main">
        <header>
          <div>
            <h2>${escapeHtml(adminTableTitle(state.adminTab))}</h2>
            ${state.adminSearch ? `<span>${escapeHtml(`"${state.adminSearch}" 검색 결과`)}</span>` : ""}
          </div>
          ${renderAdminActionButtons(state.adminTab, false)}
        </header>
        ${renderAdminTable(state.adminTab)}
      </article>
      <aside class="admin-panel admin-panel-side">
        ${renderAdminInsight(state.adminTab)}
        ${renderAdminQuickList(state.adminTab)}
      </aside>
    </section>
  `;
}

function renderAdminStats(tab) {
  return `
    <section class="admin-stat-grid">
      ${adminStatsForTab(tab)
        .map(
          (item) => `
            <article class="admin-stat-card ${item.warning ? "is-warning" : ""}">
              <span class="admin-stat-icon">${renderAdminIcon(item.icon)}</span>
              <div>
                <p>${escapeHtml(item.label)}</p>
                <strong>${escapeHtml(item.value)}</strong>
                <small>${escapeHtml(item.delta)}</small>
              </div>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderAdminTable(tab) {
  const rows = filterAdminRows(adminRowsForTab(tab));
  if (!rows.length) {
    if (tab === "customer" && (state.adminMembersLoading || !state.adminMembersLoaded)) {
      return `<div class="admin-empty"><strong>회원 데이터를 불러오는 중입니다.</strong><span>Supabase profiles 테이블에서 가입 회원을 확인하고 있습니다.</span></div>`;
    }
    if (tab === "customer" && state.adminMembersError) {
      return `<div class="admin-empty"><strong>회원 데이터를 불러오지 못했습니다.</strong><span>${escapeHtml(state.adminMembersError)}</span></div>`;
    }
    return `<div class="admin-empty"><strong>검색 결과가 없습니다.</strong><span>다른 주문번호, 고객명, 상품명으로 다시 검색하세요.</span></div>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-data-table">
        <thead>
          <tr>
            <th>${escapeHtml(adminFirstColumn(tab))}</th>
            <th>상세</th>
            <th>상태</th>
            <th>수치</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>
                    <div class="admin-row-title">
                      ${row.image ? `<span class="admin-product-thumb"><img src="${asset(row.image)}" alt="" /></span>` : `<span class="admin-row-mark">${escapeHtml(row.mark ?? row.title.slice(0, 1))}</span>`}
                      <div>
                        <strong>${escapeHtml(row.title)}</strong>
                        <small>${escapeHtml(row.id)}</small>
                      </div>
                    </div>
                  </td>
                  <td>${escapeHtml(row.meta)}</td>
                  <td><span class="admin-status ${row.tone ?? ""}">${escapeHtml(row.status)}</span></td>
                  <td><strong class="admin-table-value">${escapeHtml(row.value)}</strong><small>${escapeHtml(row.subValue ?? "")}</small></td>
                  <td>
                    <button
                      class="admin-table-action"
                      type="button"
                      data-admin-modal="${escapeHtml(row.modal ?? adminDefaultModal(tab))}"
                      ${row.id ? `data-admin-row-id="${escapeHtml(row.id)}"` : ""}
                      ${row.rowKind ? `data-admin-row-kind="${escapeHtml(row.rowKind)}"` : ""}
                    >${escapeHtml(row.action ?? "상세보기")}</button>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminInsight(tab) {
  const bars = adminChartValues(tab);
  return `
    <section class="admin-insight">
      <header>
        <h2>${escapeHtml(adminChartTitle(tab))}</h2>
        <button type="button" data-admin-modal="${tab === "dashboard" ? "orderStatus" : "searchResult"}">전체 보기</button>
      </header>
      <div class="admin-chart-area">
        <div class="admin-donut" style="--a: ${bars[0]}%; --b: ${bars[1]}%; --c: ${bars[2]}%;">
          <span>${escapeHtml(adminChartCenter(tab))}</span>
        </div>
        <div class="admin-bars">
          ${bars
            .map(
              (value, index) => `
                <span style="--value: ${value}%">
                  <i></i>
                  <b>${escapeHtml(adminChartLabels(tab)[index])}</b>
                </span>
              `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderAdminQuickList(tab) {
  const items = adminQuickItems(tab);
  return `
    <section class="admin-quick-list">
      <header>
        <h2>빠른 처리</h2>
        <button type="button" data-admin-modal="quickAction">빠른 작업</button>
      </header>
      ${items
        .map(
          (item) => `
            <button type="button" data-admin-modal="${escapeHtml(item.modal)}">
              <span>${renderAdminIcon(item.icon)}</span>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.body)}</small>
            </button>
          `
        )
        .join("")}
    </section>
  `;
}

function renderAdminActionButtons(tab, primaryOnly) {
  const actions = adminActionsForTab(tab).filter((action) => !primaryOnly || action.primary);
  return actions
    .map(
      (action) => `
        <button class="${action.primary ? "admin-primary-action" : "admin-secondary-action"}" type="button" data-admin-modal="${escapeHtml(action.modal)}">
          ${renderAdminIcon(action.icon)}
          <span>${escapeHtml(action.label)}</span>
        </button>
      `
    )
    .join("");
}

function renderAdminModal() {
  if (!state.adminModal) return "";
  const modal = adminModalConfig(state.adminModal);
  return `
    <section class="admin-modal-layer" role="dialog" aria-modal="true" aria-label="${escapeHtml(modal.title)}">
      <button class="admin-modal-backdrop" type="button" data-admin-modal-close aria-label="닫기"></button>
      <article class="admin-modal-card">
        <header>
          <div>
            <p>${escapeHtml(modal.eyebrow)}</p>
            <h2>${escapeHtml(modal.title)}</h2>
          </div>
          <button type="button" data-admin-modal-close aria-label="닫기">${renderInlineSvg("close")}</button>
        </header>
        <div class="admin-modal-body">${modal.body}</div>
        <footer>
          <button class="secondary-btn" type="button" data-admin-modal-close>취소</button>
          <button class="primary-btn" type="button" data-admin-modal-primary="${escapeHtml(modal.primary)}" data-admin-modal-action="${escapeHtml(state.adminModal)}">${escapeHtml(modal.primary)}</button>
        </footer>
      </article>
    </section>
  `;
}

function adminModalConfig(id) {
  const q = state.adminSearch || "검색어 없음";
  const modalOrderSummary = summarizeAdminOrders(adminOrders());
  const modalStockLow = catalogProducts().filter((product) => product.stock < 45).length;
  const modalPendingReturns = adminReturns().filter((row) => row.status.includes("대기")).length;
  if (id.startsWith("inquiryReply")) {
    const inquiryId = id.split(":")[1] || adminFirstPendingInquiry()?.id || "";
    return {
      title: "문의 답변하기",
      eyebrow: "고객 문의 원문을 확인하고 답변을 저장합니다.",
      body: renderAdminInquiryReplyForm(inquiryId),
      primary: "답변 저장",
    };
  }
  if (id === "couponRegister") {
    const editingCoupon = currentEditingCoupon();
    return {
      title: editingCoupon ? "쿠폰 수정" : "쿠폰 등록",
      eyebrow: editingCoupon ? "선택한 쿠폰 정보를 수정합니다." : "쿠폰/배너 프로모션을 생성합니다.",
      body: renderAdminCouponRegisterForm(),
      primary: editingCoupon ? "수정 저장" : "쿠폰 등록",
    };
  }
  if (id === "saveOrder" && (state.adminTab === "coupon" || state.adminModalContext?.rowKind === "banner")) {
    return {
      title: "배너 순서 저장",
      eyebrow: "홈 캐러셀에 노출되는 배너 순서를 저장합니다.",
      body: renderAdminBannerOrderForm(),
      primary: "순서 저장",
    };
  }
  const configs = {
    quickAction: ["빠른 작업", "운영자가 자주 쓰는 처리 작업을 선택하세요.", renderAdminFormFields([["작업 유형", "select", "주문 상태 변경"], ["메모", "textarea", "처리 내용을 입력하세요"]]), "작업 실행"],
    productRegister: ["상품 등록", "신규 상품과 재고 기준을 등록합니다.", renderAdminProductRegisterForm(), "상품 등록"],
    orderDetail: ["주문 상세", "주문 상품, 배송지, 결제 상태를 확인합니다.", renderAdminOrderDetail(), "상태 저장"],
    returnRequest: ["반품 요청", "교환/반품 접수 정보를 확인합니다.", renderAdminFormFields([["요청 유형", "select", "교환"], ["사유", "textarea", "상품 등급 문의"]]), "접수 저장"],
    inquiryReply: ["문의 답변하기", "고객 문의 원문을 확인하고 답변을 저장합니다.", renderAdminInquiryReplyForm(adminFirstPendingInquiry()?.id || ""), "답변 저장"],
    downloadExport: ["엑셀 다운로드", "현재 화면의 목록을 파일로 내보냅니다.", renderAdminFormFields([["범위", "select", adminTabLabel(state.adminTab)], ["형식", "select", "Excel"]]), "다운로드"],
    columnSettings: ["컬럼 설정", "테이블에 표시할 컬럼을 선택합니다.", renderAdminChecklist(["상품 이미지", "주문번호", "고객명", "상태", "담당자", "금액"]), "컬럼 저장"],
    searchResult: ["검색 결과", `"${q}"에 대한 관리자 검색 결과입니다.`, renderAdminSearchResult(), "확인"],
    notifications: [
      "알림",
      "주문, 재고, 반품 알림을 확인합니다.",
      renderAdminChecklist([`신규 주문 ${modalOrderSummary.total}건`, `재고 부족 상품 ${modalStockLow}건`, `반품 승인 대기 ${modalPendingReturns}건`]),
      "모두 확인",
    ],
    profileSettings: ["프로필 설정", "관리자 계정 정보를 확인하고 비밀번호를 변경합니다.", renderAdminProfileSettingsForm(), "저장"],
    saveOrder: ["노출 순서 저장", "베스트셀러와 추천 상품의 노출 순서를 저장합니다.", renderAdminChecklist(catalogProducts().slice(0, 5).map((product) => product.name)), "순서 저장"],
    saveSettings: ["설정 저장", "운영 설정과 권한 정보를 저장합니다.", renderAdminChecklist(["주문 알림", "재고 알림", "리뷰 승인 알림", "정산 리포트"]), "설정 저장"],
    addAccount: ["정산 계좌 추가", "정산용 계좌 정보를 등록합니다.", renderAdminFormFields([["은행", "text", businessProfile.settlementBank], ["계좌번호", "text", businessProfile.settlementAccount], ["예금주", "text", businessProfile.settlementHolder]]), "계좌 추가"],
    addCustomer: ["고객 등록", "회원가입 필수 양식 기준으로 고객을 등록합니다.", renderAdminCustomerRequiredForm(), "고객 등록"],
    addReview: ["리뷰 등록", "관리자가 리뷰 노출 상태를 관리합니다.", renderAdminReviewForm(), "리뷰 저장"],
    permissionDetail: ["권한 상세", "관리자 권한과 접근 가능 메뉴를 확인합니다.", renderAdminChecklist(["주문관리", "상품관리", "정산/통계", "설정/권한"]), "권한 저장"],
    posDetail: ["포스기 상세", "오프라인 판매 채널의 상태를 확인합니다.", renderAdminFormFields([["기기명", "text", "RB-POS-001"], ["상태", "select", "정상"], ["마지막 동기화", "text", "2026.06.04 10:32"]]), "동기화"],
    orderStatus: [
      "주문 상태 분포",
      "결제 완료, 배송 준비, 배송 완료 상태를 확인합니다.",
      renderAdminChecklist([
        `결제 완료 ${modalOrderSummary.paid}건`,
        `배송 준비 ${modalOrderSummary.preparing}건`,
        `배송 완료 ${modalOrderSummary.completed}건`,
        `취소/환불 ${modalOrderSummary.issue}건`,
      ]),
      "확인",
    ],
  };
  const config = configs[id] ?? ["관리자 작업", "선택한 관리자 작업을 처리합니다.", renderAdminFormFields([["메모", "textarea", "작업 내용을 입력하세요"]]), "저장"];
  return { title: config[0], eyebrow: config[1], body: config[2], primary: config[3] };
}

function renderAdminInquiryReplyForm(inquiryId) {
  const inquiry = adminInquiryPosts().find((post) => post.id === inquiryId) ?? adminFirstPendingInquiry();
  if (!inquiry) {
    return `<div class="admin-empty"><strong>답변할 문의가 없습니다.</strong><span>마이페이지에서 문의가 접수되면 이곳에 표시됩니다.</span></div>`;
  }
  const hasAnswer = Boolean(inquiry.answer?.trim());
  return `
    <form class="admin-inquiry-reply-form" data-admin-inquiry-reply-form data-inquiry-id="${escapeHtml(inquiry.id)}">
      <article class="admin-inquiry-source">
        <div>
          <span>${escapeHtml(inquiry.type)} · ${escapeHtml(inquiry.date)}</span>
          <strong>${escapeHtml(inquiry.title)}</strong>
        </div>
        <b class="${hasAnswer ? "is-answered" : ""}">${hasAnswer ? "답변 완료" : "답변 대기"}</b>
        ${inquiry.body ? `<p>${renderMultilineText(inquiry.body)}</p>` : "<p>문의 본문이 없습니다.</p>"}
      </article>
      <label>
        답변 내용
        <textarea name="answer" placeholder="고객에게 전달할 답변을 입력하세요.">${escapeHtml(
          inquiry.answer ||
            "안녕하세요, 리볼 로스트볼입니다.\n문의 주신 내용 확인했습니다.\n제품 상태와 출고 기준을 확인한 뒤 빠르게 안내드리겠습니다."
        )}</textarea>
      </label>
      <small class="admin-reply-helper">저장하면 고객 마이페이지의 문의내역 확인에 바로 답변 완료 상태로 표시됩니다.</small>
    </form>
  `;
}

function renderAdminProfileSettingsForm() {
  const profile = state.adminProfile;
  return `
    <div class="admin-modal-form admin-modal-form--profile">
      <label>아이디<input name="adminProfileId" value="${escapeHtml(profile.id)}" readonly /></label>
      <label>역할<input name="adminProfileRole" value="${escapeHtml(profile.role)}" readonly /></label>
      <label>알림 이메일<input name="adminProfileEmail" type="email" value="${escapeHtml(profile.email)}" autocomplete="email" /></label>
      <p class="admin-modal-helper">비밀번호를 변경하지 않을 경우 아래 3개 입력은 비워두면 됩니다.</p>
      <label>현재 비밀번호<input name="adminCurrentPassword" type="password" autocomplete="current-password" placeholder="현재 비밀번호" /></label>
      <label>새 비밀번호<input name="adminNextPassword" type="password" autocomplete="new-password" placeholder="새 비밀번호 8자 이상" /></label>
      <label>새 비밀번호 확인<input name="adminConfirmPassword" type="password" autocomplete="new-password" placeholder="새 비밀번호 확인" /></label>
    </div>
  `;
}

function currentEditingCoupon() {
  const couponId = state.adminModalContext?.rowKind === "coupon" ? state.adminModalContext.rowId : "";
  if (!couponId) return null;
  const coupons = Array.isArray(state.coupons) ? state.coupons : [];
  return coupons.find((coupon) => coupon.id === couponId) ?? null;
}

function currentAdminBanners() {
  const banners = Array.isArray(state.adminBanners) && state.adminBanners.length ? state.adminBanners : defaultAdminBanners();
  return [...banners].sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999) || String(a.id).localeCompare(String(b.id)));
}

function renderAdminCouponRegisterForm() {
  const editingCoupon = currentEditingCoupon();
  const fallbackAmount = Number(String(editingCoupon?.benefitAmount ?? editingCoupon?.benefit ?? "").replace(/[^\d]/g, ""));
  const benefitAmount = Number.isFinite(fallbackAmount) && fallbackAmount > 0 ? fallbackAmount : 3000;
  return `
    <div class="admin-modal-form admin-coupon-register-form" data-admin-coupon-form>
      ${editingCoupon ? `<label>쿠폰 코드<input name="couponId" value="${escapeHtml(editingCoupon.id)}" readonly /></label>` : ""}
      <label>쿠폰명<input name="couponTitle" value="${escapeHtml(editingCoupon?.title || "신규회원 3,000원")}" data-required-input data-label="쿠폰명" required /></label>
      <label>할인 금액<input name="couponAmount" inputmode="numeric" value="${escapeHtml(String(benefitAmount))}" data-required-input data-label="할인 금액" required /></label>
      <label>기간<input name="couponPeriod" value="${escapeHtml(editingCoupon?.period || "2026.06.04 - 2026.06.30")}" data-required-input data-label="기간" required /></label>
      <small class="admin-modal-helper">저장하면 쿠폰/배너관리 목록에 바로 반영됩니다.</small>
    </div>
  `;
}

function renderAdminBannerOrderForm() {
  const banners = currentAdminBanners();
  return `
    <div class="admin-modal-form admin-banner-order-form" data-admin-banner-order-form>
      <small class="admin-modal-helper">숫자가 작을수록 먼저 노출됩니다. 저장 시 1순위부터 다시 정렬됩니다.</small>
      ${banners
        .map(
          (banner) => `
            <div class="admin-banner-order-field">
              <label>${escapeHtml(banner.title)}<input name="bannerOrder:${escapeHtml(banner.id)}" inputmode="numeric" value="${escapeHtml(String(banner.order || ""))}" data-banner-id="${escapeHtml(banner.id)}" /></label>
              <small class="admin-modal-helper">${escapeHtml(`${banner.meta} · ${banner.placement}`)}</small>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderAdminFormFields(fields) {
  return `
    <div class="admin-modal-form">
      ${fields
        .map(([label, type, value]) => {
          if (type === "textarea") {
            return `<label>${escapeHtml(label)}<textarea>${escapeHtml(value)}</textarea></label>`;
          }
          if (type === "select") {
            return `<label>${escapeHtml(label)}<select><option>${escapeHtml(value)}</option><option>대기</option><option>완료</option></select></label>`;
          }
          return `<label>${escapeHtml(label)}<input value="${escapeHtml(value)}" /></label>`;
        })
        .join("")}
    </div>
  `;
}

function renderAdminProductRegisterForm() {
  return `
    <div class="admin-modal-form admin-product-register-form" data-admin-product-form>
      <label>상품명<input name="name" value="테일러메이드 TP5 로스트볼" data-required-input data-label="상품명" required /></label>
      <label>브랜드<input name="brandName" value="테일러메이드" data-required-input data-label="브랜드" required /></label>
      <label>라인/옵션<input name="line" value="TP5 / TP5X / TP5 Pix / 투어 리스폰스 / 혼합" data-required-input data-label="라인/옵션" required /></label>
      <label>기본 가격<input name="price" inputmode="numeric" value="11900" data-required-input data-label="기본 가격" required /></label>
      <label>재고<input name="stock" inputmode="numeric" value="46" data-required-input data-label="재고" required /></label>
    </div>
  `;
}

function renderAdminReviewForm() {
  return `
    <div class="admin-modal-form" data-admin-review-form>
      <label>상품<input name="productName" value="${escapeHtml(products[0].name)}" data-required-input data-label="상품" required /></label>
      <label>평점<select name="rating">${[5, 4, 3, 2, 1].map((rating) => `<option value="${rating}">${rating}점</option>`).join("")}</select></label>
      <label>내용<textarea name="body" data-required-input data-label="내용" required>상품 상태가 좋습니다.</textarea></label>
    </div>
  `;
}

function renderAdminCustomerRequiredForm() {
  return `
    <div class="admin-modal-form admin-customer-required-form" data-admin-customer-form>
      <div class="admin-required-field is-required">
        <label for="admin-customer-email">아이디</label>
        <input id="admin-customer-email" name="email" type="email" autocomplete="email" placeholder="이메일 아이디를 입력하세요" data-required-input data-label="아이디" required />
      </div>
      <div class="admin-required-field is-required">
        <label for="admin-customer-password">비밀번호</label>
        <input id="admin-customer-password" name="password" type="password" autocomplete="new-password" data-required-input data-label="비밀번호" required />
      </div>
      <div class="admin-required-field is-required">
        <label for="admin-customer-password-confirm">비밀번호 확인</label>
        <input id="admin-customer-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" data-required-input data-label="비밀번호 확인" required />
      </div>
      <div class="admin-required-field is-required">
        <label for="admin-customer-name">이름</label>
        <input id="admin-customer-name" name="name" autocomplete="name" data-required-input data-label="이름" required />
      </div>
      <div class="admin-required-field is-required">
        <label for="admin-customer-phone">휴대전화</label>
        <input id="admin-customer-phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="010 -    -    " data-required-input data-label="휴대전화" required />
      </div>
      <div class="admin-required-field is-required">
        <span class="admin-required-label">SMS 수신여부</span>
        <div class="admin-required-radio-row">
          <label><input type="radio" name="smsOptIn" value="yes" checked /> 수신함</label>
          <label><input type="radio" name="smsOptIn" value="no" /> 수신안함</label>
        </div>
      </div>
      <div class="admin-required-field is-required">
        <label for="admin-customer-contact-email">이메일</label>
        <input id="admin-customer-contact-email" name="contactEmail" type="email" autocomplete="email" data-required-input data-label="이메일" required />
      </div>
      <div class="admin-required-field is-required">
        <span class="admin-required-label">이메일 수신여부</span>
        <div class="admin-required-radio-row">
          <label><input type="radio" name="emailOptIn" value="yes" checked /> 수신함</label>
          <label><input type="radio" name="emailOptIn" value="no" /> 수신안함</label>
        </div>
      </div>
    </div>
  `;
}

function renderAdminChecklist(items) {
  return `
    <div class="admin-modal-checklist">
      ${items.map((item) => `<label><input type="checkbox" checked /> <span>${escapeHtml(item)}</span></label>`).join("")}
    </div>
  `;
}

function renderAdminOrderDetail() {
  const order = adminOrders()[0];
  if (!order) {
    return `<div class="admin-empty"><strong>주문 내역이 없습니다.</strong><span>새 주문이 접수되면 이곳에 상세 정보가 표시됩니다.</span></div>`;
  }
  return `
    <dl class="admin-modal-detail">
      <div><dt>주문번호</dt><dd>${escapeHtml(order.id)}</dd></div>
      <div><dt>고객명</dt><dd>${escapeHtml(order.customer)}</dd></div>
      <div><dt>상품</dt><dd>${escapeHtml(order.title)}</dd></div>
      <div><dt>금액</dt><dd>${escapeHtml(order.value)}</dd></div>
      <div><dt>상태</dt><dd>${escapeHtml(order.status)}</dd></div>
    </dl>
  `;
}

function renderAdminSearchResult() {
  const rows = filterAdminRows(adminRowsForTab(state.adminTab)).slice(0, 5);
  return `
    <div class="admin-search-results">
      ${
        rows.length
          ? rows
              .map(
                (row) => `
                  <button
                    type="button"
                    data-admin-modal="${escapeHtml(row.modal ?? adminDefaultModal(state.adminTab))}"
                    ${row.id ? `data-admin-row-id="${escapeHtml(row.id)}"` : ""}
                    ${row.rowKind ? `data-admin-row-kind="${escapeHtml(row.rowKind)}"` : ""}
                  ><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.meta)}</span></button>
                `
              )
              .join("")
          : "<p>검색 결과가 없습니다.</p>"
      }
    </div>
  `;
}

function saveAdminProfileSettings() {
  const modal = document.querySelector(".admin-modal-card");
  if (!modal) return;

  const email = String(modal.querySelector('[name="adminProfileEmail"]')?.value ?? "").trim();
  const currentPassword = String(modal.querySelector('[name="adminCurrentPassword"]')?.value ?? "");
  const nextPassword = String(modal.querySelector('[name="adminNextPassword"]')?.value ?? "");
  const confirmPassword = String(modal.querySelector('[name="adminConfirmPassword"]')?.value ?? "");

  if (!email) {
    showToast("알림 이메일을 입력하세요.");
    return;
  }

  const wantsPasswordChange = Boolean(currentPassword || nextPassword || confirmPassword);
  if (wantsPasswordChange) {
    if (currentPassword !== state.adminCredentials.password) {
      showToast("현재 비밀번호가 맞지 않습니다.");
      return;
    }
    if (nextPassword.length < 8) {
      showToast("새 비밀번호는 8자 이상으로 입력하세요.");
      return;
    }
    if (nextPassword !== confirmPassword) {
      showToast("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    state.adminCredentials = {
      ...state.adminCredentials,
      password: nextPassword,
    };
    save("reball.adminCredentials", state.adminCredentials);
  }

  state.adminProfile = {
    ...state.adminProfile,
    email,
  };
  state.adminUser = {
    ...(state.adminUser ?? {}),
    id: state.adminProfile.id,
    role: state.adminProfile.role,
    email,
  };
  save("reball.adminProfile", state.adminProfile);
  save("reball.adminUser", state.adminUser);
  state.adminModal = null;
  state.adminModalContext = null;
  renderAdmin();
  showToast(wantsPasswordChange ? "프로필과 비밀번호가 저장되었습니다." : "프로필이 저장되었습니다.");
}

function saveAdminCouponRegister() {
  const form = document.querySelector("[data-admin-coupon-form]");
  if (!form) return;

  const requiredInputs = Array.from(form.querySelectorAll("[data-required-input]"));
  const emptyInput = requiredInputs.find((input) => !String(input.value || "").trim());
  if (emptyInput) {
    emptyInput.focus();
    showToast(`${objectParticle(emptyInput.dataset.label || "필수 항목")} 입력하세요.`);
    return;
  }

  const amountInput = form.querySelector('[name="couponAmount"]');
  const amount = Number(String(amountInput?.value || "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    amountInput?.focus();
    showToast("할인 금액을 숫자로 입력하세요.");
    return;
  }

  const title = String(form.querySelector('[name="couponTitle"]')?.value || "").trim();
  const period = String(form.querySelector('[name="couponPeriod"]')?.value || "").trim();
  const editingCoupon = currentEditingCoupon();
  const nextCoupon = {
    ...(editingCoupon ?? {}),
    id: editingCoupon?.id || `CP-${Date.now().toString().slice(-6)}`,
    title,
    benefitAmount: amount,
    benefit: `${money.format(amount)}원 할인`,
    period,
    status: editingCoupon?.status || "사용 가능",
    useCount: Number(editingCoupon?.useCount) || 0,
  };

  const currentCoupons = Array.isArray(state.coupons) ? state.coupons : [];
  state.coupons = editingCoupon
    ? currentCoupons.map((coupon) => (coupon.id === editingCoupon.id ? nextCoupon : coupon))
    : [nextCoupon, ...currentCoupons];
  save("reball.coupons", state.coupons);
  state.adminTab = "coupon";
  state.adminSearch = "";
  state.adminModal = null;
  state.adminModalContext = null;
  renderAdmin();
  showToast(editingCoupon ? "쿠폰이 수정되었습니다." : "쿠폰이 등록되었습니다.");
}

function saveAdminBannerOrder() {
  const form = document.querySelector("[data-admin-banner-order-form]");
  if (!form) return;

  const inputs = Array.from(form.querySelectorAll("[data-banner-id]"));
  const invalidInput = inputs.find((input) => {
    const order = Number(String(input.value || "").replace(/[^\d]/g, ""));
    return !Number.isFinite(order) || order <= 0;
  });
  if (invalidInput) {
    invalidInput.focus();
    showToast("배너 순서를 숫자로 입력하세요.");
    return;
  }

  const orderMap = new Map(
    inputs.map((input) => [input.dataset.bannerId, Number(String(input.value || "").replace(/[^\d]/g, ""))])
  );
  state.adminBanners = currentAdminBanners()
    .map((banner) => ({
      ...banner,
      order: orderMap.has(banner.id) ? orderMap.get(banner.id) : Number(banner.order) || 999,
    }))
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999) || String(a.id).localeCompare(String(b.id)))
    .map((banner, index) => ({
      ...banner,
      order: index + 1,
    }));

  save("reball.adminBanners", state.adminBanners);
  state.adminTab = "coupon";
  state.adminSearch = "";
  state.adminModal = null;
  state.adminModalContext = null;
  renderAdmin();
  showToast("배너 노출 순서가 저장되었습니다.");
}

function adminStatsForTab(tab) {
  const orderRows = tab === "orders" ? filterAdminRows(adminOrders()) : adminOrders();
  const orderSummary = summarizeAdminOrders(orderRows);
  const productRows = catalogProducts();
  const stockLow = productRows.filter((product) => product.stock < 45).length;
  const newProductCount = state.adminProducts?.length || 0;
  const inquiryRows = adminInquiryPosts();
  const pendingInquiries = inquiryRows.filter((post) => !post.answer?.trim()).length;
  const returnRows = adminReturns();
  const couponUseTotal = state.coupons.reduce((sum, coupon) => sum + (Number(coupon.useCount) || 0), 0);
  const bannerCount = (state.adminBanners || []).length;
  const posRows = adminPosRows();
  const settlementRows = adminSettlementRows();
  const customerRows = adminCustomerRows();
  const reviewRows = adminReviewRows();
  const pendingReviews = reviewRows.filter((row) => row.status.includes("대기")).length;
  const reviewRatings = reviewRows.map((row) => Number(String(row.value).replace(/[^\d.]/g, ""))).filter((value) => Number.isFinite(value) && value > 0);
  const averageReview = reviewRatings.length ? (reviewRatings.reduce((sum, value) => sum + value, 0) / reviewRatings.length).toFixed(1) : "0.0";
  const settingsRows = adminSettingsRows();
  const stats = {
    dashboard: [
      ["오늘 주문", `${orderSummary.total}건`, "현재 주문", "cart"],
      ["결제 완료", `${orderSummary.paid}건`, "정상 처리", "cardPay"],
      ["출고 대기", `${orderSummary.preparing}건`, "출고 예정", "truck"],
      ["재고 경고", `${stockLow} SKU`, "안전 재고 확인", "shield", true],
    ],
    orders: [
      ["주문접수", `${orderSummary.total}건`, "현재 목록", "cart"],
      ["결제완료", `${orderSummary.paid}건`, "정상 처리", "cardPay"],
      ["배송준비중", `${orderSummary.preparing}건`, "출고 예정", "truck"],
      ["취소/반품요청", `${orderSummary.issue}건`, "검토 필요", "receipt", true],
    ],
    product: [
      ["전체 상품수", `${productRows.length}개`, `전체 SKU ${productRows.length}`, "box"],
      ["판매중", `${productRows.filter((product) => product.stock >= 45).length}개`, "노출 상품", "check"],
      ["재고부족", `${stockLow}개`, "안전 재고 미만", "shield", true],
      ["신규등록", `${newProductCount}건`, "관리자 등록", "star"],
    ],
    returns: [
      ["반품 접수", `${returnRows.length}건`, "현재 목록", "truck"],
      ["승인 대기", `${returnRows.filter((row) => row.status.includes("대기")).length}건`, "처리 필요", "receipt", returnRows.some((row) => row.status.includes("대기"))],
      ["교환 진행", `${returnRows.filter((row) => row.status.includes("교환")).length}건`, "출고 예정", "box"],
      ["완료", `${returnRows.filter((row) => row.status.includes("완료")).length}건`, "현재 목록", "check"],
    ],
    inquiry: [
      ["전체 문의", `${inquiryRows.length}건`, "고객 접수", "bell"],
      ["답변 대기", `${pendingInquiries}건`, "처리 필요", "receipt", pendingInquiries > 0],
      ["답변 완료", `${inquiryRows.length - pendingInquiries}건`, "누적 처리", "check"],
      ["오늘 접수", `${inquiryRows.filter((post) => post.date === todayIso()).length}건`, "신규 문의", "star"],
    ],
    coupon: [
      ["쿠폰 종류", `${state.coupons.length}개`, "등록 쿠폰", "coupon"],
      ["사용 완료", `${couponUseTotal}건`, "현재 누적", "check"],
      ["만료 예정", "0개", "7일 이내", "receipt"],
      ["배너 노출", `${bannerCount}개`, "홈 캐러셀", "star"],
    ],
    pos: [
      ["포스기", `${posRows.length}대`, "등록 기기", "receipt"],
      ["현장 주문", "0건", "오늘", "cart"],
      ["원격점검", "0건", "확인 필요", "shield"],
      ["매장 매출", "₩0", "오늘", "cardPay"],
    ],
    settlement: [
      ["총 매출", "₩0", "최근 7일", "cardPay"],
      ["정산 예정", "₩0", "익일", "receipt"],
      ["배송비", "₩0", "이번 달", "truck"],
      ["미확인 입금", `${settlementRows.filter((row) => row.status.includes("확인")).length}건`, "확인 필요", "shield"],
    ],
    customer: [
      ["회원", adminCustomerCountValue(customerRows), adminCustomerCountDelta(), "user", Boolean(state.adminMembersError)],
      ["신규 고객", adminCustomerNewCountValue(customerRows), "이번 주", "star"],
      ["문의", `${pendingInquiries}건`, "답변 대기", "receipt", pendingInquiries > 0],
      ["재구매율", "0%", "최근 30일", "check"],
    ],
    review: [
      ["리뷰", `${reviewRows.length}건`, "전체", "star"],
      ["승인 대기", `${pendingReviews}건`, "검토 필요", "receipt", pendingReviews > 0],
      ["평균 평점", averageReview, "최근 30일", "check"],
      ["포토 리뷰", "0건", "노출중", "box"],
    ],
    settings: [
      ["관리자", `${state.adminProfile?.id ? 1 : 0}명`, "활성 계정", "user"],
      ["권한 그룹", `${settingsRows.length}개`, "운영 기준", "shield"],
      ["알림 채널", `${Object.keys(defaultNotifications).length}개`, "주문/재고", "receipt"],
      ["점검 필요", "0건", "사업자 정보", "shield"],
    ],
  };
  return (stats[tab] ?? stats.dashboard).map(([label, value, delta, icon, warning]) => ({ label, value, delta, icon, warning }));
}

function adminCustomerCountValue(rows = adminCustomerRows()) {
  if (state.adminMembersLoading || !state.adminMembersLoaded) return "확인중";
  if (state.adminMembersError) return "권한 필요";
  return `${rows.length}명`;
}

function adminCustomerNewCountValue(rows = adminCustomerRows()) {
  if (state.adminMembersLoading || !state.adminMembersLoaded) return "확인중";
  if (state.adminMembersError) return "권한 필요";
  return `${rows.filter((row) => row.subValue.includes("신규")).length}명`;
}

function adminCustomerCountDelta() {
  if (state.adminMembersLoading || !state.adminMembersLoaded) return "Supabase 조회";
  if (state.adminMembersError) return "관리자 권한 확인";
  return "활성 고객";
}

function adminRowsForTab(tab) {
  const rows = {
    dashboard: adminOrders().slice(0, 6),
    orders: adminOrders(),
    product: catalogProducts().map((product, index) => ({
      id: `SKU-${String(index + 1).padStart(3, "0")}`,
      image: product.image,
      title: product.name,
      meta: `${product.brandName} / ${product.line}`,
      status: product.stock < 45 ? "재고부족" : "판매중",
      tone: product.stock < 45 ? "warning" : "ok",
      value: `₩${money.format(product.price)}`,
      subValue: `현재 재고 ${product.stock}`,
      action: "수정",
      modal: "productRegister",
    })),
    returns: adminReturns(),
    inquiry: adminInquiryRows(),
    coupon: adminCoupons(),
    pos: adminPosRows(),
    settlement: adminSettlementRows(),
    customer: adminCustomerRows(),
    review: adminReviewRows(),
    settings: adminSettingsRows(),
  };
  return rows[tab] ?? rows.dashboard;
}

function adminOrders() {
  const saved = state.orders.map((order, index) => {
    const firstItem = order.items?.[0];
    return {
      id: order.id,
      image: firstItem?.image,
      title: firstItem?.name ?? `주문 ${index + 1}`,
      customer: order.customer?.name ?? "고객",
      meta: `${order.customer?.name ?? "고객"} / ${order.customer?.payment ?? "결제"} / ${order.date}`,
      status: order.delivery ?? order.status ?? "상품준비중",
      tone: "ok",
      value: `₩${money.format(order.total ?? 0)}`,
      subValue: `${order.items?.length ?? 1}개 품목`,
      action: "상세보기",
      modal: "orderDetail",
    };
  });
  if (saved.length) return saved;
  return [];
}

function adminReturns() {
  return state.posts
    .filter((post) => String(post.type ?? "").includes("반품") || String(post.type ?? "").includes("교환") || String(post.title ?? "").includes("반품") || String(post.title ?? "").includes("교환"))
    .map((post) => ({
      id: post.orderId ? `RT-${post.orderId}` : post.id,
      mark: "R",
      title: post.title,
      meta: `${post.type} / ${post.date}`,
      status: post.status || "접수 완료",
      tone: post.answer?.trim() ? "ok" : "warning",
      value: post.answer?.trim() ? "처리 완료" : "처리 대기",
      subValue: post.body || "접수 내용",
      action: "상세",
      modal: "returnRequest",
    }));
}

function adminInquiryPosts() {
  return state.posts.filter((post) => post.type.includes("문의") || post.type.includes("반품") || post.type.includes("배송"));
}

function adminFirstPendingInquiry() {
  return adminInquiryPosts().find((post) => !post.answer?.trim()) ?? adminInquiryPosts()[0];
}

function adminInquiryRows() {
  return adminInquiryPosts().map((post) => {
    const hasAnswer = Boolean(post.answer?.trim());
    return {
      id: post.id,
      mark: "Q",
      title: post.title,
      meta: `${post.type} / ${post.date}${post.body ? ` / ${post.body}` : ""}`,
      status: hasAnswer ? "답변완료" : "답변대기",
      tone: hasAnswer ? "ok" : "warning",
      value: hasAnswer ? post.answeredAt || post.date : "답변 필요",
      subValue: hasAnswer ? "처리 완료" : "고객 대기",
      action: hasAnswer ? "답변수정" : "답변하기",
      modal: `inquiryReply:${post.id}`,
    };
  });
}

function adminInquiryChartValues() {
  const rows = adminInquiryPosts();
  if (!rows.length) return [0, 0, 0];
  const answered = rows.filter((post) => post.answer?.trim()).length;
  const pending = rows.length - answered;
  const today = rows.filter((post) => post.date === todayIso()).length;
  return [answered, pending, today].map((value) => Math.max(8, Math.round((value / rows.length) * 100)));
}

function adminCoupons() {
  const couponRows = state.coupons.map((coupon) => ({
    id: coupon.id,
    mark: "C",
    title: coupon.title,
    meta: coupon.benefit,
    status: coupon.status,
    tone: "ok",
    value: `${Number(coupon.useCount) || 0}회`,
    subValue: "사용",
    action: "수정",
    modal: "couponRegister",
    rowKind: "coupon",
  }));
  return [
    ...couponRows,
    ...currentAdminBanners().map((banner) => ({
      id: banner.id,
      mark: "B",
      title: banner.title,
      meta: banner.meta,
      status: banner.status,
      tone: "ok",
      value: `${banner.order}순위`,
      subValue: banner.placement,
      action: "정렬",
      modal: "saveOrder",
      rowKind: "banner",
    })),
  ];
}

function adminPosRows() {
  return [];
}

function adminSettlementRows() {
  return [];
}

function adminCustomerRows() {
  const remoteMembers = (state.adminMembers || []).map((member, index) => {
    const joinedAt = member.createdAt || member.created_at || "";
    const joinedDate = joinedAt ? formatDateLabel(joinedAt) : "";
    const isNew = joinedAt ? Date.now() - new Date(joinedAt).getTime() < 7 * 24 * 60 * 60 * 1000 : false;
    return {
      id: member.id ? `MB-${String(member.id).slice(0, 8)}` : `MB-${index + 1}`,
      mark: (member.name || member.loginId || member.email || "회").slice(0, 1),
      title: member.name || member.loginId || member.email || "회원",
      meta: `${member.loginId || member.authEmail || member.email || "아이디 미입력"} / ${member.phone || "연락처 미입력"}`,
      status: member.status || "정상",
      tone: "ok",
      value: `₩${money.format(Number(member.totalKrw) || 0)}`,
      subValue: `${isNew ? "신규 가입" : "가입"}${joinedDate ? ` ${joinedDate}` : ""}`,
      action: "상세",
      modal: "addCustomer",
      sourceId: member.id || "",
    };
  });

  const remoteKeys = new Set(remoteMembers.map((member) => member.sourceId).filter(Boolean));
  const registered = (state.adminCustomers || []).map((customer, index) => ({
    id: customer.id || `CU-NEW-${index + 1}`,
    mark: (customer.name || "고").slice(0, 1),
    title: customer.name || "신규 고객",
    meta: `${customer.loginId || customer.email || "아이디 미입력"} / ${customer.phone || "연락처 미입력"}`,
    status: customer.status || "정상",
    tone: "ok",
    value: customer.value || "₩0",
    subValue: customer.subValue || "신규 등록",
    action: "상세",
    modal: "addCustomer",
  }));
  return [...remoteMembers, ...registered.filter((customer) => !remoteKeys.has(customer.sourceId))];
}

function adminReviewRows() {
  const reviewPosts = reviewPostsForAdmin();
  return reviewPosts.map((post, index) => ({
    id: post.id,
    mark: "R",
    title: post.title,
    meta: `${post.productName ?? products[index % products.length].name} / 평점 ${post.rating ?? (index === 1 ? "4" : "5")}`,
    status: post.status,
    tone: post.status.includes("대기") ? "warning" : "ok",
    value: `${post.rating ?? 5 - (index === 1 ? 1 : 0)}점`,
    subValue: "리뷰",
    action: "상세",
    modal: "addReview",
  }));
}

function reviewPostsForAdmin() {
  return state.posts.filter((post) => String(post.type ?? "").includes("후기") || String(post.type ?? "").includes("리뷰") || post.source === "admin");
}

function adminSettingsRows() {
  return ["최고 관리자", "상품 매니저", "주문 담당자", "정산 담당자", "리뷰 담당자"].map((title, index) => ({
    id: `ROLE-${index + 1}`,
    mark: "A",
    title,
    meta: `${["전체 권한", "상품/재고", "주문/배송", "정산/통계", "리뷰/고객"][index]} 접근`,
    status: index === 0 ? "필수" : "활성",
    tone: "ok",
    value: index === 0 ? "admin" : `staff${index}`,
    subValue: "계정",
    action: "권한",
    modal: "permissionDetail",
  }));
}

function filterAdminRows(rows) {
  const query = state.adminSearch.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => [row.id, row.title, row.meta, row.status, row.value, row.subValue, row.customer].filter(Boolean).join(" ").toLowerCase().includes(query));
}

function summarizeAdminOrders(rows) {
  return rows.reduce(
    (summary, row) => {
      const status = row.status || "";
      const isIssue = /취소|반품|교환|환불|요청/.test(status);
      const isPreparing = /배송준비|상품준비|출고 예정|준비중/.test(status);
      const isCompleted = !isIssue && !isPreparing;
      const isPaid = !isIssue && (/결제완료|배송|출고|완료/.test(status) || Boolean(row.value));
      summary.total += 1;
      if (isPaid) summary.paid += 1;
      if (isPreparing) summary.preparing += 1;
      if (isIssue) summary.issue += 1;
      if (isCompleted) summary.completed += 1;
      return summary;
    },
    { total: 0, paid: 0, preparing: 0, issue: 0, completed: 0 }
  );
}

function downloadAdminExport() {
  const rows = filterAdminRows(adminRowsForTab(state.adminTab));
  const headers = ["ID", "목록", "고객", "상세", "상태", "수치", "비고"];
  const tableRows = rows.map((row) => [row.id, row.title, row.customer ?? "", row.meta, row.status, row.value, row.subValue ?? ""]);
  const table = [headers, ...tableRows]
    .map((cells, rowIndex) => `<tr>${cells.map((cell) => `<${rowIndex ? "td" : "th"}>${escapeHtml(cell ?? "")}</${rowIndex ? "td" : "th"}>`).join("")}</tr>`)
    .join("");
  const html = `\uFEFF<html><head><meta charset="UTF-8" /></head><body><table>${table}</table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const fileName = `reball-${fileSafeAdminName(adminTabLabel(state.adminTab))}-${todayIso()}.xls`;
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast(`${fileName} 다운로드를 시작했습니다.`);
}

function fileSafeAdminName(value) {
  return String(value)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function adminActionsForTab(tab) {
  const actions = {
    dashboard: [{ label: "빠른 작업", modal: "quickAction", icon: "bolt", primary: true }],
    orders: [
      { label: "엑셀 다운로드", modal: "downloadExport", icon: "receipt" },
      { label: "컬럼 설정", modal: "columnSettings", icon: "menu" },
    ],
    product: [
      { label: "상품 등록", modal: "productRegister", icon: "box", primary: true },
      { label: "순서 저장", modal: "saveOrder", icon: "check" },
    ],
    returns: [{ label: "새 요청", modal: "returnRequest", icon: "truck", primary: true }],
    inquiry: [{ label: "대기 문의 답변", modal: `inquiryReply:${adminFirstPendingInquiry()?.id ?? ""}`, icon: "bell", primary: true }],
    coupon: [{ label: "쿠폰 등록", modal: "couponRegister", icon: "coupon", primary: true }],
    pos: [
      { label: "엑셀 다운로드", modal: "downloadExport", icon: "receipt", primary: true },
      { label: "정렬 저장", modal: "saveOrder", icon: "check" },
    ],
    settlement: [
      { label: "내보내기", modal: "downloadExport", icon: "receipt", primary: true },
      { label: "계좌 추가", modal: "addAccount", icon: "cardPay" },
    ],
    customer: [{ label: "고객 등록", modal: "addCustomer", icon: "user", primary: true }],
    review: [{ label: "리뷰 등록", modal: "addReview", icon: "star", primary: true }],
    settings: [{ label: "설정 저장", modal: "saveSettings", icon: "shield", primary: true }],
  };
  return actions[tab] ?? actions.dashboard;
}

function adminQuickItems(tab) {
  const actionItems = adminActionsForTab(tab).map((action) => ({
    title: action.label,
    body: `${adminTabLabel(tab)} 작업`,
    icon: action.icon,
    modal: action.modal,
  }));
  return actionItems.concat([
    { title: "알림 확인", body: "주문/재고/반품 알림", icon: "bell", modal: "notifications" },
    { title: "검색 결과", body: state.adminSearch || "현재 목록에서 검색", icon: "search", modal: "searchResult" },
  ]);
}

function adminChartValues(tab) {
  if (tab === "dashboard") return adminOrderChartValues();
  if (tab === "orders") return adminOrderChartValues();
  if (tab === "inquiry") return adminInquiryChartValues();
  const productRows = catalogProducts();
  const returnRows = adminReturns();
  const customerRows = adminCustomerRows();
  const reviewRows = adminReviewRows();
  const settingsRows = adminSettingsRows();
  const values = {
    product: [
      productRows.filter((product) => product.stock >= 45).length,
      productRows.filter((product) => product.stock < 45).length,
      state.adminProducts?.length || 0,
    ],
    returns: [returnRows.filter((row) => row.status.includes("완료")).length, returnRows.filter((row) => row.status.includes("대기")).length, returnRows.length],
    coupon: [state.coupons.length, state.coupons.reduce((sum, coupon) => sum + (Number(coupon.useCount) || 0), 0), (state.adminBanners || []).length],
    pos: [adminPosRows().length, 0, 0],
    settlement: [0, 0, 0],
    customer:
      state.adminMembersLoading || !state.adminMembersLoaded || state.adminMembersError
        ? [0, 0, 0]
        : [customerRows.length, customerRows.filter((row) => row.subValue.includes("신규")).length, adminInquiryPosts().filter((post) => !post.answer?.trim()).length],
    review: [reviewRows.length, reviewRows.filter((row) => row.status.includes("대기")).length, 0],
    settings: [state.adminProfile?.id ? 1 : 0, settingsRows.length, Object.keys(defaultNotifications).length],
  }[tab];
  return adminChartPercentages(values || [0, 0, 0]);
}

function adminOrderChartValues() {
  const summary = summarizeAdminOrders(filterAdminRows(adminOrders()));
  if (!summary.total) return [0, 0, 0];
  return [summary.completed, summary.preparing, summary.issue].map((value) => Math.round((value / summary.total) * 100));
}

function adminChartPercentages(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return [0, 0, 0];
  return values.map((value) => Math.round((value / total) * 100));
}

function adminChartLabels(tab) {
  if (tab === "inquiry") return ["완료", "대기", "오늘"];
  const labels = {
    product: ["판매중", "부족", "신규"],
    returns: ["완료", "대기", "전체"],
    coupon: ["쿠폰", "사용", "배너"],
    pos: ["기기", "주문", "점검"],
    settlement: ["매출", "정산", "환불"],
    customer: ["회원", "신규", "문의"],
    review: ["리뷰", "대기", "포토"],
    settings: ["관리자", "권한", "알림"],
  };
  return labels[tab] ?? ["완료", "대기", "주의"];
}

function adminTabLabel(tab) {
  return {
    dashboard: "관리자 대시보드",
    orders: "주문관리",
    product: "상품관리 / 재고관리",
    returns: "취소/반품/교환관리",
    inquiry: "문의답변",
    coupon: "쿠폰/배너관리",
    pos: "포스기 관리",
    settlement: "정산/통계",
    customer: "고객/회원관리",
    review: "리뷰관리",
    settings: "설정/권한",
  }[tab] ?? "관리자 대시보드";
}

function adminTabEyebrow(tab) {
  return {
    dashboard: "REBALL LOSTBALL 운영 현황",
    orders: "주문/배송",
    product: "상품/재고",
    returns: "CS 처리",
    inquiry: "고객 문의",
    coupon: "프로모션",
    pos: "매장 운영",
    settlement: "정산/분석",
    customer: "고객 데이터",
    review: "콘텐츠 관리",
    settings: "환경 설정",
  }[tab] ?? "관리자";
}

function adminTabDescription(tab) {
  return {
    dashboard: "오늘 주문, 결제, 재고, 문의 흐름을 한 화면에서 확인하세요.",
    orders: "주문번호, 고객명, 상품명 기준으로 주문과 배송 상태를 관리할 수 있습니다.",
    product: "상품 이미지 원본은 유지하고, 재고와 노출 순서만 관리합니다.",
    returns: "교환/반품 요청을 접수하고 승인 상태를 갱신합니다.",
    inquiry: "고객이 남긴 1:1 문의를 확인하고 답변을 등록합니다.",
    coupon: "쿠폰과 홈 배너 노출 상태를 관리합니다.",
    pos: "오프라인 포스기 상태와 현장 주문을 확인합니다.",
    settlement: "매출, 정산 예정금, 배송비, 환불 예정 금액을 확인합니다.",
    customer: "회원 구매 이력과 문의 대기 상태를 확인합니다.",
    review: "리뷰 승인, 노출, 평점 상태를 관리합니다.",
    settings: "관리자 권한, 알림, 사업자 정보를 관리합니다.",
  }[tab] ?? "관리자 화면입니다.";
}

function adminTableTitle(tab) {
  return tab === "dashboard" ? "최근 주문" : adminTabLabel(tab);
}

function adminChartTitle(tab) {
  return tab === "dashboard" ? "주문 상태 분포" : `${adminTabLabel(tab)} 요약`;
}

function adminChartCenter(tab) {
  if (tab === "dashboard") return `${adminOrders().length}건`;
  if (tab === "orders") return `${filterAdminRows(adminOrders()).length}건`;
  if (tab === "inquiry") return `${adminInquiryPosts().length}건`;
  if (tab === "product") return `${catalogProducts().length}개`;
  if (tab === "returns") return `${adminReturns().length}건`;
  if (tab === "coupon") return `${state.coupons.length}개`;
  if (tab === "pos") return `${adminPosRows().length}대`;
  if (tab === "settlement") return "₩0";
  if (tab === "customer") return adminCustomerCountValue();
  if (tab === "review") return `${adminReviewRows().length}건`;
  if (tab === "settings") return `${adminSettingsRows().length}개`;
  return "0";
}

function adminFirstColumn(tab) {
  return tab === "product" ? "상품" : tab === "customer" ? "고객" : tab === "settings" ? "권한" : tab === "inquiry" ? "문의" : "목록";
}

function adminDefaultModal(tab) {
  return {
    orders: "orderDetail",
    product: "productRegister",
    returns: "returnRequest",
    inquiry: "inquiryReply",
    coupon: "couponRegister",
    pos: "posDetail",
    settlement: "downloadExport",
    customer: "addCustomer",
    review: "addReview",
    settings: "permissionDetail",
  }[tab] ?? "quickAction";
}

function renderAdminIcon(name) {
  if (name === "bell") {
    return '<span class="admin-svg-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10a5 5 0 0 1 10 0v4l2 3H5l2-3v-4Z"/><path d="M10 20h4"/></svg></span>';
  }
  return `<span class="admin-svg-icon">${icons[name] ?? icons.menu}</span>`;
}

function renderInlineSvg(name) {
  return icons[name] ?? "";
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

function handleAdminCustomerRegister() {
  const form = document.querySelector("[data-admin-customer-form]");
  if (!form) return true;

  const requiredInputs = Array.from(form.querySelectorAll("[data-required-input]"));
  const emptyInput = requiredInputs.find((input) => !String(input.value || "").trim());
  if (emptyInput) {
    emptyInput.focus();
    showToast(`${objectParticle(emptyInput.dataset.label || "필수 항목")} 입력하세요.`);
    return false;
  }

  const invalidEmail = requiredInputs.find((input) => input.type === "email" && !input.checkValidity());
  if (invalidEmail) {
    invalidEmail.focus();
    showToast(`${invalidEmail.dataset.label || "이메일"} 형식을 확인하세요.`);
    return false;
  }

  const password = form.querySelector('[name="password"]');
  const passwordConfirm = form.querySelector('[name="passwordConfirm"]');
  if (password && passwordConfirm && password.value !== passwordConfirm.value) {
    passwordConfirm.focus();
    showToast("비밀번호 확인이 일치하지 않습니다.");
    return false;
  }

  const formData = new FormData(form);
  const registered = Array.isArray(state.adminCustomers) ? state.adminCustomers : [];
  const loginId = String(formData.get("email") || "").trim();
  const contactEmail = String(formData.get("contactEmail") || loginId).trim();
  const phone = String(formData.get("phone") || "").trim();
  const now = todayIso();
  state.adminCustomers = [
    {
      id: `CU-${Date.now().toString().slice(-6)}`,
      name: String(formData.get("name") || "").trim(),
      loginId,
      email: contactEmail,
      contactEmail,
      phone,
      smsOptIn: String(formData.get("smsOptIn") || "yes"),
      emailOptIn: String(formData.get("emailOptIn") || "yes"),
      status: "정상",
      value: "₩0",
      subValue: "신규 등록",
      createdAt: now,
    },
    ...registered,
  ].slice(0, 50);
  save("reball.adminCustomers", state.adminCustomers);
  state.adminTab = "customer";
  state.adminSearch = "";
  return true;
}

function handleAdminProductRegister() {
  const form = document.querySelector("[data-admin-product-form]");
  if (!form) return true;

  const requiredInputs = Array.from(form.querySelectorAll("[data-required-input]"));
  const emptyInput = requiredInputs.find((input) => !String(input.value || "").trim());
  if (emptyInput) {
    emptyInput.focus();
    showToast(`${objectParticle(emptyInput.dataset.label || "필수 항목")} 입력하세요.`);
    return false;
  }

  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const brandName = String(formData.get("brandName") || "").trim();
  const line = String(formData.get("line") || "").trim();
  const price = Number(String(formData.get("price") || "").replace(/[^\d]/g, ""));
  const stock = Number(String(formData.get("stock") || "").replace(/[^\d]/g, ""));

  if (!Number.isFinite(price) || price <= 0) {
    form.querySelector('[name="price"]')?.focus();
    showToast("기본 가격을 숫자로 입력하세요.");
    return false;
  }
  if (!Number.isFinite(stock) || stock < 0) {
    form.querySelector('[name="stock"]')?.focus();
    showToast("재고를 숫자로 입력하세요.");
    return false;
  }

  const brandSlug = adminBrandSlugFromName(brandName);
  const template = products.find((product) => product.brandSlug === brandSlug) ?? products[0];
  const slug = uniqueAdminProductSlug(`${brandName}-${name}`);
  const registered = Array.isArray(state.adminProducts) ? state.adminProducts : [];

  state.adminProducts = [
    {
      brandSlug,
      brandName,
      slug,
      name,
      line,
      copy: `${line} 기준으로 등록한 관리자 상품입니다.`,
      price,
      colors: template.colors || ["화이트"],
      models: line.split("/").map((item) => item.trim()).filter(Boolean).slice(0, 8),
      image: template.image,
      detailImage: template.detailImage,
      accent: template.accent || "#113A2A",
      stock,
      adminRegistered: true,
      createdAt: todayIso(),
    },
    ...registered,
  ].slice(0, 100);
  save("reball.adminProducts", state.adminProducts);
  return true;
}

function adminBrandSlugFromName(value) {
  const normalized = String(value || "").toLowerCase().replace(/\s+/g, "");
  const matched = brandMenu.find(([slug, label]) => normalized.includes(label.toLowerCase().replace(/\s+/g, "")) || normalized.includes(slug));
  return matched?.[0] || "mix";
}

function uniqueAdminProductSlug(value) {
  const base = String(value || "admin-product")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "") || "admin-product";
  const existing = new Set(catalogProducts().map((product) => product.slug));
  let candidate = `${base}-admin`;
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-admin-${index}`;
    index += 1;
  }
  return candidate;
}

function objectParticle(value) {
  const word = String(value || "");
  const lastCode = word.charCodeAt(word.length - 1);
  const hasFinalConsonant = lastCode >= 0xac00 && lastCode <= 0xd7a3 ? (lastCode - 0xac00) % 28 !== 0 : true;
  return `${word}${hasFinalConsonant ? "을" : "를"}`;
}

function saveAdminInquiryReply() {
  const form = document.querySelector("[data-admin-inquiry-reply-form]");
  if (!form) {
    state.adminModal = null;
    renderAdmin();
    return;
  }

  const inquiryId = form.dataset.inquiryId;
  const answer = String(new FormData(form).get("answer") || "").trim();
  if (!answer) {
    showToast("답변 내용을 입력하세요.");
    return;
  }

  state.posts = state.posts.map((post) =>
    post.id === inquiryId
      ? {
          ...post,
          status: "답변 완료",
          answer,
          answeredAt: new Date().toLocaleString("ko-KR"),
        }
      : post
  );
  save("reball.posts", state.posts);
  state.adminModal = null;
  renderAdmin();
  showToast("문의 답변이 저장되었습니다.");
}

function saveAdminReview() {
  const form = document.querySelector("[data-admin-review-form]");
  if (!form) {
    state.adminModal = null;
    renderAdmin();
    return;
  }

  const productName = String(form.querySelector('[name="productName"]')?.value || "").trim();
  const rating = Number(form.querySelector('[name="rating"]')?.value || 5);
  const body = String(form.querySelector('[name="body"]')?.value || "").trim();

  if (!productName) {
    showToast("상품명을 입력하세요.");
    return;
  }
  if (!body) {
    showToast("리뷰 내용을 입력하세요.");
    return;
  }

  state.posts.unshift({
    id: `POST-${Date.now()}`,
    type: "후기",
    title: `${productName} 후기`,
    date: todayIso(),
    status: "게시 완료",
    body,
    rating,
    productName,
    source: "admin",
  });
  save("reball.posts", state.posts);
  state.adminModal = null;
  renderAdmin();
  showToast("리뷰가 저장되었습니다.");
}

function bindGlobalEvents() {
  document.querySelectorAll("[data-route]").forEach((node) => {
    node.addEventListener("click", () => routeTo(node.dataset.route));
  });
  document.querySelectorAll("[data-scroll-to]").forEach((node) => {
    node.addEventListener("click", () => {
      state.pendingScrollTarget = node.dataset.scrollTo;
      if (parseRoute() === "/") {
        window.requestAnimationFrame(flushPendingScroll);
        return;
      }
      routeTo("/");
    });
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
  document.querySelectorAll("[data-add-card]").forEach((node) => node.addEventListener("click", () => addToCart(node.dataset.addCard, 1, { promptCart: true })));
  document.querySelectorAll("[data-add-bundle]").forEach((node) => node.addEventListener("click", () => addBundleToCart(node.dataset.addBundle, 1, { promptCart: true })));
  document.querySelectorAll("[data-add-detail]").forEach((node) => node.addEventListener("click", () => addToCart(node.dataset.addDetail)));
  document.querySelectorAll("[data-wish-card]").forEach((node) => node.addEventListener("click", () => toggleWishlist(node.dataset.wishCard)));
  document.querySelectorAll("[data-cart-confirm]").forEach((node) => {
    node.addEventListener("click", () => {
      state.cartPromptOpen = false;
      routeTo("/cart");
    });
  });
  document.querySelectorAll("[data-cart-continue]").forEach((node) => {
    node.addEventListener("click", () => {
      state.cartPromptOpen = false;
      renderRoute();
    });
  });
  document.querySelector("[data-auth-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleAuthFormSubmit(event.currentTarget);
  });
  document.querySelectorAll("[data-toggle-password]").forEach((node) => {
    node.addEventListener("click", () => {
      const wrap = node.closest(".password-input-wrap");
      const input = wrap?.querySelector("input");
      if (!input) return;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      node.setAttribute("aria-pressed", visible ? "false" : "true");
      node.setAttribute("aria-label", visible ? "비밀번호 보기" : "비밀번호 숨기기");
      node.innerHTML = visible ? icons.eye : icons.eyeOff;
    });
  });
  document.querySelector("[data-guest-order-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const orderId = String(formData.get("orderId") || "").replace(/\s+/g, "");
    const matchedOrder = findOrderById(orderId);
    if (matchedOrder) {
      routeTo(`/order/${matchedOrder.id}`);
      return;
    }
    showToast("주문 정보를 찾을 수 없습니다.");
  });
  document.querySelectorAll("[data-auth-assist]").forEach((node) => {
    node.addEventListener("click", () => {
      const label = node.dataset.authAssist === "password" ? "비밀번호 찾기" : "아이디 찾기";
      showToast(`${label} 화면은 준비 중입니다.`);
    });
  });
  document.querySelectorAll("[data-social-signup]").forEach((node) => {
    node.addEventListener("click", () => {
      const provider = node.dataset.socialSignup;
      const providerName = provider === "naver" ? "네이버" : "카카오";
      showToast(`${providerName} 로그인은 다음 단계에서 연결합니다. 현재는 이메일 회원가입/로그인을 사용해 주세요.`);
    });
  });
  document.querySelectorAll("[data-logout]").forEach((node) => {
    node.addEventListener("click", async () => {
      await handleLogout("/");
    });
  });
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
  document.querySelectorAll("[data-qty-key]").forEach((node) => {
    node.addEventListener("click", () => {
      const key = node.dataset.qtyKey;
      const delta = Number(node.dataset.qtyDelta);
      const item = state.cart.find((entry) => entry.key === key);
      if (item) item.quantity = Math.max(1, item.quantity + delta);
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
      if (state.myTab !== "review-write") state.selectedReviewOrderId = "";
      renderMypage();
    });
  });
  document.querySelector("[data-order-search-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("query") || "").trim();
    showToast(query ? `"${query}" 주문 검색을 확인했습니다.` : "주문 검색어를 입력하세요.");
  });
  document.querySelectorAll("[data-order-period]").forEach((node) => {
    node.addEventListener("click", () => showToast(`${node.dataset.orderPeriod} 주문 내역을 확인했습니다.`));
  });
  document.querySelector("[data-profile-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleProfileSave(event.currentTarget);
  });
  document.querySelector("[data-profile-cancel]")?.addEventListener("click", () => {
    state.myTab = "orders";
    renderMypage();
  });
  document.querySelector("[data-coupon-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "").trim().toUpperCase();
    if (!code) {
      showToast("쿠폰 코드를 입력하세요.");
      return;
    }
    if (state.coupons.some((coupon) => coupon.id === code)) {
      showToast("이미 등록된 쿠폰입니다.");
      return;
    }
    state.coupons.unshift({ id: code, title: "쿠폰 코드 등록", benefit: "5,000원 할인", status: "사용 가능" });
    save("reball.coupons", state.coupons);
    showToast("쿠폰이 등록되었습니다.");
    renderMypage();
  });
  document.querySelector("[data-post-search-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.postSearch = String(new FormData(event.currentTarget).get("query") || "");
    renderMypage();
  });
  document.querySelectorAll("[data-post-delete]").forEach((node) => {
    node.addEventListener("click", () => {
      state.posts = state.posts.filter((post) => post.id !== node.dataset.postDelete);
      if (state.expandedInquiryId === node.dataset.postDelete) state.expandedInquiryId = null;
      save("reball.posts", state.posts);
      showToast("게시물을 삭제했습니다.");
      renderMypage();
    });
  });
  document.querySelectorAll("[data-inquiry-toggle]").forEach((node) => {
    node.addEventListener("click", () => {
      const inquiryId = node.dataset.inquiryToggle;
      state.expandedInquiryId = state.expandedInquiryId === inquiryId ? null : inquiryId;
      renderMypage();
    });
  });
  document.querySelector("[data-address-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleAddressCreate(event.currentTarget);
  });
  document.querySelectorAll("[data-address-default]").forEach((node) => {
    node.addEventListener("click", async () => {
      await handleAddressDefault(node.dataset.addressDefault);
    });
  });
  document.querySelectorAll("[data-address-delete]").forEach((node) => {
    node.addEventListener("click", async () => {
      await handleAddressDelete(node.dataset.addressDelete);
    });
  });
  document.querySelectorAll("[data-notification-toggle]").forEach((node) => {
    node.addEventListener("change", () => {
      state.notifications[node.dataset.notificationToggle] = node.checked;
      save("reball.notifications", state.notifications);
    });
  });
  document.querySelector("[data-inquiry-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    addMypagePost({
      type: String(formData.get("type") || "문의"),
      title: String(formData.get("title") || "문의"),
      body: String(formData.get("body") || ""),
      status: "접수 완료",
    });
    showToast("문의가 등록되었습니다.");
    state.myTab = "inquiries";
    renderMypage();
  });
  document.querySelector("[data-receipt-search-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("영수증 조회 결과를 확인했습니다.");
  });
  document.querySelectorAll("[data-print-receipt]").forEach((node) => {
    node.addEventListener("click", () => showToast(`${node.dataset.printReceipt} 영수증 출력을 준비했습니다.`));
  });
  document.querySelectorAll("[data-shipping-track]").forEach((node) => {
    node.addEventListener("click", () => {
      const order = findOrderById(node.dataset.shippingTrack);
      showToast(order ? `${order.trackingCompany ?? "배송사"} ${order.trackingNumber ?? ""} 배송 조회` : "배송 정보를 확인했습니다.");
    });
  });
  document.querySelectorAll("[data-return-request], [data-return-order]").forEach((node) => {
    node.addEventListener("click", () => {
      const orderId = node.dataset.returnOrder || "";
      addMypagePost({
        type: "교환/반품 문의",
        title: orderId ? `${orderId} 교환/반품 신청` : "교환/반품 신청",
        status: "접수 완료",
        orderId,
      });
      showToast("교환/반품 신청이 접수되었습니다.");
      state.myTab = "inquiries";
      renderMypage();
    });
  });
  document.querySelectorAll("[data-review-order]").forEach((node) => {
    node.addEventListener("click", () => {
      const orderId = node.dataset.reviewOrder;
      const order = state.orders.find((item) => item.id === orderId);
      if (!order) {
        showToast("리뷰를 작성할 주문을 찾을 수 없습니다.");
        return;
      }
      state.selectedReviewOrderId = orderId;
      state.myTab = "review-write";
      renderMypage();
    });
  });
  document.querySelector("[data-review-write-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const orderId = form.dataset.reviewOrderId || state.selectedReviewOrderId;
    const order = state.orders.find((item) => item.id === orderId);
    const item = orderPrimaryItem(order);
    const rating = String(formData.get("rating") || "5");
    const photoCount = Number(form.dataset.reviewPhotoCount || "0");
    const body = String(formData.get("body") || "").trim();
    addMypagePost({
      type: "후기",
      title: `${item?.name ?? "주문 상품"} 리뷰`,
      body: [`평점 ${rating}점`, photoCount ? `사진 ${photoCount}장 첨부` : "", body].filter(Boolean).join("\n"),
      status: "게시 완료",
      orderId,
    });
    showToast("리뷰가 등록되었습니다.");
    state.selectedReviewOrderId = "";
    state.myTab = "reviews";
    renderMypage();
  });
  document.querySelector("[data-review-cancel]")?.addEventListener("click", () => {
    state.selectedReviewOrderId = "";
    state.myTab = "reviews";
    renderMypage();
  });
  document.querySelectorAll("[data-review-rating-value]").forEach((node) => {
    node.addEventListener("click", () => updateReviewRating(node.dataset.reviewRatingValue));
  });
  document.querySelectorAll("[data-review-upload-slot]").forEach((node) => {
    node.addEventListener("click", () => document.querySelector("[data-review-file-input]")?.click());
  });
  document.querySelector("[data-review-file-input]")?.addEventListener("change", (event) => {
    renderReviewUploadPreviews(event.currentTarget);
  });
  document.querySelectorAll("[data-seller-question]").forEach((node) => {
    node.addEventListener("click", () => {
      const orderId = node.dataset.sellerQuestion;
      addMypagePost({
        type: "판매자 문의",
        title: `${orderId} 주문 판매자 문의`,
        status: "답변 준비",
        orderId,
      });
      showToast("판매자 문의가 등록되었습니다.");
      state.myTab = "inquiries";
      renderMypage();
    });
  });
  document.querySelector("[data-withdraw-account]")?.addEventListener("click", () => {
    const input = document.querySelector("[data-withdraw-confirm-input]");
    if (input?.value !== "탈퇴합니다") {
      showToast("확인 문구를 정확히 입력하세요.");
      return;
    }
    showToast("실제 회원 탈퇴는 고객센터를 통해 접수해 주세요.");
  });
  document.querySelector("[data-admin-login-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("adminId") ?? "").trim();
    const password = String(form.get("adminPassword") ?? "").trim();
    if (id === state.adminCredentials.id && (!state.adminCredentials.password || password === state.adminCredentials.password)) {
      if (!state.adminCredentials.password) {
        state.adminCredentials = { ...state.adminCredentials, password };
        save("reball.adminCredentials", state.adminCredentials);
      }
      state.adminUser = { id, role: state.adminProfile.role, email: state.adminProfile.email };
      state.adminMembersLoaded = false;
      state.adminMembersError = "";
      state.adminLoginError = "";
      save("reball.adminUser", state.adminUser);
      renderAdmin();
      return;
    }
    state.adminLoginError = "아이디 또는 암호가 맞지 않습니다.";
    renderAdmin();
  });
  document.querySelector("[data-admin-logout]")?.addEventListener("click", () => {
    state.adminUser = null;
    state.adminModal = null;
    state.adminModalContext = null;
    state.adminMembers = [];
    state.adminMembersLoaded = false;
    state.adminMembersError = "";
    save("reball.adminUser", state.adminUser);
    renderAdmin();
  });
  document.querySelector("[data-admin-search-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.adminSearch = String(form.get("adminSearch") ?? "").trim();
    state.adminModal = "searchResult";
    state.adminModalContext = null;
    renderAdmin();
  });
  document.querySelectorAll("[data-admin-tab]").forEach((node) => {
    node.addEventListener("click", () => {
      state.adminTab = node.dataset.adminTab;
      state.adminModal = null;
      state.adminModalContext = null;
      if (state.adminTab === "customer") state.adminMembersLoaded = false;
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-admin-modal]").forEach((node) => {
    node.addEventListener("click", () => {
      if (node.dataset.adminModal === "downloadExport") {
        state.adminModalContext = null;
        downloadAdminExport();
        return;
      }
      state.adminModal = node.dataset.adminModal;
      state.adminModalContext = node.dataset.adminRowId
        ? {
            rowId: node.dataset.adminRowId,
            rowKind: node.dataset.adminRowKind || "",
          }
        : null;
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-admin-modal-close]").forEach((node) => {
    node.addEventListener("click", () => {
      state.adminModal = null;
      state.adminModalContext = null;
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-admin-modal-primary]").forEach((node) => {
    node.addEventListener("click", () => {
      const message = node.dataset.adminModalPrimary || "저장";
      const action = node.dataset.adminModalAction;
      if (action === "downloadExport") {
        state.adminModal = null;
        state.adminModalContext = null;
        renderAdmin();
        downloadAdminExport();
        return;
      }
      if (action === "profileSettings") {
        saveAdminProfileSettings();
        return;
      }
      if (action === "couponRegister") {
        saveAdminCouponRegister();
        return;
      }
      if (action === "saveOrder" && (state.adminTab === "coupon" || state.adminModalContext?.rowKind === "banner")) {
        saveAdminBannerOrder();
        return;
      }
      if (action?.startsWith("inquiryReply")) {
        saveAdminInquiryReply();
        return;
      }
      if (action === "addReview") {
        saveAdminReview();
        return;
      }
      if (action === "productRegister" && !handleAdminProductRegister()) return;
      if (action === "addCustomer") {
        if (!handleAdminCustomerRegister()) return;
        state.adminModal = null;
        state.adminModalContext = null;
        renderAdmin();
        showToast("고객이 등록되었습니다.");
        return;
      }
      state.adminModal = null;
      state.adminModalContext = null;
      renderAdmin();
      showToast(`${message} 처리되었습니다.`);
    });
  });
  const modal = document.querySelector("[data-modal]");
  const openGalleryModal = (source, label) => {
    const image = modal?.querySelector("[data-gallery-modal-image]");
    if (image && source) {
      image.src = asset(source);
      image.alt = `${label || "상품 이미지"} 확대 이미지`;
    }
    modal?.classList.add("is-open");
  };
  document.querySelector("[data-open-gallery]")?.addEventListener("click", (event) => {
    openGalleryModal(event.currentTarget.dataset.gallerySrc, event.currentTarget.dataset.galleryLabel);
  });
  document.querySelectorAll("[data-gallery-thumb]").forEach((node) => {
    node.addEventListener("click", () => {
      document.querySelectorAll("[data-gallery-thumb]").forEach((thumb) => thumb.classList.remove("is-active"));
      node.classList.add("is-active");
      openGalleryModal(node.dataset.gallerySrc, node.dataset.galleryLabel);
    });
  });
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
  bundleRegistry.clear();
  const [base, a] = state.route.split("/").filter(Boolean);

  if (!base) return renderHome();
  if ((base === "login" || base === "signup") && a !== "order" && state.authReady && isLoggedIn()) {
    routeTo("/mypage");
    return;
  }
  if (base === "product") return renderDetail(a);
  if (base === "story") return renderProductStory(a);
  if (base === "login") return renderAuthPage(a === "order" ? "guest-order" : "login");
  if (base === "signup") return renderAuthPage(a === "form" ? "signup-form" : a === "complete" ? "signup-complete" : "signup");
  if (base === "category") return renderCategory(a);
  if (base === "cart") return renderCart();
  if (base === "checkout") return renderCheckout();
  if (base === "order") return renderOrder(a);
  if (base === "mypage") return renderMypage();
  if (base === "store") return renderStore();
  if (base === "inspection") return renderInspection();
  if (base === "brand-story") return renderBrandStory();
  if (base === "customer-center") return renderCustomerCenter();
  if (base === "notice") return renderNotice();
  if (base === "faq") return renderFaq();
  if (base === "admin") return renderAdmin();
  renderHome();
}

window.addEventListener("hashchange", () => {
  state.menuOpen = false;
  renderRoute();
  window.requestAnimationFrame(flushPendingScroll);
});
window.setInterval(() => {
  state.activeBanner = (state.activeBanner + 1) % banners.length;
  if (parseRoute() === "/") renderHome();
}, 5200);

renderRoute();
void initializeAuth();
hydrateFromSupabase();


