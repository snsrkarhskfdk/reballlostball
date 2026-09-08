import { HttpError, cleanString } from "../_shared/core.ts";
import {
  assertAllowedOrigin,
  jsonResponse,
  optionsResponse,
  publicErrorResponse,
  safeLog,
} from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/security.ts";
import { serviceSelect, sessionUser } from "../_shared/supabase.ts";

type Role = "customer" | "cs_manager" | "inventory_manager" | "payments_manager" | "store_manager" | "owner_admin";
type AnyRow = Record<string, unknown>;
type OrderScope = "orders" | "shipping";

const ORDER_ROLES = new Set<Role>(["cs_manager", "payments_manager", "store_manager", "owner_admin"]);
const ORDER_PII_ROLES = new Set<Role>(["cs_manager", "store_manager", "owner_admin"]);
const SHIPPING_ROLES = new Set<Role>(["cs_manager", "store_manager", "owner_admin"]);
const PAYMENT_ROLES = new Set<Role>(["payments_manager", "owner_admin"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHIPPING_STATUSES = "in.(paid,shipping_ready,shipped,delivered)";

async function rolesFor(userId: string): Promise<Role[]> {
  const params = new URLSearchParams({ select: "role", user_id: `eq.${userId}`, limit: "20" });
  const rows = await serviceSelect<Array<{ role?: Role }>>(`/rest/v1/user_roles?${params}`);
  return rows.map((row) => row.role).filter((role): role is Role => Boolean(role));
}

function hasAny(roles: Role[], allowed: Set<Role>): boolean {
  return roles.some((role) => allowed.has(role));
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function orderScope(value: string | null): OrderScope {
  return value === "shipping" ? "shipping" : "orders";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try { return optionsResponse(req); } catch (error) { return publicErrorResponse(req, error); }
  }

  try {
    assertAllowedOrigin(req);
    if (req.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");

    const user = await sessionUser(req);
    if (!user?.id) throw new HttpError(401, "ADMIN_SESSION_REQUIRED", "관리자 로그인이 필요합니다.");
    const roles = await rolesFor(user.id);
    if (!hasAny(roles, ORDER_ROLES)) {
      throw new HttpError(403, "ADMIN_ACCESS_DENIED", "주문 정보를 조회할 권한이 없습니다.");
    }

    const url = new URL(req.url);
    const scope = orderScope(url.searchParams.get("scope"));
    if (scope === "shipping" && !hasAny(roles, SHIPPING_ROLES)) {
      throw new HttpError(403, "ADMIN_ACCESS_DENIED", "배송 정보를 조회할 권한이 없습니다.");
    }
    await enforceRateLimit(req, `admin_orders_page_${scope}`, user.id, 240, 300, 300);

    const page = boundedInteger(url.searchParams.get("page"), 1, 1, 100000);
    const pageSize = boundedInteger(url.searchParams.get("pageSize"), 50, 20, 100);
    const offset = (page - 1) * pageSize;
    const canPayments = hasAny(roles, PAYMENT_ROLES);
    const canOrderPii = hasAny(roles, ORDER_PII_ROLES);

    const safeOrderSelect = "id,order_no,status,payment_status,payment_method,payment_provider,subtotal_krw,shipping_krw,discount_krw,refund_amount,total_krw,created_at,updated_at";
    const fullOrderSelect = `${safeOrderSelect},profile_id,address_snapshot,shipping_carrier,tracking_number,shipped_at,delivered_at,order_items(product_name,variant_name,unit_price_krw,qty,line_total_krw)`;
    const orderParams = new URLSearchParams({
      select: canOrderPii ? fullOrderSelect : safeOrderSelect,
      order: "created_at.desc",
      limit: String(pageSize),
      offset: String(offset),
    });
    if (scope === "shipping") orderParams.set("status", SHIPPING_STATUSES);

    const orders = await serviceSelect<AnyRow[]>(`/rest/v1/orders?${orderParams}`);
    const orderIds = orders.map((row) => cleanString(row.id, 36).toLowerCase()).filter((id) => UUID_PATTERN.test(id));

    let payments: AnyRow[] = [];
    let noteEvents: AnyRow[] = [];
    if (orderIds.length) {
      const paymentParams = new URLSearchParams({
        select: "order_id,provider,method,status,requested_amount,approved_amount,canceled_amount,approved_at,canceled_at,reconcile_attempts,last_reconcile_error,transaction_id,approval_no",
        order: "created_at.desc",
        limit: String(Math.min(500, pageSize * 3)),
        order_id: `in.(${orderIds.join(",")})`,
      });
      const noteParams = new URLSearchParams({
        select: "order_id,event_type,payload_json,actor_user_id,created_at",
        event_type: "eq.admin_note",
        order: "created_at.desc",
        limit: String(Math.min(500, pageSize * 5)),
        order_id: `in.(${orderIds.join(",")})`,
      });
      [payments, noteEvents] = await Promise.all([
        serviceSelect<AnyRow[]>(`/rest/v1/payments?${paymentParams}`),
        canOrderPii ? serviceSelect<AnyRow[]>(`/rest/v1/order_events?${noteParams}`) : Promise.resolve([]),
      ]);
    }

    const paymentMap = new Map(payments.map((payment) => {
      const safePayment = canPayments ? payment : {
        order_id: payment.order_id,
        method: payment.method,
        status: payment.status,
        requested_amount: payment.requested_amount,
        approved_amount: payment.approved_amount,
        canceled_amount: payment.canceled_amount,
        approved_at: payment.approved_at,
        canceled_at: payment.canceled_at,
      };
      return [String(payment.order_id), safePayment];
    }));
    const notes = new Map<string, AnyRow[]>();
    for (const event of noteEvents) {
      const id = String(event.order_id || "");
      if (!notes.has(id)) notes.set(id, []);
      if ((notes.get(id)?.length || 0) < 5) notes.get(id)?.push(event);
    }
    const cancelableStatuses = new Set(["payment_auth_started", "waiting_for_deposit", "paid", "partially_canceled"]);

    return jsonResponse(req, {
      roles,
      canPayments,
      canOrderPii,
      scope,
      page,
      pageSize,
      hasMore: orders.length === pageSize,
      orders: orders.map((order) => ({
        ...order,
        piiRedacted: !canOrderPii,
        payment: paymentMap.get(String(order.id)) || null,
        notes: canOrderPii ? notes.get(String(order.id)) || [] : [],
        canCancel: canPayments && cancelableStatuses.has(String(order.status)),
      })),
    });
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("admin-orders-page", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "주문 정보를 불러오지 못했습니다.");
  }
});
