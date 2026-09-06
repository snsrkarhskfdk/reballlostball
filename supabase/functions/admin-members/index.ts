import { HttpError, cleanString, isUuid } from "../_shared/core.ts";
import {
  assertAllowedOrigin,
  jsonResponse,
  optionsResponse,
  publicErrorResponse,
  readJson,
  safeLog,
} from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/security.ts";
import { authAdmin, rpc, serviceSelect, sessionUser } from "../_shared/supabase.ts";

type ProfileRow = {
  id: string;
  login_id?: string | null;
  email?: string | null;
  auth_email?: string | null;
  name?: string | null;
  phone?: string | null;
  marketing_email?: boolean | null;
  marketing_sms?: boolean | null;
  created_at?: string | null;
};

type OrderSummaryRow = { profile_id?: string | null; total_krw?: number | null };
type RoleRow = { user_id?: string | null; role?: string | null };
type AuthUser = {
  id?: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
};

const ALLOWED_ROLES = new Set([
  "customer",
  "cs_manager",
  "inventory_manager",
  "payments_manager",
  "store_manager",
  "owner_admin",
]);

async function actorRoles(userId: string): Promise<string[]> {
  const params = new URLSearchParams({ select: "role", user_id: `eq.${userId}`, limit: "20" });
  const rows = await serviceSelect<Array<{ role?: string }>>(`/rest/v1/user_roles?${params}`);
  return rows.map((row) => cleanString(row.role, 40)).filter(Boolean);
}

function fetchProfiles(): Promise<ProfileRow[]> {
  const params = new URLSearchParams({
    select: "id,login_id,email,auth_email,name,phone,marketing_email,marketing_sms,created_at",
    order: "created_at.desc",
    limit: "500",
  });
  return serviceSelect<ProfileRow[]>(`/rest/v1/profiles?${params}`);
}

async function fetchOrders(): Promise<OrderSummaryRow[]> {
  const params = new URLSearchParams({ select: "profile_id,total_krw", limit: "5000" });
  try { return await serviceSelect<OrderSummaryRow[]>(`/rest/v1/orders?${params}`); } catch { return []; }
}

async function fetchRoles(): Promise<RoleRow[]> {
  const params = new URLSearchParams({ select: "user_id,role", limit: "5000" });
  return serviceSelect<RoleRow[]>(`/rest/v1/user_roles?${params}`);
}

async function fetchAuthUsers(): Promise<AuthUser[]> {
  const { response, payload } = await authAdmin("/auth/v1/admin/users?page=1&per_page=500", { method: "GET" });
  if (!response.ok) throw new HttpError(502, "AUTH_USERS_UNAVAILABLE", "회원 계정을 불러오지 못했습니다.");
  return Array.isArray(payload.users) ? payload.users as AuthUser[] : [];
}

async function readMembers(canManageRoles: boolean) {
  const [profiles, orders, roles, authUsers] = await Promise.all([
    fetchProfiles(), fetchOrders(), fetchRoles(), fetchAuthUsers(),
  ]);
  const profileMap = new Map(profiles.map((row) => [row.id, row]));
  const orderTotals = new Map<string, { count: number; totalKrw: number }>();
  for (const order of orders) {
    if (!order.profile_id) continue;
    const current = orderTotals.get(order.profile_id) || { count: 0, totalKrw: 0 };
    current.count += 1;
    current.totalKrw += Number(order.total_krw) || 0;
    orderTotals.set(order.profile_id, current);
  }
  const roleMap = new Map<string, string[]>();
  for (const row of roles) {
    if (!row.user_id || !row.role) continue;
    const list = roleMap.get(row.user_id) || [];
    list.push(row.role);
    roleMap.set(row.user_id, list);
  }
  const members = authUsers.map((authUser) => {
    const id = cleanString(authUser.id, 64);
    const profile = profileMap.get(id) || {} as ProfileRow;
    const totals = orderTotals.get(id) || { count: 0, totalKrw: 0 };
    return {
      id,
      loginId: profile.login_id || "",
      email: profile.email || authUser.email || "",
      authEmail: profile.auth_email || authUser.email || "",
      name: profile.name || "",
      phone: profile.phone || "",
      marketingEmail: Boolean(profile.marketing_email),
      marketingSms: Boolean(profile.marketing_sms),
      createdAt: profile.created_at || authUser.created_at || "",
      lastSignInAt: authUser.last_sign_in_at || "",
      banned: Boolean(authUser.banned_until),
      orderCount: totals.count,
      totalKrw: totals.totalKrw,
      roles: (roleMap.get(id) || ["customer"]).sort(),
    };
  });
  return { members, canManageRoles };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try { return optionsResponse(req); } catch (error) { return publicErrorResponse(req, error); }
  }
  try {
    assertAllowedOrigin(req);
    if (!new Set(["GET", "POST"]).has(req.method)) {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");
    }
    const user = await sessionUser(req);
    if (!user) throw new HttpError(401, "AUTH_REQUIRED", "관리자 로그인이 필요합니다.");
    await enforceRateLimit(req, "admin_members", user.id, 40, 300, 300);
    const roles = await actorRoles(user.id);
    const canRead = roles.some((role) => role === "owner_admin" || role === "cs_manager");
    const canManageRoles = roles.includes("owner_admin");
    if (!canRead) throw new HttpError(403, "ADMIN_ACCESS_DENIED", "회원 정보를 조회할 권한이 없습니다.");

    if (req.method === "GET") return jsonResponse(req, await readMembers(canManageRoles));

    if (!canManageRoles) throw new HttpError(403, "OWNER_ACCESS_REQUIRED", "권한 변경은 대표 관리자만 가능합니다.");
    const body = await readJson(req, 16 * 1024);
    const action = cleanString(body.action, 40);
    if (action !== "set_roles") throw new HttpError(400, "INVALID_ADMIN_ACTION", "관리자 작업을 확인해 주세요.");
    const targetUserId = cleanString(body.userId, 64);
    if (!isUuid(targetUserId)) throw new HttpError(400, "INVALID_USER_ID", "회원 계정을 확인해 주세요.");
    const requestedRoles = Array.isArray(body.roles)
      ? [...new Set(body.roles.map((role) => cleanString(role, 40)).filter(Boolean))]
      : [];
    if (requestedRoles.some((role) => !ALLOWED_ROLES.has(role))) {
      throw new HttpError(400, "INVALID_ROLE", "지원하지 않는 권한이 포함되어 있습니다.");
    }
    const updatedRoles = await rpc<string[]>("admin_set_user_roles_v1", {
      p_actor_user_id: user.id,
      p_target_user_id: targetUserId,
      p_roles: requestedRoles,
    });
    return jsonResponse(req, { userId: targetUserId, roles: updatedRoles });
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("admin-members", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "회원 정보를 처리하지 못했습니다.");
  }
});
