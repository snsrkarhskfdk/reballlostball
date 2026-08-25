class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const clean = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);
const supabaseUrl = () => String(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");

function parseJsonKey(name: string): string {
  const raw = Deno.env.get(name);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.default === "string" ? parsed.default : String(Object.values(parsed)[0] || "");
  } catch {
    return "";
  }
}

const publishableKey = () => parseJsonKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceKey = () => parseJsonKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function serviceHeaders(extra: HeadersInit = {}): Headers {
  const key = serviceKey();
  const headers = new Headers(extra);
  headers.set("apikey", key);
  if (/^[^.]+\.[^.]+\.[^.]+$/.test(key)) headers.set("Authorization", `Bearer ${key}`);
  return headers;
}

function allowedOrigins(): Set<string> {
  return new Set(
    (Deno.env.get("ALLOWED_ORIGINS") || "https://reballlostball.com,https://www.reballlostball.com,http://localhost:3000,http://127.0.0.1:3000")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function responseHeaders(req: Request): Headers {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const origin = req.headers.get("origin") || "";
  if (origin && allowedOrigins().has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Vary", "Origin");
  return headers;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(req) });
}

function assertOrigin(req: Request): void {
  const origin = req.headers.get("origin") || "";
  if (origin && !allowedOrigins().has(origin)) throw new HttpError(403, "ORIGIN_DENIED", "요청 출처를 확인할 수 없습니다.");
}

async function sessionUser(req: Request): Promise<{ id: string } | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: publishableKey(), Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.id ? { id: String(payload.id) } : null;
}

async function isAdmin(userId: string): Promise<boolean> {
  const params = new URLSearchParams({
    select: "role",
    user_id: `eq.${userId}`,
    role: "in.(owner_admin,cs_manager)",
    limit: "2",
  });
  const response = await fetch(`${supabaseUrl()}/rest/v1/user_roles?${params}`, { headers: serviceHeaders() });
  if (!response.ok) return false;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.some((row) => row.role === "owner_admin" || row.role === "cs_manager");
}

async function updateShipping(body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/admin_update_shipping_v1`, {
    method: "POST",
    headers: serviceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = clean(payload?.code, 50) || "DATABASE_REJECTED";
    throw new HttpError(response.status === 403 ? 403 : 400, code, "배송 상태를 변경하지 못했습니다.");
  }
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try {
      assertOrigin(req);
      return new Response(null, { status: 204, headers: responseHeaders(req) });
    } catch (error) {
      const e = error as HttpError;
      return json(req, { code: e.code || "ERROR", message: e.message || "요청 실패" }, e.status || 500);
    }
  }

  try {
    assertOrigin(req);
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");

    const user = await sessionUser(req);
    if (!user) throw new HttpError(401, "AUTH_REQUIRED", "관리자 로그인이 필요합니다.");
    if (!(await isAdmin(user.id))) throw new HttpError(403, "ADMIN_ACCESS_DENIED", "배송 정보를 변경할 권한이 없습니다.");

    const body = await req.json().catch(() => ({}));
    const orderId = clean(body.orderId, 36).toLowerCase();
    const status = clean(body.status, 30);
    if (!/^[0-9a-f-]{36}$/.test(orderId) || !new Set(["shipping_ready", "shipped", "delivered"]).has(status)) {
      throw new HttpError(400, "INVALID_REQUEST", "주문 또는 배송 상태를 확인해 주세요.");
    }

    const result = await updateShipping({
      p_actor_user_id: user.id,
      p_order_id: orderId,
      p_target_status: status,
      p_shipping_carrier: clean(body.carrier, 40) || null,
      p_tracking_number: clean(body.trackingNumber, 80) || null,
    });
    return json(req, { order: result });
  } catch (error) {
    const e = error as HttpError;
    return json(req, { code: e.code || "INTERNAL_ERROR", message: e.message || "배송 정보를 처리하지 못했습니다." }, e.status || 500);
  }
});
