import { HttpError, cleanString } from "../_shared/core.ts";
import {
  assertAllowedOrigin,
  jsonResponse,
  optionsResponse,
  publicErrorResponse,
  safeLog,
} from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/security.ts";
import { rpc, serviceSelect, sessionUser } from "../_shared/supabase.ts";

type Role = "customer" | "cs_manager" | "inventory_manager" | "payments_manager" | "store_manager" | "owner_admin";
type AnyRow = Record<string, unknown>;
type OrderScope = "orders" | "shipping" | "returns";

const ORDER_ROLES = new Set<Role>(["cs_manager", "payments_manager", "store_manager", "owner_admin"]);
const ORDER_PII_ROLES = new Set<Role>(["cs_manager", "store_manager", "owner_admin"]);
const SHIPPING_ROLES = new Set<Role>(["cs_manager", "store_manager", "owner_admin"]);
const PAYMENT_ROLES = new Set<Role>(["payments_manager", "owner_admin"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXACT_ORDER_PATTERN = /^[A-Z0-9_-]{6,64}$/;
const SHIPPING_STATUSES = "in.(paid,shipping_ready,shipped,delivered)";
const RETURN_STATUSES = "in.(paid,partially_canceled,shipping_ready,shipped,delivered)";
const ORDER_STATUSES = new Set([
  "payment_ready", "payment_auth_started", "waiting_for_deposit", "paid", "payment_failed", "cancel_requested",
  "partially_canceled", "canceled", "shipping_ready", "shipped", "delivered", "refunded",
]);
const SEARCH_SCAN_CHUNK = 500;
const SEARCH_SCAN_MAX = 10000;

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
  if (value === "shipping" || value === "returns") return value;
  return "orders";
}

function normalizedSearch(value: string | null): string {
  return cleanString(value, 120).trim().toLocaleLowerCase("ko-KR");
}

function orderSearchText(order: AnyRow, canOrderPii: boolean): string {
  const safeParts = [order.order_no, order.status, order.payment_status, order.payment_method, order.payment_provider, order.total_krw];
  if (!canOrderPii) return safeParts.join(" ").toLocaleLowerCase("ko-KR");
  return [
    ...safeParts,
    JSON.stringify(order.address_snapshot || {}),
    JSON.stringify(order.order_items || []),
    order.shipping_carrier,
    order.tracking_number,
  ].join(" ").toLocaleLowerCase("ko-KR");
}

function applyScopeStatus(params: URLSearchParams, scope: OrderScope, requestedStatus: string): void {
  if (scope === "shipping") {
    params.set("status", SHIPPING_STATUSES);
    return;
  }
  if (scope === "returns") {
    params.set("status", RETURN_STATUSES);
    return;
  }
  if (requestedStatus && ORDER_STATUSES.has(requestedStatus)) params.set("status", `eq.${requestedStatus}`);
}

async function exactOrderSearch({ select, scope, requestedStatus, query }: {
  select: string;
  scope: OrderScope;
  requestedStatus: string;
  query: string;
}): Promise<AnyRow[] | null> {
  const candidate = query.toUpperCase();
  if (!EXACT_ORDER_PATTERN.test(candidate)) return null;
  const params = new URLSearchParams({ select, order: "created_at.desc", limit: "2", order_no: `eq.${candidate}` });
  applyScopeStatus(params, scope, requestedStatus);
  return serviceSelect<AnyRow[]>(`/rest/v1/orders?${params}`);
}

async function pagedOrders({
  select, scope, requestedStatus, query, page, pageSize, canOrderPii,
}: {
  select: string;
  scope: OrderScope;
  requestedStatus: string;
  query: string;
  page: number;
  pageSize: number;
  canOrderPii: boolean;
}): Promise<{ orders: AnyRow[]; hasMore: boolean; searchTruncated?: boolean }> {
  const pageOffset = (page - 1) * pageSize;
  if (!query) {
    const params = new URLSearchParams({ select, order: "created_at.desc", limit: String(pageSize + 1), offset: String(pageOffset) });
    applyScopeStatus(params, scope, requestedStatus);
    const fetched = await serviceSelect<AnyRow[]>(`/rest/v1/orders?${params}`);
    return { orders: fetched.slice(0, pageSize), hasMore: fetched.length > pageSize };
  }

  const exact = await exactOrderSearch({ select, scope, requestedStatus, query });
  if (exact?.length) {
    return { orders: page === 1 ? exact.slice(0, pageSize) : [], hasMore: false };
  }

  const neededMatches = pageOffset + pageSize + 1;
  const matches: AnyRow[] = [];
  let scanned = 0;
  let exhausted = false;
  while (scanned < SEARCH_SCAN_MAX && matches.length < neededMatches) {
    const params = new URLSearchParams({ select, order: "created_at.desc", limit: String(SEARCH_SCAN_CHUNK), offset: String(scanned) });
    applyScopeStatus(params, scope, requestedStatus);
    const chunk = await serviceSelect<AnyRow[]>(`/rest/v1/orders?${params}`);
    for (const order of chunk) {
      if (orderSearchText(order, canOrderPii).includes(query)) matches.push(order);
      if (matches.length >= neededMatches) break;
    }
    scanned += chunk.length;
    if (chunk.length < SEARCH_SCAN_CHUNK) {
      exhausted = true;
      break;
    }
  }

  const requestedPage = matches.slice(pageOffset, pageOffset + pageSize);
  if (!exhausted && scanned >= SEARCH_SCAN_MAX && requestedPage.length === 0) {
    throw new HttpError(413, "ORDER_SEARCH_TOO_BROAD", "10,000건 이후의 일반 텍스트 검색은 주문번호를 정확히 입력해 주세요.");
  }
  return {
    orders: requestedPage,
    hasMore: matches.length > pageOffset + pageSize,
    searchTruncated: !exhausted && scanned >= SEARCH_SCAN_MAX,
  };
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
    if (!hasAny(roles, ORDER_ROLES)) throw new HttpError(403, "ADMIN_ACCESS_DENIED", "주문 정보를 조회할 권한이 없습니다.");

    const url = new URL(req.url);
    const scope = orderScope(url.searchParams.get("scope"));
    if (scope === "shipping" && !hasAny(roles, SHIPPING_ROLES)) {
      throw new HttpError(403, "ADMIN_ACCESS_DENIED", "배송 정보를 조회할 권한이 없습니다.");
    }
    await enforceRateLimit(req, `admin_orders_page_${scope}`, user.id, 240, 300, 300);

    const page = boundedInteger(url.searchParams.get("page"), 1, 1, 100000);
    const pageSize = boundedInteger(url.searchParams.get("pageSize"), 50, 20, 100);
    const canPayments = hasAny(roles, PAYMENT_ROLES);
    const canOrderPii = hasAny(roles, ORDER_PII_ROLES);
    const requestedStatus = cleanString(url.searchParams.get("status"), 40).toLowerCase();
    const query = normalizedSearch(url.searchParams.get("q"));

    const safeOrderSelect = "id,order_no,status,payment_status,payment_method,payment_provider,subtotal_krw,shipping_krw,discount_krw,refund_amount,total_krw,created_at,updated_at";
    const fullOrderSelect = `${safeOrderSelect},profile_id,address_snapshot,shipping_carrier,tracking_number,shipped_at,delivered_at,order_items(product_name,variant_name,unit_price_krw,qty,line_total_krw)`;
    const pageResult = await pagedOrders({
      select: canOrderPii ? fullOrderSelect : safeOrderSelect,
      scope, requestedStatus, query, page, pageSize, canOrderPii,
    });
    const orders = pageResult.orders;
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
      [payments, noteEvents] = await Promise.all([
        serviceSelect<AnyRow[]>(`/rest/v1/payments?${paymentParams}`),
        canOrderPii ? rpc<AnyRow[]>("admin_order_notes_page_v1", { p_order_ids: orderIds, p_limit_per_order: 5 }) : Promise.resolve([]),
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
      notes.get(id)?.push(event);
    }
    const cancelableStatuses = new Set(["payment_auth_started", "waiting_for_deposit", "paid", "partially_canceled"]);

    return jsonResponse(req, {
      roles, canPayments, canOrderPii, scope, page, pageSize,
      hasMore: pageResult.hasMore,
      searchTruncated: pageResult.searchTruncated === true,
      query,
      status: requestedStatus,
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
