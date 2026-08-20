import test from "node:test";
import assert from "node:assert/strict";

import {
  assertOrderableQuantity,
  chooseVariantForOption,
  findExactCatalogVariant,
  findExactOrderableVariant,
  isOrderableVariant,
  isVariantOptionSelectable,
  orderableVariants,
} from "../../src/frontend/catalog/variants.mjs";

const active = {
  id: "variant-a",
  model: "PRO V1",
  grade: "A",
  pack: "10구",
  color: "화이트",
  price: 12900,
  stock: 2,
  active: true,
  available: true,
};

test("DB variants가 없으면 탐색 상품은 구매 가능 variant를 만들지 않는다", () => {
  assert.deepEqual(orderableVariants({ models: ["PRO V1"], stock: 99, price: 12900 }), []);
  assert.equal(findExactOrderableVariant({}, active), null);
});

test("활성·양수 가격·양수 재고를 모두 만족해야 구매 가능하다", () => {
  assert.equal(isOrderableVariant(active), true);
  for (const candidate of [
    { ...active, active: false },
    { ...active, available: false },
    { ...active, stock: 0 },
    { ...active, price: 0 },
    { ...active, id: "" },
  ]) {
    assert.equal(isOrderableVariant(candidate), false);
  }
});

test("존재하지 않는 조합은 exact variant로 대체하지 않는다", () => {
  const product = { dbVariants: [active] };
  assert.equal(findExactOrderableVariant(product, { ...active, grade: "A+" }), null);
  assert.equal(findExactOrderableVariant(product, active)?.id, active.id);
});

test("재고 0 옵션은 가격표 데이터로 남지만 선택·주문할 수 없다", () => {
  const soldOut = { ...active, id: "variant-s", grade: "S", pack: "5구", price: 17000, stock: 0, available: false };
  const product = { dbVariants: [active, soldOut] };
  assert.equal(findExactCatalogVariant(product, soldOut)?.id, soldOut.id);
  assert.equal(isVariantOptionSelectable(product, "grade", "S"), false);
  assert.equal(chooseVariantForOption(product, active, "grade", "S"), null);
  assert.equal(isOrderableVariant(soldOut), false);
});

test("옵션 변경은 실제 존재하는 variant로만 이동한다", () => {
  const second = { ...active, id: "variant-a-plus", grade: "A+", pack: "30구", stock: 1 };
  const product = { dbVariants: [active, second] };
  assert.equal(isVariantOptionSelectable(product, "grade", "A+"), true);
  assert.equal(isVariantOptionSelectable(product, "color", "옐로우"), false);
  assert.equal(chooseVariantForOption(product, active, "grade", "A+")?.id, second.id);
});

test("수량은 실제 variant 재고를 넘을 수 없다", () => {
  assert.equal(assertOrderableQuantity(active, 2), 2);
  assert.throws(() => assertOrderableQuantity(active, 3), /최대 수량/);
  assert.throws(() => assertOrderableQuantity({ ...active, stock: 0 }, 1), /구매할 수 없습니다/);
});
