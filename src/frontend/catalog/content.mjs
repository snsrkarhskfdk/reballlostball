import { productPhotoCatalog } from "./product-images.mjs";

export const businessProfile = {
  name: "리볼로스트볼",
  owner: "이영석",
  businessNumber: "867-01-03727",
  mailOrderNumber: "제 2025 - 부천소사 -0655 호",
  address: "부천 소사구 송내동 300-12 1층",
  supportPhone: "010-8484-4646",
  supportEmail: "evil1229@naver.com",
  operationHours: "09:00 ~ 18:00 시",
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

export const shippingPolicy = {
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

export const storeMapUrl = "https://place.map.kakao.com/450496449";

export const storeGalleryPhotos = [
  {
    image: "store/reball-store-01.webp",
    title: "송내동 매장 외관",
    label: "Storefront",
    body: "간판과 입구가 바로 보이는 1층 매장입니다.",
  },
  {
    image: "store/reball-store-02.webp",
    title: "브랜드별 진열 공간",
    label: "Display",
    body: "타이틀리스트, 캘러웨이, 스릭슨 등 브랜드별 재고를 한눈에 확인합니다.",
  },
  {
    image: "store/reball-store-03.webp",
    title: "등급별 보관 선반",
    label: "Stock",
    body: "색상과 등급 기준에 맞춰 선별한 로스트볼을 묶음 단위로 보관합니다.",
  },
  {
    image: "store/reball-store-04.webp",
    title: "검수·포장 테이블",
    label: "Packing",
    body: "방문 구매와 온라인 출고를 같은 기준으로 준비합니다.",
  },
];

export const paymentProfile = {
  methods: ["카드", "계좌이체", "가상계좌", "간편결제"],
  transferLabel: "계좌이체 입금 계좌",
};

export const lostballNotice = [
  "본 상품은 수거·세척·선별 과정을 거친 로스트볼(중고 골프공)입니다.",
  "등급별 기준에 따라 선별하여 판매하고 있으며, 로스트볼 특성상 미세 스크래치, 펜마킹, 로고, 변색 등이 일부 존재할 수 있습니다.",
  "상품 상태는 등급 기준을 참고해 주시기 바라며, 사용에 지장이 있는 공은 제외 후 출고됩니다.",
  "실제 상품 상태는 브랜드 및 등급에 따라 차이가 있을 수 있습니다.",
];

export function createFaqItems(formatMoney) {
  return [
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
    answer: "비회원 주문조회 화면에서 주문번호와 주문 생성 시 발급된 무작위 조회 토큰을 입력하면 주문 진행 상태를 확인할 수 있습니다.",
  },
  {
    category: "교환/반품",
    question: "단순변심 반품이 가능한가요?",
    answer: `${shippingPolicy.simpleReturnWindow} 단순변심 반품 접수가 가능하며, 왕복 반품 배송비는 ${formatMoney(shippingPolicy.simpleReturnFee)}원 기준으로 안내합니다.`,
  },
  {
    category: "고객센터",
    question: "상담은 어디로 하면 되나요?",
    answer: `고객센터 ${businessProfile.supportPhone} 또는 ${businessProfile.supportEmail}로 문의할 수 있습니다. 운영시간은 평일 ${businessProfile.operationHours}입니다.`,
  },
  ];
}

export const noticeItems = [
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
      "신규 리볼회원 가입 시 바로 사용할 수 있는 3,000원 쿠폰이 지급됩니다. 쿠폰은 마이페이지 쿠폰함에서 확인할 수 있으며, 사용 조건은 주문 단계에서 함께 안내됩니다.",
  },
];

export const brandMenu = [
  ["titleist", "타이틀리스트"],
  ["taylormade", "테일러메이드"],
  ["bridgestone", "브리지스톤"],
  ["callaway", "캘러웨이"],
  ["srixon", "스릭슨"],
  ["volvik", "볼빅"],
  ["saintnine", "세인트나인"],
  ["mix", "브랜드혼합"],
];

export const products = [
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
    cardImage: productPhotoCatalog.bridgestone.representative,
    variantImageRules: productPhotoCatalog.bridgestone.rules,
    detailImage: "detail-bridgestone.webp",
    galleryVideo: "product-videos/reball-bridgestone-rotation.mp4",
    galleryImages: [
      ...productPhotoCatalog.bridgestone.galleryImages,
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
    cardImage: productPhotoCatalog.taylormade.representative,
    variantImageRules: productPhotoCatalog.taylormade.rules,
    detailImage: "detail-taylormade.webp",
    galleryVideo: "product-videos/reball-taylormade-rotation.mp4",
    galleryAnimation: "product-videos/reball-taylormade-rotation.webp",
    galleryImages: [
      ...productPhotoCatalog.taylormade.galleryImages,
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
    cardImage: productPhotoCatalog.saintnine.representative,
    variantImageRules: productPhotoCatalog.saintnine.rules,
    detailImage: "detail-saintnine.webp",
    galleryVideo: "product-videos/reball-saintnine-rotation.mp4",
    galleryImages: [
      ...productPhotoCatalog.saintnine.galleryImages,
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
    line: "비비드 컬러 / 화이트 / 일반 컬러 / 360",
    copy: "비비드 컬러, 화이트, 일반 컬러, 360 구성을 등급별로 선별합니다.",
    price: 7900,
    colors: ["컬러", "화이트"],
    models: ["비비드 컬러", "화이트", "일반 컬러", "360"],
    image: "ball-volvik.png",
    cardImage: productPhotoCatalog.volvik.representative,
    variantImageRules: productPhotoCatalog.volvik.rules,
    detailImage: "detail-volvik.webp",
    galleryVideo: "product-videos/reball-volvik-rotation.mp4",
    galleryImages: [
      ...productPhotoCatalog.volvik.galleryImages,
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
    models: ["CHROME TOUR", "360 트리플트랙 화이트", "360 트리플트랙 옐로우", "ERC 소프트"],
    image: "ball-callaway.png",
    cardImage: productPhotoCatalog.callaway.representative,
    variantImageRules: productPhotoCatalog.callaway.rules,
    detailImage: "detail-callaway.png",
    galleryVideo: "callaway-rotation.mp4",
    galleryImages: [
      ...productPhotoCatalog.callaway.galleryImages,
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
    cardImage: productPhotoCatalog.srixon.representative,
    variantImageRules: productPhotoCatalog.srixon.rules,
    detailImage: "detail-srixon.webp",
    galleryVideo: "product-videos/reball-srixon-rotation.mp4",
    galleryImages: [
      ...productPhotoCatalog.srixon.galleryImages,
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
      { image: "gallery/mix-01.jpg", label: "브랜드혼합 혼합볼 이미지 1" },
      { image: "gallery/mix-02.jpg", label: "브랜드혼합 혼합볼 이미지 2" },
      { image: "gallery/mix-03.jpg", label: "브랜드혼합 혼합볼 이미지 3" },
      { image: "gallery/mix-05.jpg", label: "브랜드혼합 혼합볼 이미지 4" },
      { image: "gallery/mix-04.jpg", label: "브랜드혼합 혼합볼 이미지 5" },
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

export const gradeOptions = [
  { id: "S", label: "S", delta: 1800, text: "새 볼에 가까운 최상급" },
  { id: "A", label: "A", delta: 0, text: "실전 라운드용 우수급" },
  { id: "B", label: "B", delta: -1800, text: "연습과 가성비 중심 실속급" },
];
export const packOptions = [
  { id: "10구", qty: 10, multiplier: 1 },
  { id: "30구", qty: 30, multiplier: 2.62 },
];

export const defaultNotifications = {
  order: false,
  delivery: false,
  coupon: false,
  marketing: false,
  restock: false,
};

export const defaultCoupons = [
  {
    id: "WELCOME3000",
    title: "신규 회원가입 축하 쿠폰",
    benefit: "3,000원 할인",
    benefitAmount: 3000,
    period: "2026.06.04 - 2026.06.30",
    status: "사용 가능",
    useCount: 0,
  },
];

export const defaultPosts = [];
