import { HttpError, cleanString, hmacSha256Hex, isExplicitNonProductionRuntime } from "./core.ts";
import { rpc } from "./supabase.ts";

type RateLimitResult = { allowed?: boolean; retryAfter?: number; remaining?: number };

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return cleanString(req.headers.get("cf-connecting-ip") || forwarded || "unknown", 80);
}

async function rateLimitHash(scope: string, kind: string, value: string): Promise<string> {
  const pepper = Deno.env.get("AUTH_RATE_LIMIT_PEPPER") || "";
  return hmacSha256Hex(pepper, `${scope}:${kind}:${value.toLowerCase()}`);
}

export async function enforceRateLimit(
  req: Request,
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
  blockSeconds: number,
): Promise<void> {
  const keys = [
    await rateLimitHash(scope, "ip", clientIp(req)),
    await rateLimitHash(scope, "subject", subject || "anonymous"),
  ];
  let retryAfter = 0;
  for (const key of keys) {
    const result = await rpc<RateLimitResult>("consume_edge_rate_limit_v1", {
      p_scope: scope,
      p_key_hash: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
      p_block_seconds: blockSeconds,
    });
    if (result?.allowed === false) retryAfter = Math.max(retryAfter, Number(result.retryAfter) || 1);
  }
  if (retryAfter) throw new HttpError(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", retryAfter);
}

export async function resetRateLimit(req: Request, scope: string, subject: string): Promise<void> {
  const keys = [
    await rateLimitHash(scope, "ip", clientIp(req)),
    await rateLimitHash(scope, "subject", subject || "anonymous"),
  ];
  await Promise.all(keys.map((key) => rpc("reset_edge_rate_limit_v1", { p_scope: scope, p_key_hash: key })));
}

export async function verifyCaptcha(req: Request, tokenValue: unknown): Promise<void> {
  const token = cleanString(tokenValue, 4096);
  const provider = cleanString(Deno.env.get("AUTH_CAPTCHA_PROVIDER"), 20).toLowerCase();
  const secret = Deno.env.get("AUTH_CAPTCHA_SECRET_KEY") || "";
  const mode = cleanString(Deno.env.get("AUTH_CAPTCHA_MODE") || "enforced", 20).toLowerCase();

  if (mode === "test" && isExplicitNonProductionRuntime()) {
    const expected = Deno.env.get("AUTH_CAPTCHA_TEST_TOKEN") || "";
    if (expected.length >= 16 && token === expected) return;
    throw new HttpError(403, "CAPTCHA_FAILED", "자동입력 방지 확인에 실패했습니다.");
  }
  if (!token || !secret || !new Set(["turnstile", "hcaptcha"]).has(provider)) {
    throw new HttpError(503, "CAPTCHA_NOT_CONFIGURED", "자동입력 방지 설정이 완료되지 않았습니다.");
  }

  const endpoint = provider === "turnstile"
    ? "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    : "https://api.hcaptcha.com/siteverify";
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  const ip = clientIp(req);
  if (ip !== "unknown") form.set("remoteip", ip);

  const response = await fetch(endpoint, { method: "POST", body: form });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.success !== true) {
    throw new HttpError(403, "CAPTCHA_FAILED", "자동입력 방지 확인에 실패했습니다.");
  }

  const allowedHosts = (Deno.env.get("AUTH_CAPTCHA_EXPECTED_HOSTNAMES") || "")
    .split(",").map((entry) => entry.trim()).filter(Boolean);
  if (allowedHosts.length && (typeof payload.hostname !== "string" || !allowedHosts.includes(payload.hostname))) {
    throw new HttpError(403, "CAPTCHA_FAILED", "자동입력 방지 확인에 실패했습니다.");
  }
}
