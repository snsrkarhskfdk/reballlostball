const freezeRows = (rows) => Object.freeze(rows.map((row) => Object.freeze(row)));

export const gradeOptions = Object.freeze([
  Object.freeze({ id: "S", dbValue: "S", label: "S", text: "타이틀리스트 V1·V1X 최상급 선별" }),
  Object.freeze({ id: "A+", dbValue: "A_PLUS", label: "A+", text: "사용감이 가장 적은 최상급" }),
  Object.freeze({ id: "A", dbValue: "A", label: "A", text: "라운드용으로 충분한 우수급" }),
  Object.freeze({ id: "B", dbValue: "B", label: "B", text: "연습과 가성비 중심 실속급" }),
]);

export const packOptions = Object.freeze([
  Object.freeze({ id: "5구", qty: 5 }),
  Object.freeze({ id: "10구", qty: 10 }),
  Object.freeze({ id: "30구", qty: 30 }),
  Object.freeze({ id: "50구", qty: 50, reserved: true, pendingLabel: "가격 준비중" }),
  Object.freeze({ id: "100구", qty: 100 }),
]);

export const gradeConditionGuide = Object.freeze({
  S: Object.freeze({
    title: "PRO V1·V1X 최상급 선별",
    body: "타이틀리스트 PRO V1 또는 PRO V1X 가운데 광택과 표면 상태가 특히 좋은 공만 5구로 선별합니다. 미세한 로고나 인쇄 차이는 있을 수 있습니다.",
    recommendation: "새 공에 가까운 외관과 프리미엄 5구 구성을 원하는 분",
    sampleImage: "product-actual/titleist-pro-v1-01.webp",
  }),
  "A+": Object.freeze({
    title: "사용감이 가장 적은 최상급",
    body: "광택과 표면 상태가 좋고 눈에 띄는 스크래치·변색이 거의 없습니다. 미세한 로고나 펜 마킹은 일부 포함될 수 있습니다.",
    recommendation: "선물, 라운드, 새 공에 가까운 외관을 원하는 분",
    sampleImage: "product-variants/saintnine-a-plus.webp",
  }),
  A: Object.freeze({
    title: "라운드에 충분한 우수급",
    body: "가벼운 스크래치·펜 마킹·부분 변색이 있을 수 있으나 비거리와 플레이에 지장이 없는 공만 선별합니다.",
    recommendation: "실전 라운드와 합리적인 가격을 함께 원하는 분",
    sampleImage: "product-variants/saintnine-a.webp",
  }),
  B: Object.freeze({
    title: "사용감이 보이는 실속급",
    body: "스크래치·마킹·변색 등 사용감이 비교적 뚜렷할 수 있습니다. 깨짐·심한 손상처럼 사용에 지장이 있는 공은 제외합니다.",
    recommendation: "연습장, 숏게임, 부담 없는 반복 연습이 필요한 분",
    sampleImage: "product-variants/saintnine-a-minus.webp",
  }),
});

// 2026-08-20 사용자 제공 `단가 계산.xlsx`의 세로 상품 그룹을 그대로 옮긴 정본.
// 엑셀의 A-는 사이트의 B 등급으로 표시한다. 별도 수량 표기가 없으면 10구다.
export const catalogPriceBook = Object.freeze({
  "titleist-pro-v1-v1x-lostball": freezeRows([
    { model: "PRO V1", grade: "S", pack: "5구", price: 17000 },
    { model: "PRO V1", grade: "A+", pack: "10구", price: 27000 },
    { model: "PRO V1", grade: "A", pack: "10구", price: 20000 },
    { model: "PRO V1", grade: "B", pack: "30구", price: 35000 },
    { model: "PRO V1X", grade: "S", pack: "5구", price: 17000 },
    { model: "PRO V1X", grade: "A+", pack: "10구", price: 27000 },
    { model: "PRO V1X", grade: "A", pack: "10구", price: 20000 },
    { model: "PRO V1X", grade: "B", pack: "30구", price: 35000 },
    { model: "AVX", grade: "A+", pack: "10구", price: 22000 },
    { model: "AVX", grade: "A", pack: "10구", price: 15000 },
    { model: "AVX", grade: "B", pack: "30구", price: 30000 },
    { model: "일반(2피스)", grade: "A+", pack: "10구", price: 17000 },
    { model: "일반(2피스)", grade: "A", pack: "10구", price: 10000 },
    { model: "일반(2피스)", grade: "B", pack: "30구", price: 20000 },
  ]),
  "taylormade-tp5-lostball": freezeRows([
    { model: "TP5", grade: "A+", pack: "10구", price: 26000 },
    { model: "TP5", grade: "A", pack: "10구", price: 19000 },
    { model: "TP5", grade: "B", pack: "30구", price: 33000 },
    { model: "TP5 Pix", grade: "A+", pack: "10구", price: 26000 },
    { model: "TP5 Pix", grade: "A", pack: "10구", price: 19000 },
    { model: "투어 리스폰스", grade: "A+", pack: "10구", price: 23000 },
    { model: "투어 리스폰스", grade: "A", pack: "10구", price: 18000 },
    { model: "투어 리스폰스", grade: "B", pack: "10구", price: 14000 },
  ]),
  "bridgestone-tour-b-lostball": freezeRows([
    { model: "TOUR B", grade: "A+", pack: "10구", price: 22000 },
    { model: "TOUR B", grade: "A", pack: "10구", price: 15000 },
    { model: "TOUR B", grade: "B", pack: "30구", price: 30000 },
    { model: "E12", grade: "A+", pack: "10구", price: 17000 },
    { model: "E12", grade: "A", pack: "10구", price: 12000 },
    { model: "E12", grade: "B", pack: "30구", price: 27000 },
    { model: "일반(JGB·스트레이트)", grade: "A+", pack: "10구", price: 13000 },
    { model: "일반(JGB·스트레이트)", grade: "A", pack: "30구", price: 27000 },
  ]),
  "srixon-z-star-lostball": freezeRows([
    { model: "Z-STAR", grade: "A+", pack: "10구", price: 18000 },
    { model: "Z-STAR", grade: "A", pack: "10구", price: 12000 },
    { model: "Z-STAR", grade: "B", pack: "30구", price: 27000 },
    { model: "Z-STAR 반반", grade: "A+", pack: "10구", price: 22000 },
    { model: "Z-STAR 반반", grade: "A", pack: "10구", price: 18000 },
    { model: "Q-STAR 반반", grade: "A+", pack: "10구", price: 21000 },
    { model: "Q-STAR 반반", grade: "A", pack: "10구", price: 17000 },
    { model: "일반(소프트필·Q·T)", grade: "A+", pack: "10구", price: 12000 },
    { model: "일반(소프트필·Q·T)", grade: "A", pack: "10구", price: 8000 },
  ]),
  "callaway-chrome-tour-lostball": freezeRows([
    { model: "크롬·ERC·트리플트랙", grade: "A+", pack: "10구", price: 22000 },
    { model: "크롬·ERC·트리플트랙", grade: "A", pack: "10구", price: 15000 },
    { model: "크롬·ERC·트리플트랙", grade: "B", pack: "30구", price: 30000 },
  ]),
  "saintnine-lostball": freezeRows([
    { model: "세인트나인", grade: "A+", pack: "10구", price: 13000 },
    { model: "세인트나인", grade: "A", pack: "10구", price: 9000 },
    { model: "세인트나인", grade: "B", pack: "30구", price: 20000 },
  ]),
  "volvik-lostball": freezeRows([
    { model: "볼빅", grade: "A+", pack: "10구", price: 12000 },
    { model: "볼빅", grade: "A", pack: "10구", price: 8000 },
    { model: "볼빅", grade: "B", pack: "30구", price: 19000 },
  ]),
  "brand-mix-lostball": freezeRows([
    { model: "브랜드혼합", grade: "A+", pack: "10구", price: 6000 },
    { model: "브랜드혼합", grade: "A", pack: "100구", price: 40000 },
    { model: "브랜드혼합", grade: "B", pack: "100구", price: 40000 },
  ]),
  "general-brand-lostball": freezeRows([
    { model: "일반브랜드", grade: "A+", pack: "10구", price: 6000 },
    { model: "일반브랜드", grade: "A", pack: "100구", price: 35000, freeShipping: true },
    { model: "일반브랜드", grade: "B", pack: "100구", price: 35000, freeShipping: true },
  ]),
});

export function priceRowsForProduct(productOrSlug) {
  const slug = typeof productOrSlug === "string" ? productOrSlug : productOrSlug?.slug;
  return catalogPriceBook[slug] ?? Object.freeze([]);
}

export function uniquePriceBookValues(productOrSlug, key) {
  return [...new Set(priceRowsForProduct(productOrSlug).map((row) => row[key]).filter(Boolean))];
}

export function minimumCatalogPrice(productOrSlug, fallback = 0) {
  const prices = priceRowsForProduct(productOrSlug).map((row) => Number(row.price)).filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : Number(fallback) || 0;
}

export function catalogPriceForSelection(productOrSlug, selection = {}) {
  return priceRowsForProduct(productOrSlug).find(
    (row) => row.model === selection.model && row.grade === selection.grade && row.pack === selection.pack
  ) ?? null;
}
