import test from "node:test";
import assert from "node:assert/strict";
import { activeCouponsOnly, couponPeriodExpired, createAppState } from "../../src/frontend/core/state.mjs";

test("retired and expired promotions never enter customer coupon state", () => {
  const now = new Date("2026-09-09T03:00:00.000Z");
  const coupons = [
    { id: "NO_ACTIVE_SIGNUP_PROMO", status: "미운영" },
    { id: "WELCOME3000", status: "사용 가능", period: "2026.06.04 - 2026.06.30" },
    { id: "expired-1", status: "expired" },
    { id: "expired-by-date", status: "사용 가능", period: "2026.08.01 - 2026.08.31" },
    { id: "active-1", status: "사용 가능", period: "2026.09.01 - 2026.09.30" },
  ];
  assert.deepEqual(activeCouponsOnly(coupons, now), [
    { id: "active-1", status: "사용 가능", period: "2026.09.01 - 2026.09.30" },
  ]);
  assert.equal(couponPeriodExpired(coupons[3], now), true);
});

test("blocked or malformed storage fallback cannot create a phantom coupon count", () => {
  assert.deepEqual(activeCouponsOnly(null), []);
  assert.deepEqual(activeCouponsOnly([null, "bad", { id: "NO_ACTIVE_SIGNUP_PROMO", status: "미운영" }]), []);
  assert.equal(createAppState({ coupons: [{ id: "WELCOME3000", status: "사용 가능", period: "2026.06.04 - 2026.06.30" }] }).coupons.length, 0);
});
