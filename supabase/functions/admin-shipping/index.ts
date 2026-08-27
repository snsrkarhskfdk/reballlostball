import { HttpError, cleanString } from "../_shared/core.ts";
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
    const user = await sessionUser(req);
    if (!user) throw new HttpError(401, "AUTH_REQUIRED", "관리자 로그인이 필요합니다.");
    await enforceRateLimit(req, "admin_shipping", user.id, 30, 300, 300);

    const body = await readJson(req, 16 * 1024);
    const orderId = cleanString(body.orderId, 36).toLowerCase();
    const status = cleanString(body.status, 30);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(orderId)
        || !new Set(["shipping_ready", "shipped", "delivered"]).has(status)) {
      throw new HttpError(400, "INVALID_REQUEST", "주문 또는 배송 상태를 확인해 주세요.");
    }

    const order = await rpc("admin_update_shipping_v1", {
      p_actor_user_id: user.id,
      p_order_id: orderId,
      p_target_status: status,
      p_shipping_carrier: cleanString(body.carrier, 40) || null,
      p_tracking_number: cleanString(body.trackingNumber, 80) || null,
    });
    return jsonResponse(req, { order });
  } catch (error) {
    if (!(error instanceof HttpError)) safeLog("admin-shipping", req, "UNEXPECTED_ERROR");
    return publicErrorResponse(req, error, "배송 정보를 처리하지 못했습니다.");
  }
});
