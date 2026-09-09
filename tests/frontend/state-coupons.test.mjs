import test from "node:test";
import assert from "node:assert/strict";
import { activeCouponsOnly, createAppState } from "../../src/frontend/core/state.mjs";

test("retired promotion sentinels never enter customer coupon state", () => {
  const coupons = [
    { id: "NO_ACTIVE_SIGNUP_PROMO", status: "미운영" },
    { id: "expired-1", status: "expired" },
    { id: "active-1", status: "사용 가능" },
  ];
  assert.deepEqual(activeCouponsOnly(coupons), [{ id: "active-1", status: "사용 가능" }]);
  assert.equal(createAppState({ coupons }).coupons.length, 1);
});

test("blocked or malformed storage fallback cannot create a phantom coupon count", () => {
  assert.deepEqual(activeCouponsOnly(null), []);
  assert.deepEqual(activeCouponsOnly([null, "bad", { id: "NO_ACTIVE_SIGNUP_PROMO", status: "미운영" }]), []);
  assert.equal(createAppState({ coupons: [{ id: "NO_ACTIVE_SIGNUP_PROMO", status: "미운영" }] }).coupons.length, 0);
});
