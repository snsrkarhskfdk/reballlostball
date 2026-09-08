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
  status?: string | null;
  total_krw?: number | null;
  refund_amount?: number | null;
};

const PURCHASE_STATUSES = new Set([
  "paid",
  "partially_canceled",
  "shipping_ready",
  "shipped",
  "delivered",
]);
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

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

async function pagedSelect<T>(
  table: string,
  select: string,
  order = "",
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      select,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (order) params.set("order", order);
    const batch = await serviceSelect<T[]>(`/rest/v1/${table}?${params}`);
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function fetchProfiles(): Promise<{ rows: ProfileRow[]; truncated: boolean }> {
  return pagedSelect<ProfileRow>(
    "profiles",
    "id,login_id,email,auth_email,name,phone,marketing_email,marketing_sms,created_at",
    "created_at.desc",
  );
}

async function fetchOrders(): Promise<{ rows: OrderSummaryRow[]; truncated: boolean }> {
  try {
    return await pagedSelect<OrderSummaryRow>(
      "orders",
      "profile_id,status,total_krw,refund_amount",
      "created_at.desc",
    );
  } catch {
    return { rows: [], truncated: false };
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

    const [profileResult, orderResult] = await Promise.all([
      fetchProfiles(),
      fetchOrders(),
    ]);
    const orderTotals = new Map<string, { count: number; totalKrw: number }>();
    for (const order of orderResult.rows) {
      if (!order.profile_id || !PURCHASE_STATUSES.has(String(order.status || ""))) continue;
      const gross = Number(order.total_krw) || 0;
      const refunded = Math.max(0, Number(order.refund_amount) || 0);
      const net = Math.max(0, gross - refunded);
      if (net <= 0) continue;
      const current = orderTotals.get(order.profile_id) ||
        { count: 0, totalKrw: 0 };
      current.count += 1;
      current.totalKrw += net;
      orderTotals.set(order.profile_id, current);
    }

    const members = profileResult.rows.map((profile) => {
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

    return jsonResponse(req, {
      members,
      truncated: profileResult.truncated || orderResult.truncated,
    });
  } catch (error) {
    if (!(error instanceof HttpError)) {
      safeLog("admin-members", req, "UNEXPECTED_ERROR");
    }
    return publicErrorResponse(req, error, "회원 정보를 불러오지 못했습니다.");
  }
});
