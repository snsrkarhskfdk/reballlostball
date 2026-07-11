import test from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_ROLES,
  TAB_ROLES,
  canAccessAdminTab,
  firstAllowedAdminTab,
  hasAdminRole,
  requireAdminTab,
} from "../../src/frontend/auth/admin-permissions.mjs";

test("일반 회원과 로컬 임의 값에는 관리자 권한이 없다", () => {
  assert.equal(hasAdminRole([]), false);
  assert.equal(hasAdminRole(["customer", "관리자"]), false);
  assert.equal(firstAllowedAdminTab(["customer"]), "");
});

test("관리자 역할별 최소 권한을 분리한다", () => {
  assert.equal(canAccessAdminTab(["inventory_manager"], "product"), true);
  assert.equal(canAccessAdminTab(["inventory_manager"], "settlement"), false);
  assert.equal(canAccessAdminTab(["payments_manager"], "orders"), false);
  assert.equal(canAccessAdminTab(["payments_manager"], "settlement"), true);
  assert.equal(canAccessAdminTab(["payments_manager"], "settings"), false);
  assert.equal(canAccessAdminTab(["cs_manager"], "inquiry"), true);
  assert.equal(canAccessAdminTab(["cs_manager"], "product"), false);
  assert.equal(canAccessAdminTab(["owner_admin"], "settings"), true);
  assert.throws(() => requireAdminTab(["customer"], "orders"), /권한/);
});

test("모든 관리자 탭은 선언된 역할 행렬과 정확히 일치한다", () => {
  for (const [tab, expectedRoles] of Object.entries(TAB_ROLES)) {
    for (const role of [...ADMIN_ROLES, "customer", "forged_admin"]) {
      assert.equal(
        canAccessAdminTab([role], tab),
        expectedRoles.includes(role),
        `${role} / ${tab} 권한이 선언과 다릅니다`,
      );
    }
  }
  for (const role of ADMIN_ROLES) {
    const expectedFirst = Object.keys(TAB_ROLES).find((tab) => TAB_ROLES[tab].includes(role)) ?? "";
    assert.equal(firstAllowedAdminTab([role]), expectedFirst);
  }
  assert.equal(canAccessAdminTab(["owner_admin"], "unknown-tab"), false);
});
