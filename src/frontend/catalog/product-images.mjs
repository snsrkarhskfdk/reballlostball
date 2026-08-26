function normalizeMatchValue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function matchesAllowedValue(allowedValues, selectedValue) {
  if (!Array.isArray(allowedValues) || allowedValues.length === 0) return true;
  const selected = normalizeMatchValue(selectedValue);
  return Boolean(selected) && allowedValues.some((value) => normalizeMatchValue(value) === selected);
}

function matchingRuleScore(rule, selection) {
  const dimensions = [
    [rule.models, selection?.model],
    [rule.grades, selection?.grade],
    [rule.colors, selection?.color],
  ];
  if (dimensions.some(([allowed, selected]) => !matchesAllowedValue(allowed, selected))) return -1;
  return dimensions.reduce(
    (score, [allowed]) => score + (Array.isArray(allowed) && allowed.length > 0 ? 1 : 0),
    0
  );
}

export function resolveProductVariantImage(product, selection = {}, fallback = product?.image ?? "") {
  const rules = Array.isArray(product?.variantImageRules) ? product.variantImageRules : [];
  const match = rules
    .map((rule, index) => ({ rule, index, score: matchingRuleScore(rule, selection) }))
    .filter(({ rule, score }) => score >= 0 && typeof rule.image === "string" && rule.image.trim())
    .sort((left, right) => right.score - left.score || left.index - right.index)[0];
  return match?.rule.image ?? fallback;
}

export function resolveRemoteVariantImage(
  product,
  selection,
  remoteImage = "",
  fallback = product?.image ?? ""
) {
  const explicitRemoteImage = String(remoteImage || "").trim();
  const legacyGenericImage = /^ball-[a-z0-9-]+\.(?:png|webp)$/i.test(explicitRemoteImage);
  return explicitRemoteImage && !legacyGenericImage
    ? explicitRemoteImage
    : resolveProductVariantImage(product, selection, explicitRemoteImage || fallback);
}

export function resolveAdminVariantThumbnail(product, variant) {
  const existingVariant = Array.isArray(product?.dbVariants)
    ? product.dbVariants.find((item) => String(item?.sku || "") === String(variant?.sku || ""))
    : null;
  const existingImage = String(existingVariant?.imageUrl || "").trim();
  return existingImage || resolveProductVariantImage(product, variant, product?.image ?? "");
}

const catalogAsset = (image) => (String(image).includes("/") ? String(image) : `product-variants/${image}`);
const photo = (image, label) => Object.freeze({ image: catalogAsset(image), label });
const rule = (image, options = {}) =>
  Object.freeze({ ...options, image: catalogAsset(image) });
const actualRule = (image, options = {}) =>
  Object.freeze({ ...options, image: `product-actual/${image}` });
const entry = ({ representative, galleryImages, rules }) =>
  Object.freeze({
    representative: catalogAsset(representative),
    galleryImages: Object.freeze(galleryImages),
    rules: Object.freeze(rules),
  });

export const productPhotoCatalog = Object.freeze({
  titleist: entry({
    representative: "product-actual/titleist-pro-v1-01.webp",
    galleryImages: [],
    rules: [
      actualRule("titleist-pro-v1-01.webp", { models: ["PRO V1"], grades: ["S"] }),
      actualRule("titleist-pro-v1-01.webp", { models: ["PRO V1"], grades: ["A+"] }),
      actualRule("titleist-pro-v1-03.webp", { models: ["PRO V1"], grades: ["A"] }),
      actualRule("titleist-pro-v1-05.webp", { models: ["PRO V1"], grades: ["B"] }),
      actualRule("titleist-pro-v1x-01.webp", { models: ["PRO V1X"], grades: ["S"] }),
      actualRule("titleist-pro-v1x-01.webp", { models: ["PRO V1X"], grades: ["A+"] }),
      actualRule("titleist-pro-v1x-03.webp", { models: ["PRO V1X"], grades: ["A"] }),
      actualRule("titleist-pro-v1x-05.webp", { models: ["PRO V1X"], grades: ["B"] }),
    ],
  }),
  volvik: entry({
    representative: "volvik-white-a-plus.webp",
    galleryImages: [
      photo("volvik-360-a-minus.webp", "볼빅 360 B 실물"),
      photo("volvik-white-a-plus.webp", "볼빅 화이트 A+ 실물"),
      photo("volvik-white-a.webp", "볼빅 화이트 A 실물"),
      photo("volvik-white-a-minus.webp", "볼빅 화이트 B 실물"),
      photo("volvik-vivid-s.webp", "볼빅 비비드 A+ 실물"),
      photo("volvik-vivid-a-plus.webp", "볼빅 비비드 A+ 실물"),
      photo("volvik-vivid-a.webp", "볼빅 비비드 A 실물"),
      photo("volvik-general-a-plus.webp", "볼빅 일반 컬러 A+ 실물"),
      photo("volvik-general-a-minus.webp", "볼빅 일반 컬러 B 실물"),
    ],
    rules: [
      rule("volvik-vivid-s.webp", { models: ["비비드", "비비드 컬러"], grades: ["A+"] }),
      rule("volvik-vivid-a.webp", { models: ["비비드", "비비드 컬러"], grades: ["A"] }),
      rule("volvik-white-a-plus.webp", { models: ["화이트"], grades: ["A+"] }),
      rule("volvik-white-a.webp", { models: ["화이트"], grades: ["A"] }),
      rule("volvik-white-a-minus.webp", { models: ["화이트"], grades: ["B"] }),
      rule("volvik-general-a-plus.webp", { models: ["일반", "일반 컬러"], grades: ["A+"] }),
      rule("volvik-general-a-minus.webp", { models: ["일반", "일반 컬러"], grades: ["B"] }),
      rule("volvik-360-a-minus.webp", { models: ["360"], grades: ["B"] }),
      rule("volvik-white-a-plus.webp", { grades: ["A+"] }),
      rule("volvik-white-a.webp", { grades: ["A"] }),
      rule("volvik-white-a-minus.webp", { grades: ["B"] }),
    ],
  }),
  bridgestone: entry({
    representative: "bridgestone-tour-b-a-plus.webp",
    galleryImages: [
      photo("bridgestone-tour-b-a-plus.webp", "브리지스톤 TOUR B A+ 실물"),
      photo("bridgestone-tour-b-a.webp", "브리지스톤 TOUR B A 실물"),
      photo("bridgestone-tour-b-a-minus.webp", "브리지스톤 TOUR B B 실물"),
      photo("bridgestone-e12-a-plus-white-20260824.svg", "브리지스톤 E12 화이트 A+ 실물"),
      photo("bridgestone-e12-a-white-20260824.svg", "브리지스톤 E12 화이트 A 실물"),
      photo("bridgestone-general-a-plus-20260824.svg", "브리지스톤 일반 A+ 실물"),
      photo("bridgestone-general-a-20260824.svg", "브리지스톤 일반 A 실물"),
    ],
    rules: [
      rule("bridgestone-tour-b-s.webp", { models: ["TOUR B", "투어 B", "투어B", "투어 X", "XS"], grades: ["A+"] }),
      rule("bridgestone-tour-b-a.webp", { models: ["TOUR B", "투어 B", "투어B", "투어 X", "XS"], grades: ["A"] }),
      rule("bridgestone-tour-b-a-minus.webp", { models: ["TOUR B", "투어 B", "투어B", "투어 X", "XS"], grades: ["B"] }),
      rule("bridgestone-e12-a-plus-white-20260824.svg", { models: ["E12"], grades: ["A+"] }),
      rule("bridgestone-e12-a-white-20260824.svg", { models: ["E12"], grades: ["A"] }),
      rule("bridgestone-e12-a-minus-white.webp", { models: ["E12"], grades: ["B"], colors: ["화이트"] }),
      rule("bridgestone-e12-a-minus-color.webp", { models: ["E12"], grades: ["B"], colors: ["혼합", "컬러"] }),
      rule("bridgestone-e12-a-minus-color.webp", { models: ["E12"], grades: ["B"] }),
      rule("bridgestone-general-a-plus-20260824.svg", { models: ["일반", "혼합", "일반(JGB·스트레이트)"], grades: ["A+"] }),
      rule("bridgestone-general-a-20260824.svg", { models: ["일반", "혼합", "일반(JGB·스트레이트)"], grades: ["A"] }),
      rule("bridgestone-general-a-minus.webp", { models: ["일반", "혼합", "일반(JGB·스트레이트)"], grades: ["B"] }),
      rule("bridgestone-tour-b-s.webp", { grades: ["A+"] }),
      rule("bridgestone-tour-b-a.webp", { grades: ["A"] }),
      rule("bridgestone-tour-b-a-minus.webp", { grades: ["B"] }),
    ],
  }),
  saintnine: entry({
    representative: "saintnine-a-plus.webp",
    galleryImages: [
      photo("saintnine-a-plus.webp", "세인트나인 A+ 실물"),
      photo("saintnine-a.webp", "세인트나인 A 실물"),
      photo("saintnine-a-minus.webp", "세인트나인 B 실물"),
    ],
    rules: [
      rule("saintnine-a-plus.webp", { grades: ["A+"] }),
      rule("saintnine-a.webp", { grades: ["A"] }),
      rule("saintnine-a-minus.webp", { grades: ["B"] }),
    ],
  }),
  srixon: entry({
    representative: "srixon-z-star-a-plus-20260824.svg",
    galleryImages: [
      photo("srixon-z-star-a-plus-20260824.svg", "스릭슨 Z-STAR A+ 실물"),
      photo("srixon-half-a-plus-20260824.webp", "스릭슨 반반 A+ 실물"),
      photo("srixon-general-a-plus.webp", "스릭슨 일반 A+ 실물"),
    ],
    rules: [
      rule("srixon-z-star-a-plus-20260824.svg", { models: ["Z-STAR"], grades: ["A+"] }),
      rule("srixon-z-star-a-20260824.webp", { models: ["Z-STAR"], grades: ["A"] }),
      rule("srixon-half-a-plus-20260824.webp", { models: ["Z-STAR 반반", "Q-STAR 반반"], grades: ["A+"] }),
      rule("srixon-half-a-20260824.webp", { models: ["Z-STAR 반반", "Q-STAR 반반"], grades: ["A"] }),
      rule("srixon-general-a-plus.webp", { models: ["일반", "일반(소프트필·Q·T)"], grades: ["A+"] }),
      rule("srixon-general-a.webp", { models: ["일반", "일반(소프트필·Q·T)"], grades: ["A"] }),
      rule("srixon-general-a-minus.webp", { grades: ["B"] }),
      rule("srixon-z-star-a-plus-20260824.svg", { grades: ["A+"] }),
      rule("srixon-z-star-a-20260824.webp", { grades: ["A"] }),
    ],
  }),
  callaway: entry({
    representative: "callaway-general-a-plus.webp",
    galleryImages: [
      photo("callaway-erc-a-plus.webp", "캘러웨이 ERC A+ 실물"),
      photo("callaway-erc-a.webp", "캘러웨이 ERC A 실물"),
      photo("callaway-general-a-plus.webp", "캘러웨이 일반 A+ 실물"),
      photo("callaway-general-a.webp", "캘러웨이 일반 A 실물"),
    ],
    rules: [
      rule("callaway-erc-a-plus.webp", { models: ["ERC", "ERC 소프트"], grades: ["A+"] }),
      rule("callaway-erc-a.webp", { models: ["ERC", "ERC 소프트"], grades: ["A"] }),
      rule("callaway-general-a-plus.webp", {
        models: ["일반", "CHROME TOUR", "크롬·ERC·트리플트랙", "360 트리플트랙 화이트", "360 트리플트랙 옐로우"],
        grades: ["A+"],
      }),
      rule("callaway-general-a.webp", {
        models: ["일반", "CHROME TOUR", "크롬·ERC·트리플트랙", "360 트리플트랙 화이트", "360 트리플트랙 옐로우"],
        grades: ["A"],
      }),
      rule("callaway-general-a-plus.webp", { grades: ["A+"] }),
      rule("callaway-general-a.webp", { grades: ["A"] }),
      actualRule("callaway-05.webp", { grades: ["B"] }),
    ],
  }),
  taylormade: entry({
    representative: "taylormade-tp5-a-plus.webp",
    galleryImages: [photo("taylormade-tp5-a-plus.webp", "테일러메이드 TP5 A+ 실물")],
    rules: [
      rule("taylormade-tp5-a-plus.webp", { models: ["TP5"], grades: ["A+"] }),
      actualRule("taylormade-01.webp", { grades: ["A+"] }),
      actualRule("taylormade-03.webp", { grades: ["A"] }),
      actualRule("taylormade-05.webp", { grades: ["B"] }),
    ],
  }),
});