const SELECTION_KEYS = ["model", "grade", "pack", "color"];

function text(value) {
  return value == null ? "" : String(value).trim();
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

export function isOrderableVariant(variant) {
  return Boolean(
    isCatalogVariant(variant) &&
      variant.available !== false &&
      positiveInteger(variant.stock) > 0 &&
      positiveInteger(variant.price) > 0
  );
}

export function isCatalogVariant(variant) {
  return Boolean(
    variant &&
      text(variant.id) &&
      variant.active !== false &&
      positiveInteger(variant.price) > 0
  );
}

export function catalogVariants(product) {
  return Array.isArray(product?.dbVariants) ? product.dbVariants.filter(Boolean) : [];
}

export function orderableVariants(product) {
  return catalogVariants(product).filter(isOrderableVariant);
}

export function activePricedVariants(product) {
  return catalogVariants(product).filter(isCatalogVariant);
}

export function variantSelection(variant) {
  return Object.fromEntries(SELECTION_KEYS.map((key) => [key, text(variant?.[key])]));
}

export function selectionMatches(variant, selection = {}) {
  return SELECTION_KEYS.every((key) => text(variant?.[key]) === text(selection?.[key]));
}

export function findExactOrderableVariant(product, selection) {
  return orderableVariants(product).find((variant) => selectionMatches(variant, selection)) ?? null;
}

export function findExactCatalogVariant(product, selection) {
  return activePricedVariants(product).find((variant) => selectionMatches(variant, selection)) ?? null;
}

export function findFirstOrderableVariant(product, partial = {}) {
  const entries = Object.entries(partial).filter(([, value]) => text(value));
  return (
    orderableVariants(product).find((variant) =>
      entries.every(([key, value]) => text(variant?.[key]) === text(value))
    ) ?? null
  );
}

export function findFirstCatalogVariant(product, partial = {}) {
  const entries = Object.entries(partial).filter(([, value]) => text(value));
  return (
    activePricedVariants(product).find((variant) =>
      entries.every(([key, value]) => text(variant?.[key]) === text(value))
    ) ?? null
  );
}

export function isVariantOptionSelectable(product, key, value) {
  if (!SELECTION_KEYS.includes(key)) return false;
  return orderableVariants(product).some((variant) => text(variant[key]) === text(value));
}

export function chooseVariantForOption(product, currentSelection, key, value) {
  if (!isVariantOptionSelectable(product, key, value)) return null;
  const candidates = orderableVariants(product).filter(
    (variant) => text(variant[key]) === text(value)
  );
  return (
    candidates
      .map((variant) => ({
        variant,
        score: SELECTION_KEYS.reduce(
          (score, candidateKey) =>
            score +
            (candidateKey !== key &&
            text(variant[candidateKey]) === text(currentSelection?.[candidateKey])
              ? 1
              : 0),
          0
        ),
      }))
      .sort((left, right) => right.score - left.score)[0]?.variant ?? null
  );
}

export function assertOrderableQuantity(variant, quantity) {
  if (!isOrderableVariant(variant)) {
    throw new Error("선택한 옵션은 현재 구매할 수 없습니다.");
  }
  const safeQuantity = positiveInteger(quantity);
  if (!safeQuantity) throw new Error("수량은 1개 이상이어야 합니다.");
  if (safeQuantity > positiveInteger(variant.stock)) {
    throw new Error(`선택 가능한 최대 수량은 ${positiveInteger(variant.stock)}개입니다.`);
  }
  return safeQuantity;
}

export { SELECTION_KEYS };
