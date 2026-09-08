import { HttpError, normalizeLoginId } from "../_shared/core.ts";
import {
  assertAllowedOrigin,
  jsonResponse,
  optionsResponse,
  publicErrorResponse,
  readJson,
  safeLog,
} from "../_shared/http.ts";
import { enforceRateLimit, verifyCaptcha } from "../_shared/security.ts";
import { rpc } from "../_shared/supabase.ts";

const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{3,19}$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try { return optionsResponse(req); } catch (error) { return publicErrorResponse(req, error); }
  }

  try {
    assertAllowedOrigin(req);
    if (req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");
    }

    const body = await readJson(req, 16 * 1024);
    const loginId = normalizeLoginId(body.loginId);
    await enforceRateLimit(req, "auth_login_id_check", loginId || "empty", 12, 900, 1800);
    await verifyCaptcha(req, body.captchaToken);

    if (!LOGIN_ID_PATTERN.test(loginId)) {
      throw new HttpError(400, "INVALID_LOGIN_ID", "아이디 형식을 확인해 주세요.");
    }

    const result = await rpc<{ loginIdExists?: boolean }>("check_signup_identity_v1", {
      p_login_id: loginId,
      p_email: "id-check@invalid.reball.local",
    });

    return jsonResponse(req, {
      loginId,
      available: result?.loginIdExists !== true,
    });
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("check-login-id", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "아이디 중복확인을 완료하지 못했습니다.");
  }
});
