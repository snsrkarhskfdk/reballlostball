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
type Row = Record<string, unknown>;

const ADMIN = new Set<Role>(["cs_manager","inventory_manager","payments_manager","store_manager","owner_admin"]);
const ORDER = new Set<Role>(["cs_manager","payments_manager","store_manager","owner_admin"]);
const CS = new Set<Role>(["cs_manager","store_manager","owner_admin"]);
const PAYMENT = new Set<Role>(["payments_manager","owner_admin"]);
const PRODUCT_CREATE = new Set<Role>(["inventory_manager","owner_admin"]);
const POS = new Set<Role>(["store_manager","owner_admin"]);
const REVIEW = new Set<Role>(["cs_manager","owner_admin"]);

async function rolesFor(userId: string): Promise<Role[]> {
  const params = new URLSearchParams({ select: "role", user_id: `eq.${userId}`, limit: "20" });
  const rows = await serviceSelect<Array<{role?:Role}>>(`/rest/v1/user_roles?${params}`);
  return rows.map((row) => row.role).filter((role): role is Role => Boolean(role));
}
function hasAny(roles:Role[], allowed:Set<Role>):boolean { return roles.some((role)=>allowed.has(role)); }
function requireAny(roles:Role[], allowed:Set<Role>, message="관리자 권한이 필요합니다."):void {
  if(!hasAny(roles,allowed)) throw new HttpError(403,"ADMIN_ACCESS_DENIED",message);
}

async function returnsView(roles:Role[]):Promise<Row> {
  requireAny(roles,ORDER,"취소·반품 정보를 조회할 권한이 없습니다.");
  const [requests, orders] = await Promise.all([
    serviceSelect<Row[]>(`/rest/v1/return_requests?select=id,order_id,request_type,reason,status,resolution_note,requested_by,handled_by,requested_at,handled_at,updated_at,orders(order_no,total_krw,status,payment_status,shipping_carrier,tracking_number)&order=requested_at.desc&limit=500`),
    serviceSelect<Row[]>(`/rest/v1/orders?select=id,order_no,status,payment_status,payment_method,total_krw,refund_amount,created_at,address_snapshot&status=in.(paid,partially_canceled)&order=created_at.desc&limit=500`),
  ]);
  const canCancel = hasAny(roles,PAYMENT);
  return { requests, cancelableOrders: orders.map((o)=>({...o,canCancel})), canCancel };
}
async function inquiriesView(roles:Role[]):Promise<Row> {
  requireAny(roles,CS,"고객 문의를 조회할 권한이 없습니다.");
  const inquiries = await serviceSelect<Row[]>(`/rest/v1/customer_inquiries?select=id,profile_id,guest_name,guest_email,guest_phone,category,subject,body,status,admin_reply,replied_by,replied_at,created_at,updated_at&order=created_at.desc&limit=500`);
  return { inquiries };
}
async function promoView(roles:Role[]):Promise<Row> {
  requireAny(roles,PAYMENT,"프로모션을 조회할 권한이 없습니다.");
  const benefitsPromise = serviceSelect<Row[]>(`/rest/v1/benefit_policies?select=id,name,applies_to,benefit_type,benefit_value,starts_at,ends_at,is_active&order=name.asc&limit=500`);
  const bannersPromise = roles.includes("owner_admin")
    ? serviceSelect<Row[]>(`/rest/v1/banners?select=id,title,subtitle,image_url,href,starts_at,ends_at,active,sort_order&order=sort_order.asc&limit=500`)
    : Promise.resolve([] as Row[]);
  const [benefits,banners] = await Promise.all([benefitsPromise,bannersPromise]);
  return { benefits, banners, canManageBanners: roles.includes("owner_admin") };
}
async function posView(roles:Role[]):Promise<Row> {
  requireAny(roles,POS,"POS 정보를 조회할 권한이 없습니다.");
  const devices = await serviceSelect<Row[]>(`/rest/v1/pos_devices?select=id,name,location,status,note,last_seen_at,active,created_at,updated_at&order=created_at.asc&limit=500`);
  return { devices };
}
async function settlementView(roles:Role[]):Promise<Row> {
  requireAny(roles,PAYMENT,"매출·환불 집계를 조회할 권한이 없습니다.");
  const [payments, refunds, orders] = await Promise.all([
    serviceSelect<Row[]>(`/rest/v1/payments?select=id,order_id,status,method,requested_amount,approved_amount,canceled_amount,approved_at,canceled_at,created_at&order=created_at.desc&limit=5000`),
    serviceSelect<Row[]>(`/rest/v1/payment_refunds?select=id,payment_id,cancel_reason,cancel_amount,refund_status,requested_at,completed_at&order=requested_at.desc&limit=5000`),
    serviceSelect<Row[]>(`/rest/v1/orders?select=id,order_no,total_krw,shipping_krw,refund_amount,status,payment_status,created_at&order=created_at.desc&limit=5000`),
  ]);
  const grossKrw = payments.reduce((sum,p)=>sum+Number(p.approved_amount||0),0);
  const canceledKrw = payments.reduce((sum,p)=>sum+Number(p.canceled_amount||0),0);
  const completedRefundKrw = refunds.filter((r)=>String(r.refund_status)==="completed").reduce((sum,r)=>sum+Number(r.cancel_amount||0),0);
  const orderMap = new Map(orders.map((o)=>[String(o.id),o]));
  const rows = payments.slice(0,1200).map((p)=>({ ...p, order: orderMap.get(String(p.order_id)) || null }));
  return {
    metrics: { grossKrw, canceledKrw, netKrw: grossKrw-canceledKrw, completedRefundKrw, paymentCount: payments.length, refundCount: refunds.length },
    rows,
    refunds,
  };
}
async function reviewsView(roles:Role[]):Promise<Row> {
  requireAny(roles,REVIEW,"리뷰를 조회할 권한이 없습니다.");
  const reviews = await serviceSelect<Row[]>(`/rest/v1/reviews?select=id,product_id,profile_id,rating,title,body,visible,is_sample,created_at,products(name)&order=created_at.desc&limit=500`);
  return { reviews };
}
async function brandsView(roles:Role[]):Promise<Row> {
  requireAny(roles,PRODUCT_CREATE,"상품을 등록할 권한이 없습니다.");
  const brands = await serviceSelect<Row[]>(`/rest/v1/brands?select=id,slug,name,sort_order,active&active=eq.true&order=sort_order.asc&limit=100`);
  return { brands };
}

async function handleGet(req:Request, roles:Role[]):Promise<Response> {
  const view = cleanString(new URL(req.url).searchParams.get("view") || "",40).toLowerCase();
  let payload:Row;
  if(view==="returns") payload=await returnsView(roles);
  else if(view==="inquiries") payload=await inquiriesView(roles);
  else if(view==="promo") payload=await promoView(roles);
  else if(view==="pos") payload=await posView(roles);
  else if(view==="settlement") payload=await settlementView(roles);
  else if(view==="reviews") payload=await reviewsView(roles);
  else if(view==="brands") payload=await brandsView(roles);
  else throw new HttpError(404,"VIEW_NOT_FOUND","관리자 확장 화면을 찾을 수 없습니다.");
  return jsonResponse(req,{...payload,roles});
}
async function handlePost(req:Request,userId:string):Promise<Response> {
  const body = await readJson(req,128*1024);
  const action = cleanString(body.action,60);
  const payload: Record<string, unknown> = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
    ? body.payload as Record<string, unknown>
    : {};
  if(!action) throw new HttpError(400,"INVALID_ACTION","관리자 작업을 확인해 주세요.");
  const result = await rpc("admin_ops_mutation_v1",{p_actor_user_id:userId,p_action:action,p_payload:payload});
  return jsonResponse(req,{result});
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") { try{return optionsResponse(req);}catch(error){return publicErrorResponse(req,error);} }
  try {
    assertAllowedOrigin(req);
    if(!new Set(["GET","POST"]).has(req.method)) throw new HttpError(405,"METHOD_NOT_ALLOWED","지원하지 않는 요청입니다.");
    const user=await sessionUser(req);
    if(!user) throw new HttpError(401,"AUTH_REQUIRED","관리자 로그인이 필요합니다.");
    const roles=await rolesFor(user.id);
    requireAny(roles,ADMIN);
    await enforceRateLimit(req,"admin_ops_extra",user.id,req.method==="GET"?120:60,300,300);
    return req.method==="GET" ? await handleGet(req,roles) : await handlePost(req,user.id);
  } catch(error) {
    if(!(error instanceof HttpError)) safeLog("admin-ops-extra",req,"UNEXPECTED_ERROR");
    return publicErrorResponse(req,error,"관리자 확장 요청을 처리하지 못했습니다.");
  }
});
