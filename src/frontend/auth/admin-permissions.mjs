export const ADMIN_ROLES = Object.freeze([
  "owner_admin",
  "inventory_manager",
  "payments_manager",
  "cs_manager",
]);

const TAB_ROLES = Object.freeze({
  dashboard: ADMIN_ROLES,
  orders: ["owner_admin", "cs_manager"],
  product: ["owner_admin", "inventory_manager"],
  returns: ["owner_admin", "cs_manager"],
  inquiry: ["owner_admin", "cs_manager"],
  coupon: ["owner_admin", "payments_manager"],
  pos: ["owner_admin", "payments_manager"],
  settlement: ["owner_admin", "payments_manager"],
  customer: ["owner_admin", "cs_manager"],
  review: ["owner_admin", "cs_manager"],
  settings: ["owner_admin"],
});

function roleSet(roles) {
  return new Set(Array.isArray(roles) ? roles : []);
}

export function hasAdminRole(roles) {
  const current = roleSet(roles);
  return ADMIN_ROLES.some((role) => current.has(role));
}

export function canAccessAdminTab(roles, tab) {
  const allowed = TAB_ROLES[tab];
  if (!allowed) return false;
  const current = roleSet(roles);
  return allowed.some((role) => current.has(role));
}

export function firstAllowedAdminTab(roles) {
  return Object.keys(TAB_ROLES).find((tab) => canAccessAdminTab(roles, tab)) ?? "";
}

export function requireAdminTab(roles, tab) {
  if (!canAccessAdminTab(roles, tab)) throw new Error("이 작업을 수행할 관리자 권한이 없습니다.");
  return true;
}

export { TAB_ROLES };
