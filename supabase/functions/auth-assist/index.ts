import {
  HttpError,
  cleanString,
  isEmailLike,
  normalizeEmail,
  normalizePhone,
} from "../_shared/core.ts";
import {
  allowedOrigins,
  assertAllowedOrigin,
  jsonResponse,
  optionsResponse,
  publicErrorResponse,
  readJson,
  safeLog,
} from "../_shared/http.ts";
import { enforceRateLimit, verifyCaptcha } from "../_shared/security.ts";
import { authPublic, rpc } from "../_shared/supabase.ts";

const GENERIC_RESPONSE = {
  accepted: true,
  message: "입력한 정보와 일치하는 계정이 있으면 안내를 진행합니다.",
};

function safeRedirectTo(value: unknown): string {
  const fallback = "https://reballlostball.com/";
  const raw = cleanString(value, 500) || fallback;
  try {
    const url = new URL(raw);
    if (!allowedOrigins().has(url.origin)) return fallback;
    url.hash = "";
    return url.toString();
  } catch {
    return fallback;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try { return optionsResponse(req); } catch (error) { return publicErrorResponse(req, error); }
  }
  try {
    assertAllowedOrigin(req);
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");
    const body = await readJson(req);
    const mode = cleanString(body.mode, 30);
    const name = cleanString(body.name, 80);
    const phone = normalizePhone(body.phone);
    const rateSubject = `${mode}:${normalizeEmail(body.identifier || body.email)}:${phone}`;
    await enforceRateLimit(req, "auth_assist", rateSubject, 5, 3600, 3600);
    await verifyCaptcha(req, body.captchaToken);

    if (!name || !/^[0-9]{9,11}$/.test(phone)) {
      throw new HttpError(400, "INVALID_ACCOUNT_ASSIST", "입력 정보를 확인해 주세요.");
    }

    if (mode === "find-id") {
      const email = normalizeEmail(body.email);
      if (!isEmailLike(email)) throw new HttpError(400, "INVALID_ACCOUNT_ASSIST", "입력 정보를 확인해 주세요.");
      // Email itself is accepted as a login identifier. We deliberately do not return a full
      // login ID or an existence signal to the browser.
      return jsonResponse(req, {
        ...GENERIC_RESPONSE,
        hint: "가입 이메일을 로그인 아이디로 사용할 수 있습니다.",
      }, 202);
    }

    if (mode === "password-reset") {
      const identifier = normalizeEmail(body.identifier);
      if (!identifier) throw new HttpError(400, "INVALID_ACCOUNT_ASSIST", "입력 정보를 확인해 주세요.");
      const profile = await rpc<{ authEmail?: string } | null>("resolve_auth_recovery_profile_v1", {
        p_identifier: identifier,
        p_name: name,
        p_phone: phone,
      });
      const authEmail = normalizeEmail(profile?.authEmail);
      if (authEmail && isEmailLike(authEmail)) {
        const redirectTo = encodeURIComponent(safeRedirectTo(body.redirectTo));
        const recover = await authPublic(`/auth/v1/recover?redirect_to=${redirectTo}`, {
          method: "POST",
          body: JSON.stringify({ email: authEmail }),
        });
        if (!recover.response.ok && recover.response.status >= 500) {
          throw new HttpError(503, "RECOVERY_UNAVAILABLE", "계정 복구 요청을 처리하지 못했습니다.");
        }
      }
      return jsonResponse(req, GENERIC_RESPONSE, 202);
    }

    throw new HttpError(400, "INVALID_ACCOUNT_ASSIST", "지원하지 않는 요청입니다.");
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("auth-assist", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "계정 지원 요청을 처리하지 못했습니다.");
  }
});
