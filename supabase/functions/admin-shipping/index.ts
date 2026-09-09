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
import { rpc, serviceSelect, sessionUser } from "../_shared/supabase.ts";

type Role = "owner_admin" | "store_manager" | "inventory_manager" | "cs_manager" | "payments_manager" | "customer";
// Keep this authority order stable because contract tests also document the
// externally reviewed least-privilege shipping role set.
const SHIPPING_ROLES = new Set<Role>(["owner_admin", "cs_manager", "store_manager"]);
const SHIPPING_STATUSES = new Set(["shipping_ready", "shipped", "delivered"]);

async function rolesFor(userId: string): Promise<Role[]> {
  const params = new URLSearchParams({ select: "role", user_id: `eq.${userId}`, limit: "20" });
  const rows = await serviceSelect<Array<{ role?: Role }>>(`/rest/v1/user_roles?${params}`);
  return rows.map((row) => row.role).filter((role): role is Role => Boolean(role));
}

function canManageShipping(roles: Role[]): boolean {
  return roles.some((role) => SHIPPING_ROLES.has(role));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try { return optionsResponse(req); } catch (error) { return publicErrorResponse(req, error); }
  }

  try {
    assertAllowedOrigin(req);
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");

    const user = await sessionUser(req);
    if (req.headers.has("authorization") && !user) {
      throw new HttpError(401, "AUTH_REQUIRED", "관리자 로그인이 필요합니다.");
    }
    if (!user?.id) throw new HttpError(401, "AUTH_REQUIRED", "관리자 로그인이 필요합니다.");

    const roles = await rolesFor(user.id);
    if (!canManageShipping(roles)) {
      throw new HttpError(403, "ADMIN_ACCESS_DENIED", "배송 정보를 변경할 권한이 없습니다.");
    }
    await enforceRateLimit(req, "admin_shipping_update", user.id, 120, 300, 300);

    const body = await readJson(req, 16 * 1024);
    const orderId = cleanString(body.orderId, 36).toLowerCase();
    const status = cleanString(body.status, 30).toLowerCase();
    if (!isUuid(orderId) || !SHIPPING_STATUSES.has(status)) {
      throw new HttpError(400, "INVALID_REQUEST", "주문 또는 배송 상태를 확인해 주세요.");
    }

    const carrier = cleanString(body.carrier, 40);
    const trackingNumber = cleanString(body.trackingNumber, 80);
    if (status === "shipped" && (!carrier || !trackingNumber)) {
      throw new HttpError(400, "SHIPPING_TRACKING_REQUIRED", "발송 처리에는 택배사와 송장번호가 필요합니다.");
    }

    const result = await rpc("admin_update_shipping_v1", {
      p_actor_user_id: user.id,
      p_order_id: orderId,
      p_target_status: status,
      p_shipping_carrier: carrier || null,
      p_tracking_number: trackingNumber || null,
    });
    return jsonResponse(req, { order: result });
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("admin-shipping", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "배송 정보를 처리하지 못했습니다.");
  }
});
