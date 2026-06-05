import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://reballlostball.com",
  "https://www.reballlostball.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{3,19}$/;

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

function publishableHeaders(key: string): HeadersInit {
  return { apikey: key };
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

function cleanBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

async function profileExistsBy(column: "login_id" | "auth_email" | "email", value: string): Promise<boolean> {
  const key = secretKey();
  if (!key) throw new Error("Missing Supabase secret key");

  const params = new URLSearchParams({
    select: "id",
    [column]: `eq.${value}`,
    limit: "1",
  });
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/profiles?${params}`, {
    headers: serviceHeaders(key),
  });
  if (!response.ok) throw new Error("Profile lookup failed");
  const rows = await response.json().catch(() => []);
  return rows.length > 0;
}

async function createConfirmedUser(input: {
  email: string;
  password: string;
  loginId: string;
  profile: Record<string, unknown>;
}): Promise<void> {
  const key = secretKey();
  if (!key) throw new Error("Missing Supabase secret key");

  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...serviceHeaders(key),
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        login_id: input.loginId,
        name: cleanString(input.profile.name),
        phone: cleanString(input.profile.phone),
        telephone: cleanString(input.profile.telephone),
        contact_email: input.email,
        marketing_email: cleanBoolean(input.profile.marketing_email),
        marketing_sms: cleanBoolean(input.profile.marketing_sms),
        birth_date: cleanString(input.profile.birth_date),
        anniversary_date: cleanString(input.profile.anniversary_date),
        spouse_birth_date: cleanString(input.profile.spouse_birth_date),
        region: cleanString(input.profile.region),
        default_address_zip: cleanString(input.profile.default_address_zip),
        default_address_road: cleanString(input.profile.default_address_road),
        default_address_detail: cleanString(input.profile.default_address_detail),
        provider: "email",
      },
      app_metadata: {
        provider: "email",
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = String(payload?.message || payload?.error || "User creation failed");
    throw new Error(message);
  }
}

async function passwordGrant(email: string, password: string): Promise<Response> {
  const key = publishableKey();
  if (!key) throw new Error("Missing Supabase publishable key");

  return fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...publishableHeaders(key),
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
    const loginId = cleanString(body.loginId).toLowerCase();
    const email = cleanString(body.email).toLowerCase();
    const password = String(body.password || "");
    const profile = typeof body.profile === "object" && body.profile ? body.profile : {};

    if (!LOGIN_ID_PATTERN.test(loginId)) {
      return jsonResponse(req, { message: "Invalid login id" }, 400);
    }
    if (!isEmailLike(email)) {
      return jsonResponse(req, { message: "Invalid email" }, 400);
    }
    if (password.length < 6) {
      return jsonResponse(req, { message: "Password should be at least 6 characters" }, 400);
    }
    if (!cleanString(profile.name) || !cleanString(profile.phone)) {
      return jsonResponse(req, { message: "Name and phone are required" }, 400);
    }

    if (await profileExistsBy("login_id", loginId)) {
      return jsonResponse(req, { message: "Login id already exists" }, 409);
    }
    if ((await profileExistsBy("auth_email", email)) || (await profileExistsBy("email", email))) {
      return jsonResponse(req, { message: "Email already registered" }, 409);
    }

    await createConfirmedUser({ email, password, loginId, profile });

    const authResponse = await passwordGrant(email, password);
    const authPayload = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok) {
      return jsonResponse(req, { message: authPayload?.message || "Signup login failed" }, 400);
    }

    return jsonResponse(req, authPayload);
  } catch (error) {
    console.error("signup-with-login-id failed", error);
    return jsonResponse(req, { message: "Signup failed" }, 500);
  }
});
