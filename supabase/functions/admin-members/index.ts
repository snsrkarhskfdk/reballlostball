import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://reballlostball.com",
  "https://www.reballlostball.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host.endsWith(".vercel.app") && host.includes("reballlostball");
  } catch {
    return false;
  }
}

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "https://reballlostball.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
    "Connection": "keep-alive",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(req),
  });
}

function parseJsonKey(envName: string): string {
  const raw = Deno.env.get(envName);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    const firstValue = Object.values(parsed)[0];
    return typeof parsed.default === "string" ? parsed.default : typeof firstValue === "string" ? firstValue : "";
  } catch {
    return "";
  }
}

function publishableKey(): string {
  return parseJsonKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
}

function secretKey(): string {
  return parseJsonKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

function publishableHeaders(key: string, token?: string): HeadersInit {
  const headers: Record<string, string> = { apikey: key };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function serviceHeaders(key: string): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

async function getSessionUser(req: Request): Promise<{ id: string } | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const key = publishableKey();
  if (!key) throw new Error("Missing Supabase publishable key");

  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: publishableHeaders(key, token),
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? { id: user.id } : null;
}

async function isOwnerAdmin(userId: string): Promise<boolean> {
  const key = secretKey();
  if (!key) throw new Error("Missing Supabase secret key");

  const params = new URLSearchParams({
    select: "role",
    user_id: `eq.${userId}`,
    role: "eq.owner_admin",
    limit: "1",
  });
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/user_roles?${params}`, {
    headers: serviceHeaders(key),
  });
  if (!response.ok) throw new Error("Role lookup failed");
  const rows = await response.json().catch(() => []);
  return rows.length > 0;
}

async function fetchProfiles(): Promise<any[]> {
  const key = secretKey();
  if (!key) throw new Error("Missing Supabase secret key");

  const params = new URLSearchParams({
    select: "id,login_id,email,auth_email,name,phone,marketing_email,marketing_sms,created_at",
    order: "created_at.desc",
    limit: "200",
  });
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/profiles?${params}`, {
    headers: serviceHeaders(key),
  });
  if (!response.ok) throw new Error("Profile lookup failed");
  return response.json();
}

async function fetchOrders(): Promise<any[]> {
  const key = secretKey();
  if (!key) throw new Error("Missing Supabase secret key");

  const params = new URLSearchParams({
    select: "profile_id,total_krw",
    limit: "1000",
  });
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/orders?${params}`, {
    headers: serviceHeaders(key),
  });
  if (!response.ok) return [];
  return response.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "GET") {
    return jsonResponse(req, { message: "Method not allowed" }, 405);
  }

  try {
    const user = await getSessionUser(req);
    if (!user) return jsonResponse(req, { message: "Admin session required" }, 401);

    const allowed = await isOwnerAdmin(user.id);
    if (!allowed) return jsonResponse(req, { message: "Admin access denied" }, 403);

    const [profiles, orders] = await Promise.all([fetchProfiles(), fetchOrders()]);
    const orderTotals = new Map<string, { count: number; totalKrw: number }>();
    for (const order of orders) {
      if (!order.profile_id) continue;
      const current = orderTotals.get(order.profile_id) || { count: 0, totalKrw: 0 };
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
    console.error("admin-members failed", error);
    return jsonResponse(req, { message: "Admin member lookup failed" }, 500);
  }
});
