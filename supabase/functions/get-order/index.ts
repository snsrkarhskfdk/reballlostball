import { HttpError, cleanString, sha256Hex } from "../_shared/core.ts";
import {
  assertAllowedOrigin,
  jsonResponse,
  optionsResponse,
  publicErrorResponse,
  readJson,
  safeLog,
} from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/security.ts";
import { rpc, sessionUser } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    try { return optionsResponse(req); } catch (error) { return publicErrorResponse(req, error); }
  }
  try {
    assertAllowedOrigin(req);
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");
    const body = await readJson(req, 16 * 1024);
    const orderNo = cleanString(body.orderNo, 64).toUpperCase();
    const user = await sessionUser(req);
    if (req.headers.has("authorization") && !user) {
      throw new HttpError(401, "AUTH_REQUIRED", "로그인 상태를 확인해 주세요.");
    }
    if (!/^[A-Z0-9_-]{6,64}$/.test(orderNo)) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "주문을 확인할 수 없습니다.");
    }
    await enforceRateLimit(req, "commerce_get_order", `${user?.id || "guest"}:${orderNo}`, 20, 900, 900);

    const token = cleanString(body.guestLookupToken, 200);
    const guestTokenHash = token ? await sha256Hex(token) : null;
    if (!user && !guestTokenHash) throw new HttpError(404, "ORDER_NOT_FOUND", "주문을 확인할 수 없습니다.");

    const order = await rpc<Record<string, unknown> | null>("get_order_v1", {
      p_order_no: orderNo,
      p_actor_user_id: user?.id || null,
      p_guest_token_hash: guestTokenHash,
    });
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "주문을 확인할 수 없습니다.");
    return jsonResponse(req, { order });
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("get-order", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "주문을 확인할 수 없습니다.");
  }
});
