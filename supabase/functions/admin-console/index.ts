import { HttpError, cleanString } from "../_shared/core.ts";
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

type Role = "customer" | "cs_manager" | "inventory_manager" | "payments_manager" | "store_manager" | "owner_admin";
type AnyRow = Record<string, unknown>;

const ADMIN_ROLES = new Set<Role>(["cs_manager", "inventory_manager", "payments_manager", "store_manager", "owner_admin"]);
const ORDER_ROLES = new Set<Role>(["cs_manager", "payments_manager", "store_manager", "owner_admin"]);
const PRODUCT_ROLES = new Set<Role>(["inventory_manager", "store_manager", "owner_admin"]);
const PAYMENT_ROLES = new Set<Role>(["payments_manager", "owner_admin"]);
const MEMBER_ROLES = new Set<Role>(["cs_manager", "owner_admin"]);

async function rolesFor(userId: string): Promise<Role[]> {
  const params = new URLSearchParams({
    select: "role",
    user_id: `eq.${userId}`,
    limit: "20",
  });
  const rows = await serviceSelect<Array<{ role?: Role }>>(`/rest/v1/user_roles?${params}`);
  return rows.map((row) => row.role).filter((role): role is Role => Boolean(role));
}

function hasAny(roles: Role[], allowed: Set<Role>): boolean {
  return roles.some((role) => allowed.has(role));
}

function requireAny(roles: Role[], allowed: Set<Role>, message = "관리자 권한이 필요합니다."): void {
  if (!hasAny(roles, allowed)) throw new HttpError(403, "ADMIN_ACCESS_DENIED", message);
}

function requireOwner(roles: Role[]): void {
  if (!roles.includes("owner_admin")) throw new HttpError(403, "OWNER_ACCESS_DENIED", "대표 관리자 권한이 필요합니다.");
}

function kstDayStartIso(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const utcMs = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

async function dashboardView(roles: Role[]): Promise<AnyRow> {
  requireAny(roles, ADMIN_ROLES);
  const [orders, payments, variants] = await Promise.all([
    serviceSelect<AnyRow[]>(`/rest/v1/orders?select=id,order_no,status,payment_status,total_krw,created_at,updated_at&order=created_at.desc&limit=500`),
    serviceSelect<AnyRow[]>(`/rest/v1/payments?select=order_id,status,approved_amount,canceled_amount,approved_at,canceled_at,last_reconcile_error,reconcile_attempts&order=created_at.desc&limit=500`),
    serviceSelect<AnyRow[]>(`/rest/v1/product_variants?select=id,sku,stock_qty,active,product_id&active=eq.true&limit=1200`),
  ]);
  const start = new Date(kstDayStartIso()).getTime();
  const paidToday = payments.filter((p) => p.status === "done" && new Date(String(p.approved_at || 0)).getTime() >= start);
  const refundsToday = payments.filter((p) => Number(p.canceled_amount || 0) > 0 && new Date(String(p.canceled_at || 0)).getTime() >= start);
  const grossTodayKrw = paidToday.reduce((sum, p) => sum + Number(p.approved_amount || 0), 0);
  const refundsTodayKrw = refundsToday.reduce((sum, p) => sum + Number(p.canceled_amount || 0), 0);
  const pendingShipping = orders.filter((o) => ["paid", "shipping_ready", "shipped"].includes(String(o.status))).length;
  const lowStock = variants.filter((v) => Number(v.stock_qty || 0) <= 5).length;
  const outOfStock = variants.filter((v) => Number(v.stock_qty || 0) <= 0).length;
  const paymentAlerts = payments.filter((p) => cleanString(p.last_reconcile_error, 500) || Number(p.reconcile_attempts || 0) >= 5).length;
  return {
    metrics: {
      paidTodayCount: paidToday.length,
      grossTodayKrw,
      refundsTodayKrw,
      netTodayKrw: grossTodayKrw - refundsTodayKrw,
      pendingShipping,
      lowStock,
      outOfStock,
      paymentAlerts,
    },
    recentOrders: orders.slice(0, 12),
  };
}

async function ordersView(roles: Role[]): Promise<AnyRow> {
  requireAny(roles, ORDER_ROLES, "주문 정보를 조회할 권한이 없습니다.");
  const orderParams = new URLSearchParams({
    select: "id,profile_id,order_no,status,payment_status,payment_method,payment_provider,subtotal_krw,shipping_krw,discount_krw,refund_amount,total_krw,address_snapshot,created_at,updated_at,shipping_carrier,tracking_number,shipped_at,delivered_at,order_items(product_name,variant_name,unit_price_krw,qty,line_total_krw)",
    order: "created_at.desc",
    limit: "250",
  });
  const [orders, payments, noteEvents] = await Promise.all([
    serviceSelect<AnyRow[]>(`/rest/v1/orders?${orderParams}`),
    serviceSelect<AnyRow[]>(`/rest/v1/payments?select=order_id,provider,method,status,requested_amount,approved_amount,canceled_amount,approved_at,canceled_at,reconcile_attempts,last_reconcile_error,transaction_id,approval_no&order=created_at.desc&limit=400`),
    serviceSelect<AnyRow[]>(`/rest/v1/order_events?select=order_id,event_type,payload_json,actor_user_id,created_at&event_type=eq.admin_note&order=created_at.desc&limit=500`),
  ]);
  const paymentMap = new Map(payments.map((p) => [String(p.order_id), p]));
  const notes = new Map<string, AnyRow[]>();
  for (const event of noteEvents) {
    const id = String(event.order_id || "");
    if (!notes.has(id)) notes.set(id, []);
    if ((notes.get(id)?.length || 0) < 5) notes.get(id)?.push(event);
  }
  const canPayments = hasAny(roles, PAYMENT_ROLES);
  return {
    canPayments,
    orders: orders.map((order) => ({
      ...order,
      payment: paymentMap.get(String(order.id)) || null,
      notes: notes.get(String(order.id)) || [],
      canCancel: canPayments && !["shipping_ready", "shipped", "delivered", "canceled", "refunded"].includes(String(order.status)),
    })),
  };
}

async function auditView(roles: Role[]): Promise<AnyRow> {
  requireOwner(roles);
  const [audit, events, profiles] = await Promise.all([
    serviceSelect<AnyRow[]>(`/rest/v1/admin_audit_logs?select=id,actor_user_id,action,table_name,row_pk,old_data,new_data,created_at&order=created_at.desc&limit=200`),
    serviceSelect<AnyRow[]>(`/rest/v1/order_events?select=id,order_id,actor_user_id,event_type,from_status,to_status,payload_json,created_at&order=created_at.desc&limit=200`),
    serviceSelect<AnyRow[]>(`/rest/v1/profiles?select=id,email,auth_email,name,login_id&limit=500`),
  ]);
  const people = Object.fromEntries(profiles.map((p) => [String(p.id), {
    name: cleanString(p.name, 120),
    email: cleanString(p.email || p.auth_email, 254),
    loginId: cleanString(p.login_id, 80),
  }]));
  return { audit, orderEvents: events, people };
}

async function settingsView(roles: Role[]): Promise<AnyRow> {
  requireOwner(roles);
  const [store, commerce, policies] = await Promise.all([
    serviceSelect<AnyRow[]>(`/rest/v1/store_profile?select=*&order=updated_at.desc&limit=1`),
    serviceSelect<AnyRow[]>(`/rest/v1/commerce_settings?select=*&singleton=eq.true&limit=1`),
    serviceSelect<AnyRow[]>(`/rest/v1/policy_versions?select=id,slug,title,body_md,effective_at,active,created_at&order=created_at.desc&limit=80`),
  ]);
  return { store: store[0] || null, commerce: commerce[0] || null, policies };
}

async function staffView(roles: Role[]): Promise<AnyRow> {
  requireOwner(roles);
  const [profiles, roleRows] = await Promise.all([
    serviceSelect<AnyRow[]>(`/rest/v1/profiles?select=id,login_id,email,auth_email,name,phone,created_at&order=created_at.desc&limit=500`),
    serviceSelect<AnyRow[]>(`/rest/v1/user_roles?select=user_id,role&limit=2000`),
  ]);
  const byUser = new Map<string, string[]>();
  for (const row of roleRows) {
    const id = String(row.user_id || "");
    if (!byUser.has(id)) byUser.set(id, []);
    byUser.get(id)?.push(String(row.role || ""));
  }
  return {
    staff: profiles
      .map((profile) => ({ ...profile, roles: byUser.get(String(profile.id)) || [] }))
      .filter((profile) => (profile.roles as string[]).some((role) => role !== "customer") || profile.email || profile.auth_email),
  };
}

async function handleGet(req: Request, roles: Role[]): Promise<Response> {
  const url = new URL(req.url);
  const view = cleanString(url.searchParams.get("view") || "dashboard", 40).toLowerCase();
  let payload: AnyRow;
  if (view === "dashboard") payload = await dashboardView(roles);
  else if (view === "orders") payload = await ordersView(roles);
  else if (view === "audit") payload = await auditView(roles);
  else if (view === "settings") payload = await settingsView(roles);
  else if (view === "staff") payload = await staffView(roles);
  else throw new HttpError(404, "VIEW_NOT_FOUND", "관리자 화면을 찾을 수 없습니다.");
  return jsonResponse(req, { ...payload, roles });
}

async function handlePost(req: Request, userId: string, roles: Role[]): Promise<Response> {
  const body = await readJson(req, 256 * 1024);
  const action = cleanString(body.action, 60);
  if (!action) throw new HttpError(400, "INVALID_ACTION", "관리자 작업을 확인해 주세요.");

  if (action === "catalogUpdate") {
    requireAny(roles, PRODUCT_ROLES, "상품을 변경할 권한이 없습니다.");
    const productId = cleanString(body.productId, 36).toLowerCase();
    if (!/^[0-9a-f-]{36}$/.test(productId)) throw new HttpError(400, "INVALID_PRODUCT", "상품을 확인해 주세요.");
    const result = await rpc("admin_catalog_update_v2", {
      p_actor_user_id: userId,
      p_product_id: productId,
      p_product_patch: body.productPatch && typeof body.productPatch === "object" ? body.productPatch : {},
      p_variants: Array.isArray(body.variants) ? body.variants : [],
    });
    return jsonResponse(req, { result });
  }

  if (action === "settingsUpdate") {
    requireOwner(roles);
    const result = await rpc("admin_update_store_settings_v2", {
      p_actor_user_id: userId,
      p_store: body.store && typeof body.store === "object" ? body.store : {},
      p_commerce: body.commerce && typeof body.commerce === "object" ? body.commerce : {},
    });
    return jsonResponse(req, { result });
  }

  if (action === "policySave") {
    requireOwner(roles);
    const result = await rpc("admin_save_policy_v2", {
      p_actor_user_id: userId,
      p_slug: cleanString(body.slug, 64),
      p_title: cleanString(body.title, 160),
      p_body_md: String(body.bodyMd || "").slice(0, 100000),
      p_effective_at: cleanString(body.effectiveAt, 80) || new Date().toISOString(),
    });
    return jsonResponse(req, { result });
  }

  if (action === "roleSet") {
    requireOwner(roles);
    const targetUserId = cleanString(body.userId, 36).toLowerCase();
    if (!/^[0-9a-f-]{36}$/.test(targetUserId)) throw new HttpError(400, "INVALID_USER", "사용자를 확인해 주세요.");
    const result = await rpc("admin_set_user_role_v2", {
      p_actor_user_id: userId,
      p_target_user_id: targetUserId,
      p_role: cleanString(body.role, 40),
      p_enabled: body.enabled === true,
    });
    return jsonResponse(req, { result });
  }

  if (action === "orderNote") {
    requireAny(roles, ORDER_ROLES, "주문 메모를 남길 권한이 없습니다.");
    const orderId = cleanString(body.orderId, 36).toLowerCase();
    if (!/^[0-9a-f-]{36}$/.test(orderId)) throw new HttpError(400, "INVALID_ORDER", "주문을 확인해 주세요.");
    const result = await rpc("admin_add_order_note_v1", {
      p_actor_user_id: userId,
      p_order_id: orderId,
      p_note: cleanString(body.note, 1000),
    });
    return jsonResponse(req, { result });
  }

  throw new HttpError(404, "ACTION_NOT_FOUND", "지원하지 않는 관리자 작업입니다.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try { return optionsResponse(req); } catch (error) { return publicErrorResponse(req, error); }
  }
  try {
    assertAllowedOrigin(req);
    if (!new Set(["GET", "POST"]).has(req.method)) throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");
    const user = await sessionUser(req);
    if (!user) throw new HttpError(401, "AUTH_REQUIRED", "관리자 로그인이 필요합니다.");
    const roles = await rolesFor(user.id);
    requireAny(roles, ADMIN_ROLES);
    await enforceRateLimit(req, "admin_console", user.id, req.method === "GET" ? 120 : 50, 300, 300);
    return req.method === "GET" ? await handleGet(req, roles) : await handlePost(req, user.id, roles);
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("admin-console", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "관리자 요청을 처리하지 못했습니다.");
  }
});
