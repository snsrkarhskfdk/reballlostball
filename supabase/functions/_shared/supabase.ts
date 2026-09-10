import { HttpError, cleanString } from "./core.ts";

function parseJsonKey(envName: string): string {
  const raw = Deno.env.get(envName);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    const first = Object.values(parsed)[0];
    return typeof parsed.default === "string" ? parsed.default : typeof first === "string" ? first : "";
  } catch {
    return "";
  }
}

export function supabaseUrl(): string {
  const value = Deno.env.get("SUPABASE_URL") || "";
  if (!/^https?:\/\//.test(value)) throw new HttpError(503, "SUPABASE_CONFIG_MISSING", "서비스 설정을 확인할 수 없습니다.");
  return value.replace(/\/$/, "");
}

export function publishableKey(): string {
  const value = parseJsonKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!value) throw new HttpError(503, "SUPABASE_CONFIG_MISSING", "서비스 설정을 확인할 수 없습니다.");
  return value;
}

export function serviceRoleKey(): string {
  const value = parseJsonKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!value) throw new HttpError(503, "SUPABASE_CONFIG_MISSING", "서비스 설정을 확인할 수 없습니다.");
  return value;
}

function serviceHeaders(extra: HeadersInit = {}): Headers {
  const key = serviceRoleKey();
  const headers = new Headers(extra);
  headers.set("apikey", key);
  // The current sb_secret_* API keys are opaque API keys, not JWTs. Sending one
  // as a Bearer token makes PostgREST/Auth try to parse it as a JWT and reject
  // an otherwise valid service request. Legacy service_role keys are JWTs and
  // still require the Authorization header during the migration window.
  if (/^[^.]+\.[^.]+\.[^.]+$/.test(key)) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  return headers;
}

function publicHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set("apikey", publishableKey());
  return headers;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: "Invalid upstream response" };
  }
}

// Postgres/PostgREST conditions that mean "try again", not "your request was wrong".
// Collapsing these into a definitive 4xx told the browser a payment confirmation had
// failed for good, so it discarded the stored confirmation tuple even though the
// provider may already have charged the customer. Anything transient must surface as
// 5xx so retry/recovery paths stay available.
const TRANSIENT_DATABASE_CODES = new Set([
  "08000", "08003", "08006",          // connection exception
  "40001", "40P01",                    // serialization failure, deadlock detected
  "53100", "53200", "53300", "53400",  // insufficient resources
  "55006", "55P03",                    // object in use, lock not available
  "57014", "57P01", "57P02", "57P03",  // canceled, shutdown, cannot connect now
]);

export async function rpc<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!/^[a-z0-9_]+$/.test(name)) throw new HttpError(500, "INVALID_RPC", "서비스 요청을 구성하지 못했습니다.");
  const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: serviceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const error = payload as Record<string, unknown> | null;
    const upstreamCode = cleanString(error?.code, 40);
    const transient = response.status >= 500 || TRANSIENT_DATABASE_CODES.has(upstreamCode);
    const status = upstreamCode === "42501" ? 403
      : upstreamCode === "23505" ? 409
      : upstreamCode === "22023" ? 400
      : transient ? 503
      : 422;
    throw new HttpError(
      status,
      upstreamCode || (transient ? "DATABASE_UNAVAILABLE" : "DATABASE_REJECTED"),
      transient
        ? "일시적인 오류로 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."
        : "요청을 안전하게 처리할 수 없습니다.",
    );
  }
  return payload as T;
}

export async function authPublic(path: string, init: RequestInit): Promise<{ response: Response; payload: Record<string, unknown> }> {
  const response = await fetch(`${supabaseUrl()}${path}`, {
    ...init,
    headers: publicHeaders({ "Content-Type": "application/json", ...(init.headers || {}) }),
  });
  const payload = (await parseResponse(response) || {}) as Record<string, unknown>;
  return { response, payload };
}

export async function authAdmin(path: string, init: RequestInit): Promise<{ response: Response; payload: Record<string, unknown> }> {
  const response = await fetch(`${supabaseUrl()}${path}`, {
    ...init,
    headers: serviceHeaders({ "Content-Type": "application/json", ...(init.headers || {}) }),
  });
  const payload = (await parseResponse(response) || {}) as Record<string, unknown>;
  return { response, payload };
}

export function bearerToken(req: Request): string {
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
}

export async function sessionUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: publicHeaders({ Authorization: `Bearer ${token}` }),
  });
  if (!response.ok) return null;
  const payload = await parseResponse(response) as Record<string, unknown> | null;
  return typeof payload?.id === "string"
    ? { id: payload.id, email: typeof payload.email === "string" ? payload.email : undefined }
    : null;
}

export async function serviceSelect<T = unknown>(path: string): Promise<T> {
  if (!path.startsWith("/rest/v1/")) throw new HttpError(500, "INVALID_QUERY", "서비스 요청을 구성하지 못했습니다.");
  const response = await fetch(`${supabaseUrl()}${path}`, { headers: serviceHeaders() });
  const payload = await parseResponse(response);
  if (!response.ok) throw new HttpError(502, "DATABASE_LOOKUP_FAILED", "서비스 데이터를 확인하지 못했습니다.");
  return payload as T;
}
