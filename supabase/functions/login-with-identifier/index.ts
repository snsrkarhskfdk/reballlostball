import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://reballlostball.com",
  "https://www.reballlostball.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{3,19}$/;
const INVALID_CREDENTIALS_MESSAGE = "아이디 또는 비밀번호를 확인하세요.";

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function supabaseHeaders(key: string): HeadersInit {
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeIdentifier(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

async function resolveAuthEmail(identifier: string): Promise<string | null> {
  if (isEmailLike(identifier)) return identifier;
  if (!LOGIN_ID_PATTERN.test(identifier)) return null;

  const key = secretKey();
  if (!key) throw new Error("Missing Supabase secret key");

  const params = new URLSearchParams({
    select: "auth_email",
    login_id: `eq.${identifier}`,
    limit: "1",
  });

  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/profiles?${params}`, {
    headers: supabaseHeaders(key),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("login profile lookup failed", response.status, detail);
    throw new Error("Profile lookup failed");
  }

  const rows = await response.json().catch(() => []);
  return rows?.[0]?.auth_email || null;
}

async function passwordGrant(email: string, password: string): Promise<Response> {
  const key = publishableKey();
  if (!key) throw new Error("Missing Supabase publishable key");

  return fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...supabaseHeaders(key),
    },
    body: JSON.stringify({ email, password }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { message: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const identifier = normalizeIdentifier(body.identifier);
    const password = String(body.password || "");

    if (!identifier || !password) {
      return jsonResponse(req, { message: INVALID_CREDENTIALS_MESSAGE }, 400);
    }

    const email = await resolveAuthEmail(identifier);
    if (!email) {
      return jsonResponse(req, { message: INVALID_CREDENTIALS_MESSAGE }, 400);
    }

    const authResponse = await passwordGrant(email, password);
    const authPayload = await authResponse.json().catch(() => ({}));

    if (!authResponse.ok) {
      return jsonResponse(req, { message: INVALID_CREDENTIALS_MESSAGE }, 400);
    }

    return jsonResponse(req, authPayload);
  } catch (error) {
    console.error("login-with-identifier failed", error);
    return jsonResponse(req, { message: "로그인 처리 중 오류가 발생했습니다." }, 500);
  }
});
