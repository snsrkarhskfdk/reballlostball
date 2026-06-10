import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://reballlostball.com",
  "https://www.reballlostball.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{3,19}$/;
const NOT_FOUND_MESSAGE = "입력한 정보와 일치하는 회원을 찾을 수 없습니다.";

type ProfileRow = {
  login_id?: string | null;
  auth_email?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  created_at?: string | null;
};

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

function serviceHeaders(key: string): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown): string {
  return cleanString(value).toLowerCase();
}

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "";
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}${"*".repeat(Math.max(3, localPart.length - visible.length))}@${domain}`;
}

function safeRedirectTo(value: unknown): string {
  const fallback = "https://reballlostball.com/";
  const raw = cleanString(value) || fallback;
  try {
    const url = new URL(raw);
    if (!isAllowedOrigin(url.origin)) return fallback;
    url.hash = "";
    return url.toString();
  } catch {
    return fallback;
  }
}

function profileMatches(row: ProfileRow, input: { name: string; phone: string }): boolean {
  return cleanString(row.name) === input.name && normalizePhone(row.phone) === input.phone;
}

async function fetchProfiles(params: URLSearchParams): Promise<ProfileRow[]> {
  const key = secretKey();
  if (!key) throw new Error("Missing Supabase secret key");

  params.set("select", "login_id,auth_email,email,name,phone,created_at");
  params.set("limit", "10");

  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/profiles?${params}`, {
    headers: serviceHeaders(key),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("auth assist profile lookup failed", response.status, detail);
    throw new Error("Profile lookup failed");
  }

  return response.json().catch(() => []);
}

async function findProfileByIdentity(identifier: string, input: { name: string; phone: string }): Promise<ProfileRow | null> {
  const params = new URLSearchParams();

  if (isEmailLike(identifier)) {
    params.set("or", `(auth_email.eq.${identifier},email.eq.${identifier})`);
  } else {
    if (!LOGIN_ID_PATTERN.test(identifier)) return null;
    params.set("login_id", `eq.${identifier}`);
  }

  const rows = await fetchProfiles(params);
  return rows.find((row) => profileMatches(row, input)) || null;
}

async function findProfileByContact(input: { name: string; phone: string; email: string }): Promise<ProfileRow | null> {
  const params = new URLSearchParams({
    name: `eq.${input.name}`,
    or: `(auth_email.eq.${input.email},email.eq.${input.email})`,
  });

  const rows = await fetchProfiles(params);
  return rows.find((row) => profileMatches(row, input)) || null;
}

async function sendRecoveryEmail(email: string, redirectTo: string): Promise<void> {
  const key = publishableKey();
  if (!key) throw new Error("Missing Supabase publishable key");

  const url = new URL(`${Deno.env.get("SUPABASE_URL")}/auth/v1/recover`);
  url.searchParams.set("redirect_to", redirectTo);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("auth assist recovery email failed", response.status, detail);
    throw new Error("Recovery email failed");
  }
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
    const mode = cleanString(body.mode);
    const name = cleanString(body.name);
    const phone = normalizePhone(body.phone);

    if (!name || !phone) {
      return jsonResponse(req, { message: "이름과 휴대전화를 입력하세요." }, 400);
    }

    if (mode === "find-id") {
      const email = normalizeEmail(body.email);
      if (!email || !isEmailLike(email)) {
        return jsonResponse(req, { message: "가입 이메일을 입력하세요." }, 400);
      }

      const profile = await findProfileByContact({ name, phone, email });
      if (!profile) return jsonResponse(req, { message: NOT_FOUND_MESSAGE }, 404);

      return jsonResponse(req, {
        loginId: profile.login_id || profile.auth_email || profile.email || "",
        emailMasked: maskEmail(profile.auth_email || profile.email || email),
        createdAt: profile.created_at || "",
      });
    }

    if (mode === "password-reset") {
      const identifier = normalizeEmail(body.identifier);
      const profile = await findProfileByIdentity(identifier, { name, phone });
      const authEmail = profile?.auth_email || profile?.email || "";

      if (!profile || !authEmail) return jsonResponse(req, { message: NOT_FOUND_MESSAGE }, 404);

      await sendRecoveryEmail(authEmail, safeRedirectTo(body.redirectTo));

      return jsonResponse(req, {
        emailMasked: maskEmail(authEmail),
      });
    }

    return jsonResponse(req, { message: "지원하지 않는 요청입니다." }, 400);
  } catch (error) {
    console.error("auth-assist failed", error);
    return jsonResponse(req, { message: "계정 찾기 요청을 처리하지 못했습니다." }, 500);
  }
});
