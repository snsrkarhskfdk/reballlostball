import { HttpError } from "./core.ts";

const DEFAULT_ORIGINS = [
  "https://reballlostball.com",
  "https://www.reballlostball.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];

export function allowedOrigins(): Set<string> {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ORIGINS);
}

export function assertAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") || "";
  if (origin && !allowedOrigins().has(origin)) {
    throw new HttpError(403, "ORIGIN_DENIED", "요청 출처를 확인할 수 없습니다.");
  }
  return origin;
}

export function responseHeaders(req: Request, extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  const origin = req.headers.get("origin") || "";
  if (origin && allowedOrigins().has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type, idempotency-key, x-request-id");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "600");
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Pragma", "no-cache");
  headers.set("Vary", "Origin");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

export function jsonResponse(req: Request, body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(req, extra) });
}

export function optionsResponse(req: Request): Response {
  assertAllowedOrigin(req);
  return new Response(null, { status: 204, headers: responseHeaders(req) });
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new HttpError(413, "REQUEST_TOO_LARGE", "요청이 너무 큽니다.");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new HttpError(413, "REQUEST_TOO_LARGE", "요청이 너무 큽니다.");
  }
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "요청 형식을 확인해 주세요.");
  }
}

export function publicErrorResponse(req: Request, error: unknown, fallback = "요청을 처리하지 못했습니다."): Response {
  if (error instanceof HttpError) {
    const headers: HeadersInit = error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {};
    return jsonResponse(req, { code: error.code, message: error.message }, error.status, headers);
  }
  return jsonResponse(req, { code: "INTERNAL_ERROR", message: fallback }, 500);
}

export function requestId(req: Request): string {
  const provided = req.headers.get("x-request-id")?.trim();
  return provided && /^[A-Za-z0-9_-]{8,80}$/.test(provided) ? provided : crypto.randomUUID();
}

export function safeLog(label: string, req: Request, code: string): void {
  console.warn(JSON.stringify({ label, requestId: requestId(req), code }));
}
