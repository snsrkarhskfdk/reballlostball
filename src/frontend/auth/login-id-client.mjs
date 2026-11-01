const DEFAULT_TIMEOUT_MS = 12_000;

function edgeEndpoint(baseUrl) {
  return `${String(baseUrl || "").replace(/\/$/, "")}/functions/v1/check-login-id`;
}

function timeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(
    () => controller.abort(new DOMException("요청 시간이 초과되었습니다.", "TimeoutError")),
    Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)
  );
  return { signal: controller.signal, clear: () => globalThis.clearTimeout(timer) };
}

export async function checkLoginIdAvailability(config, { loginId, captchaToken }) {
  const normalized = String(loginId || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{3,19}$/.test(normalized)) {
    throw new Error("아이디는 영문 소문자 또는 숫자로 시작하고, 영문/숫자/./_/- 조합 4~20자로 입력하세요.");
  }
  const token = String(captchaToken || "").trim();
  if (!token) throw new Error("자동입력 방지 확인을 완료해 주세요.");

  const fetchImpl = config.fetchImpl ?? fetch;
  const timeout = timeoutSignal(config.timeoutMs);
  try {
    const response = await fetchImpl(edgeEndpoint(config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: String(config.anonKey || ""),
      },
      body: JSON.stringify({ loginId: normalized, captchaToken: token }),
      signal: timeout.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.message || "아이디 중복확인을 완료하지 못했습니다.");
      error.status = response.status;
      error.code = payload?.code || "";
      throw error;
    }
    if (typeof payload?.available !== "boolean") {
      throw new Error("아이디 중복확인 응답을 확인할 수 없습니다.");
    }
    return { loginId: normalized, available: payload.available };
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      throw new Error("아이디 중복확인 연결 시간이 초과되었습니다. 다시 시도해 주세요.");
    }
    throw error;
  } finally {
    timeout.clear();
  }
}

export { DEFAULT_TIMEOUT_MS };
