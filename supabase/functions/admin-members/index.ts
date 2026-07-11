import { HttpError } from "../_shared/core.ts";
import {
  assertAllowedOrigin,
  jsonResponse,
  optionsResponse,
  publicErrorResponse,
  safeLog,
} from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/security.ts";
import { serviceSelect, sessionUser } from "../_shared/supabase.ts";

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

type OrderSummaryRow = {
  profile_id?: string | null;
  total_krw?: number | null;
};

async function canReadMemberData(userId: string): Promise<boolean> {
  const params = new URLSearchParams({
    select: "role",
    user_id: `eq.${userId}`,
    role: "in.(owner_admin,cs_manager)",
    limit: "2",
  });
  const rows = await serviceSelect<Array<{ role?: string }>>(
    `/rest/v1/user_roles?${params}`,
  );
  return rows.some((row) =>
    row.role === "owner_admin" || row.role === "cs_manager"
  );
}

function fetchProfiles(): Promise<ProfileRow[]> {
  const params = new URLSearchParams({
    select:
      "id,login_id,email,auth_email,name,phone,marketing_email,marketing_sms,created_at",
    order: "created_at.desc",
    limit: "200",
  });
  return serviceSelect<ProfileRow[]>(`/rest/v1/profiles?${params}`);
}

async function fetchOrders(): Promise<OrderSummaryRow[]> {
  const params = new URLSearchParams({
    select: "profile_id,total_krw",
    limit: "1000",
  });
  try {
    return await serviceSelect<OrderSummaryRow[]>(`/rest/v1/orders?${params}`);
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try {
      return optionsResponse(req);
    } catch (error) {
      return publicErrorResponse(req, error);
    }
  }

  try {
    assertAllowedOrigin(req);
    if (req.method !== "GET") {
      throw new HttpError(
        405,
        "METHOD_NOT_ALLOWED",
        "지원하지 않는 요청입니다.",
      );
    }

    const user = await sessionUser(req);
    if (!user) {
      throw new HttpError(401, "AUTH_REQUIRED", "관리자 로그인이 필요합니다.");
    }
    await enforceRateLimit(req, "admin_members", user.id, 20, 300, 300);
    if (!(await canReadMemberData(user.id))) {
      throw new HttpError(
        403,
        "ADMIN_ACCESS_DENIED",
        "회원 정보를 조회할 권한이 없습니다.",
      );
    }

    const [profiles, orders] = await Promise.all([
      fetchProfiles(),
      fetchOrders(),
    ]);
    const orderTotals = new Map<string, { count: number; totalKrw: number }>();
    for (const order of orders) {
      if (!order.profile_id) continue;
      const current = orderTotals.get(order.profile_id) ||
        { count: 0, totalKrw: 0 };
      current.count += 1;
      current.totalKrw += Number(order.total_krw) || 0;
      orderTotals.set(order.profile_id, current);
    }

    const members = profiles.map((profile) => {
      const totals = orderTotals.get(profile.id) || { count: 0, totalKrw: 0 };
      return {
        id: profile.id,
        loginId: profile.login_id || "",
        email: profile.email || "",
        authEmail: profile.auth_email || "",
        name: profile.name || "",
        phone: profile.phone || "",
        marketingEmail: Boolean(profile.marketing_email),
        marketingSms: Boolean(profile.marketing_sms),
        createdAt: profile.created_at || "",
        orderCount: totals.count,
        totalKrw: totals.totalKrw,
        status: "",
      };
    });

    return jsonResponse(req, { members });
  } catch (error) {
    if (!(error instanceof HttpError)) {
      safeLog("admin-members", req, "UNEXPECTED_ERROR");
    }
    return publicErrorResponse(req, error, "회원 정보를 불러오지 못했습니다.");
  }
});
