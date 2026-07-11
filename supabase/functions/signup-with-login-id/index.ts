import {
  HttpError,
  cleanString,
  isEmailLike,
  normalizeEmail,
  normalizeLoginId,
  normalizePhone,
} from "../_shared/core.ts";
import {
  assertAllowedOrigin,
  jsonResponse,
  optionsResponse,
  publicErrorResponse,
  readJson,
  safeLog,
} from "../_shared/http.ts";
import { enforceRateLimit, verifyCaptcha } from "../_shared/security.ts";
import { authAdmin, authPublic, rpc } from "../_shared/supabase.ts";

const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{3,19}$/;
const GENERIC_RESPONSE = {
  accepted: true,
  message: "입력한 이메일로 확인 안내를 보냈습니다. 메일을 확인해 주세요.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try { return optionsResponse(req); } catch (error) { return publicErrorResponse(req, error); }
  }
  try {
    assertAllowedOrigin(req);
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");
    const body = await readJson(req);
    const loginId = normalizeLoginId(body.loginId);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const profile = body.profile && typeof body.profile === "object" && !Array.isArray(body.profile)
      ? body.profile as Record<string, unknown>
      : {};
    const name = cleanString(profile.name, 80);
    const phone = normalizePhone(profile.phone);

    await enforceRateLimit(req, "auth_signup", `${loginId}:${email}`, 5, 3600, 3600);
    await verifyCaptcha(req, body.captchaToken);

    if (!LOGIN_ID_PATTERN.test(loginId) || !isEmailLike(email)
        || password.length < 8 || password.length > 72
        || !name || !/^[0-9]{9,11}$/.test(phone)) {
      throw new HttpError(400, "INVALID_SIGNUP", "회원가입 정보를 확인해 주세요.");
    }

    const exists = await rpc<{ loginIdExists?: boolean; emailExists?: boolean }>("check_signup_identity_v1", {
      p_login_id: loginId,
      p_email: email,
    });

    if (!exists?.loginIdExists && !exists?.emailExists) {
      const create = await authAdmin("/auth/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          email_confirm: false,
          user_metadata: { login_id: loginId },
          app_metadata: { provider: "email" },
        }),
      });
      if (!create.response.ok && create.response.status >= 500) {
        throw new HttpError(503, "SIGNUP_UNAVAILABLE", "회원가입 요청을 처리하지 못했습니다.");
      }
      if (create.response.ok) {
        const createdUser = create.payload.user && typeof create.payload.user === "object"
          ? create.payload.user as Record<string, unknown>
          : create.payload;
        const userId = cleanString(createdUser.id, 36);
        if (!userId) throw new HttpError(503, "SIGNUP_UNAVAILABLE", "회원가입 요청을 처리하지 못했습니다.");
        try {
          await rpc("complete_signup_profile_v1", {
            p_user_id: userId,
            p_login_id: loginId,
            p_email: email,
            p_name: name,
            p_phone: phone,
            p_telephone: cleanString(profile.telephone, 30),
            p_marketing_email: profile.marketing_email === true,
            p_marketing_sms: profile.marketing_sms === true,
            p_birth_date: cleanString(profile.birth_date, 20),
            p_anniversary_date: cleanString(profile.anniversary_date, 20),
            p_spouse_birth_date: cleanString(profile.spouse_birth_date, 20),
            p_region: cleanString(profile.region, 80),
            p_address_zip: cleanString(profile.default_address_zip, 5),
            p_address_road: cleanString(profile.default_address_road, 240),
            p_address_detail: cleanString(profile.default_address_detail, 240),
          });
        } catch (error) {
          await authAdmin(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => undefined);
          throw error;
        }
      }
    }

    // Resend is intentionally attempted for both new and duplicate email submissions.
    // The outward response remains identical, preventing account enumeration.
    const resend = await authPublic("/auth/v1/resend", {
      method: "POST",
      body: JSON.stringify({ type: "signup", email }),
    });
    if (!resend.response.ok && resend.response.status >= 500) {
      throw new HttpError(503, "EMAIL_UNAVAILABLE", "확인 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    return jsonResponse(req, GENERIC_RESPONSE, 202);
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("signup-with-login-id", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "회원가입 요청을 처리하지 못했습니다.");
  }
});
