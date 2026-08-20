import test from "node:test";
import assert from "node:assert/strict";

import {
  catalogPriceBook,
  catalogPriceForSelection,
  gradeOptions,
  packOptions,
} from "../../src/frontend/catalog/price-book.mjs";
import { shippingCost } from "../../src/frontend/cart/model.mjs";

test("엑셀 가격표는 S·A+·A·B와 50구 준비 공간을 노출한다", () => {
  assert.deepEqual(gradeOptions.map((item) => item.id), ["S", "A+", "A", "B"]);
  assert.deepEqual(packOptions.map((item) => item.id), ["5구", "10구", "30구", "50구", "100구"]);
  assert.equal(packOptions.find((item) => item.id === "50구")?.reserved, true);
});

test("세로 상품 그룹의 대표 가격을 정확히 찾는다", () => {
  assert.equal(
    catalogPriceForSelection("titleist-pro-v1-v1x-lostball", {
      model: "PRO V1X",
      grade: "S",
      pack: "5구",
    })?.price,
    17000
  );
  assert.equal(
    catalogPriceForSelection("titleist-pro-v1-v1x-lostball", {
      model: "PRO V1",
      grade: "B",
      pack: "30구",
    })?.price,
    35000
  );
  assert.equal(
    catalogPriceForSelection("taylormade-tp5-lostball", {
      model: "투어 리스폰스",
      grade: "B",
      pack: "10구",
    })?.price,
    14000
  );
  assert.equal(
    catalogPriceForSelection("general-brand-lostball", {
      model: "일반브랜드",
      grade: "A",
      pack: "100구",
    })?.freeShipping,
    true
  );
});

test("확정된 100구와 미정인 50구를 구분한다", () => {
  assert.equal(catalogPriceBook["brand-mix-lostball"].find((row) => row.grade === "A")?.pack, "100구");
  assert.equal(catalogPriceBook["general-brand-lostball"].find((row) => row.grade === "B")?.price, 35000);
  assert.equal(
    Object.values(catalogPriceBook).flat().some((row) => row.pack === "50구"),
    false
  );
});

test("일반브랜드 A~B 100구는 5만원 미만이어도 무료배송이다", () => {
  const policy = { baseFee: 3500, freeThreshold: 50000 };
  const specialCart = [
    {
      slug: "general-brand-lostball",
      selection: { grade: "A", pack: "100구" },
    },
  ];
  assert.equal(shippingCost(35000, policy, specialCart), 0);
  assert.equal(shippingCost(35000, policy, []), 3500);
});
