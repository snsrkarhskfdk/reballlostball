import {
  HttpError,
  cleanString,
  isEmailLike,
  normalizeEmail,
  normalizeLoginId,
  sha256Hex,
} from "../_shared/core.ts";
import {
  assertAllowedOrigin,
  jsonResponse,
  optionsResponse,
  publicErrorResponse,
  readJson,
  safeLog,
} from "../_shared/http.ts";
import { enforceRateLimit, resetRateLimit, verifyCaptcha } from "../_shared/security.ts";
import { authPublic, rpc } from "../_shared/supabase.ts";

const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{3,19}$/;
const INVALID_CREDENTIALS = "아이디 또는 비밀번호를 확인해 주세요.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try { return optionsResponse(req); } catch (error) { return publicErrorResponse(req, error); }
  }
  try {
    assertAllowedOrigin(req);
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");
    const body = await readJson(req);
    const identifier = normalizeEmail(body.identifier);
    const password = String(body.password || "");
    await enforceRateLimit(req, "auth_login_request", identifier || "empty", 30, 900, 900);
    await verifyCaptcha(req, body.captchaToken);

    if (!identifier || !password || password.length > 200
        || (!isEmailLike(identifier) && !LOGIN_ID_PATTERN.test(normalizeLoginId(identifier)))) {
      throw new HttpError(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS);
    }

    let email = isEmailLike(identifier)
      ? identifier
      : await rpc<string | null>("resolve_login_email_v1", { p_login_id: normalizeLoginId(identifier) });
    if (!email) {
      const digest = await sha256Hex(identifier);
      email = `${digest.slice(0, 32)}@invalid.reball.local`;
    }

    const auth = await authPublic("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const user = auth.payload.user && typeof auth.payload.user === "object"
      ? auth.payload.user as Record<string, unknown>
      : null;
    const emailConfirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at);
    if (!auth.response.ok || !emailConfirmed
        || typeof auth.payload.access_token !== "string"
        || typeof auth.payload.refresh_token !== "string") {
      await enforceRateLimit(req, "auth_login_failure", identifier, 5, 900, 900);
      throw new HttpError(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS);
    }

    await resetRateLimit(req, "auth_login_failure", identifier).catch(() => undefined);
    return jsonResponse(req, auth.payload);
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("login-with-identifier", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, INVALID_CREDENTIALS);
  }
});
