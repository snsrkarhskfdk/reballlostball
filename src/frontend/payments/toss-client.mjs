import { saveGuestLookupSession } from "../core/storage.mjs";

const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";
const TOSS_SDK_TIMEOUT_MS = 15_000;
const TOSS_API_TIMEOUT_MS = 15_000;
const TOSS_CONFIRM_TIMEOUT_MS = 30_000;
const TOSS_CONFIRM_AUTO_ATTEMPTS = 3;
const PAYMENT_RETURN_STORAGE_PREFIX = "reball.paymentReturnToken.";
const PAYMENT_CONFIRM_STORAGE_PREFIX = "reball.paymentConfirm.";
const RECOVERABLE_CONFIRM_CODES = new Set([
  "PAYMENT_RESULT_UNKNOWN",
  "PAYMENT_RESPONSE_MISMATCH",
  "PAYMENT_RECONCILIATION_PENDING",
  "CLIENT_TIMEOUT",
]);
let tossSdkPromise = null;

function requestError(message, { code = "", status = 0, payload = null } = {}) {
  const error = new Error(message);
  error.code = String(code || "");
  error.status = Number(status) || 0;
  error.payload = payload;
  return error;
}

async function postJson(fetchImpl, url, body, headers = {}, timeoutMs = TOSS_API_TIMEOUT_MS) {
  const controller = new AbortController();
  const configuredTimeout = Number(timeoutMs);
  const useTimeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0;
  const timer = useTimeout
    ? globalThis.setTimeout(
        () => controller.abort(new DOMException("요청 시간이 초과되었습니다.", "TimeoutError")),
        configuredTimeout
      )
    : 0;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw requestError(payload?.message || "결제 요청에 실패했습니다.", {
        code: payload?.code,
        status: response.status,
        payload,
      });
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      throw requestError("결제 서버 연결 시간이 초과되었습니다. 같은 주문에서 다시 확인해 주세요.", {
        code: "CLIENT_TIMEOUT",
      });
    }
    throw error;
  } finally {
    if (timer) globalThis.clearTimeout(timer);
  }
}

function safeOrderId(value) {
  const orderId = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9_-]{6,64}$/.test(orderId) ? orderId : "";
}

function safeReturnToken(value) {
  const token = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(token) ? token : "";
}

function paramsFromLocation(locationLike = globalThis.location) {
  const location = locationLike || { search: "", hash: "" };
  const params = new URLSearchParams(String(location.search || ""));
  const hash = String(location.hash || "").replace(/^#/, "");
  const queryIndex = hash.indexOf("?");
  if (queryIndex >= 0) {
    for (const [key, value] of new URLSearchParams(hash.slice(queryIndex + 1))) {
      if (!params.has(key)) params.set(key, value);
    }
  }
  return params;
}

export function paymentReturnStorageKey(orderId) {
  const safeId = safeOrderId(orderId);
  return safeId ? `${PAYMENT_RETURN_STORAGE_PREFIX}${safeId}` : "";
}

function paymentConfirmStorageKey(orderId) {
  const safeId = safeOrderId(orderId);
  return safeId ? `${PAYMENT_CONFIRM_STORAGE_PREFIX}${safeId}` : "";
}

export function rememberPaymentReturnToken(orderId, token, storage = globalThis.sessionStorage) {
  const key = paymentReturnStorageKey(orderId);
  const safeToken = safeReturnToken(token);
  if (!key || !safeToken || !storage?.setItem) return "";
  try { storage.setItem(key, safeToken); } catch { return ""; }
  return safeToken;
}

export function browserPaymentReturnToken(orderId, {
  locationLike = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) {
  const safeId = safeOrderId(orderId);
  if (!safeId) return "";
  const fromUrl = safeReturnToken(paramsFromLocation(locationLike).get("paymentReturnToken"));
  if (fromUrl) return rememberPaymentReturnToken(safeId, fromUrl, storage);
  const key = paymentReturnStorageKey(safeId);
  if (!key || !storage?.getItem) return "";
  try { return safeReturnToken(storage.getItem(key)); } catch { return ""; }
}

function clearPaymentReturnToken(orderId, storage = globalThis.sessionStorage) {
  const key = paymentReturnStorageKey(orderId);
  if (!key || !storage?.removeItem) return;
  try { storage.removeItem(key); } catch {}
}

function rememberPendingConfirmation(confirmation, storage = globalThis.sessionStorage) {
  const orderId = safeOrderId(confirmation?.orderId);
  const paymentKey = String(confirmation?.paymentKey || "").trim();
  const amount = Number(confirmation?.amount);
  const key = paymentConfirmStorageKey(orderId);
  if (!key || paymentKey.length < 6 || !Number.isSafeInteger(amount) || amount < 1 || !storage?.setItem) return false;
  try {
    storage.setItem(key, JSON.stringify({ orderId, paymentKey, amount }));
    return true;
  } catch {
    return false;
  }
}

export function pendingTossConfirmation(orderId, storage = globalThis.sessionStorage) {
  const key = paymentConfirmStorageKey(orderId);
  if (!key || !storage?.getItem) return null;
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null");
    const safeId = safeOrderId(parsed?.orderId);
    const paymentKey = String(parsed?.paymentKey || "").trim();
    const amount = Number(parsed?.amount);
    if (safeId !== safeOrderId(orderId) || paymentKey.length < 6 || !Number.isSafeInteger(amount) || amount < 1) return null;
    return { orderId: safeId, paymentKey, amount };
  } catch {
    return null;
  }
}

function clearPendingConfirmation(orderId, storage = globalThis.sessionStorage) {
  const key = paymentConfirmStorageKey(orderId);
  if (!key || !storage?.removeItem) return;
  try { storage.removeItem(key); } catch {}
}

function confirmationRetryable(error) {
  const code = String(error?.code || "").toUpperCase();
  const status = Number(error?.status) || 0;
  if (RECOVERABLE_CONFIRM_CODES.has(code)) return true;
  // Any coded or uncoded 5xx is non-definitive for payment confirmation: Toss
  // may already have charged the customer while a later local finalize step
  // failed. Retrying the exact confirmation tuple is server-idempotent and is
  // safer than deleting it and falling back to a new prepare-payment attempt.
  if (status >= 500) return true;
  if ([408, 425, 429].includes(status)) return true;
  // Browser/network failures frequently carry neither a code nor a status.
  return !code && status === 0;
}

function confirmationAuthRecoveryRequired(error, config) {
  const status = Number(error?.status) || 0;
  const hadAuthenticatedSession = Boolean(String(config?.accessToken || "").trim());
  // payment-confirm returns AUTH_REQUIRED when an Authorization header exists
  // but its session expired. That says nothing definitive about the provider
  // charge result, so retain the exact tuple and require re-authentication
  // instead of deleting the only safe idempotent recovery path. A guest 403 is
  // deliberately not treated this way because it means the guest capability is
  // missing/invalid rather than an expired member session.
  return hadAuthenticatedSession && (status === 401 || status === 403);
}

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export function prepareTossPayment(config, orderId, guestLookupToken = "") {
  const rawOrderId = String(orderId || "").trim();
  const safeId = safeOrderId(rawOrderId);
  const storage = config.storage ?? globalThis.sessionStorage;
  const locationLike = config.locationLike ?? globalThis.location;
  const paymentReturnToken = guestLookupToken
    ? ""
    : browserPaymentReturnToken(safeId, { locationLike, storage });
  return postJson(
    config.fetchImpl ?? fetch,
    `${String(config.baseUrl).replace(/\/$/, "")}/functions/v1/prepare-payment`,
    {
      orderId: rawOrderId,
      ...(guestLookupToken ? { guestLookupToken } : {}),
      ...(paymentReturnToken ? { paymentReturnToken } : {}),
    },
    {
      apikey: config.anonKey,
      ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
    },
    config.timeoutMs ?? TOSS_API_TIMEOUT_MS
  );
}

export async function confirmTossPayment(config, confirmation) {
  const orderId = safeOrderId(confirmation?.orderId);
  const paymentKey = String(confirmation?.paymentKey || "").trim();
  const amount = Number(confirmation?.amount);
  const guestLookupToken = String(confirmation?.guestLookupToken || "").trim();
  const explicitReturnToken = safeReturnToken(confirmation?.paymentReturnToken);
  const storage = config.storage ?? globalThis.sessionStorage;
  const locationLike = config.locationLike ?? globalThis.location;

  if (!orderId || paymentKey.length < 6
      || !Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("결제 승인 정보가 올바르지 않습니다.");
  }

  rememberPendingConfirmation({ orderId, paymentKey, amount }, storage);
  const paymentReturnToken = explicitReturnToken
    ? rememberPaymentReturnToken(orderId, explicitReturnToken, storage)
    : browserPaymentReturnToken(orderId, { locationLike, storage });
  const confirmBody = {
    paymentKey,
    orderId,
    amount,
    ...(guestLookupToken ? { guestLookupToken } : {}),
    ...(!guestLookupToken && paymentReturnToken ? { paymentReturnToken } : {}),
  };
  const confirmHeaders = {
    apikey: config.anonKey,
    ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
  };
  const confirmUrl = `${String(config.baseUrl).replace(/\/$/, "")}/functions/v1/payment-confirm`;
  const configuredTimeout = Number(config.confirmTimeoutMs);
  const confirmTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : TOSS_CONFIRM_TIMEOUT_MS;
  const configuredAttempts = Number(config.confirmAutoAttempts);
  const maxAttempts = Number.isSafeInteger(configuredAttempts) && configuredAttempts > 0
    ? Math.min(5, configuredAttempts)
    : TOSS_CONFIRM_AUTO_ATTEMPTS;
  const fetchImpl = config.fetchImpl ?? fetch;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await postJson(fetchImpl, confirmUrl, confirmBody, confirmHeaders, confirmTimeoutMs);
      const refreshedGuestLookupToken = String(result?.guestLookupToken || "").trim();
      if (refreshedGuestLookupToken) {
        saveGuestLookupSession(storage, {
          orderId,
          lookupToken: refreshedGuestLookupToken,
        });
      }
      clearPaymentReturnToken(orderId, storage);
      clearPendingConfirmation(orderId, storage);
      return result;
    } catch (error) {
      if (confirmationAuthRecoveryRequired(error, config)) {
        throw requestError(
          "로그인 세션이 만료되었습니다. 다시 로그인한 뒤 같은 주문에서 ‘결제 결과 다시 확인’을 눌러 주세요.",
          { code: "PAYMENT_CONFIRM_AUTH_REQUIRED", status: Number(error?.status) || 401, payload: error?.payload || null }
        );
      }
      if (!confirmationRetryable(error)) {
        clearPendingConfirmation(orderId, storage);
        throw error;
      }
      if (attempt >= maxAttempts) {
        throw requestError(
          "결제 승인 결과가 아직 확정되지 않았습니다. 같은 주문의 ‘결제 결과 다시 확인’으로 안전하게 재확인해 주세요.",
          { code: "PAYMENT_CONFIRM_RECOVERY_REQUIRED", status: Number(error?.status) || 0, payload: error?.payload || null }
        );
      }
      const delayMs = Math.min(5_000, 750 * (2 ** (attempt - 1)));
      await sleep(delayMs);
    }
  }

  throw requestError("결제 승인 결과를 확인하지 못했습니다.", { code: "PAYMENT_CONFIRM_RECOVERY_REQUIRED" });
}

export async function retryPendingTossConfirmation(config, orderId) {
  const storage = config.storage ?? globalThis.sessionStorage;
  const pending = pendingTossConfirmation(orderId, storage);
  if (!pending) {
    throw requestError("다시 확인할 결제 승인 정보가 없습니다.", { code: "PAYMENT_CONFIRM_NOT_PENDING" });
  }
  return confirmTossPayment(config, pending);
}

export function loadTossSdk(documentRef = document, { timeoutMs = TOSS_SDK_TIMEOUT_MS } = {}) {
  if (typeof globalThis.TossPayments === "function") return Promise.resolve(globalThis.TossPayments);
  if (tossSdkPromise) return tossSdkPromise;

  let script = documentRef.querySelector('script[data-toss-payments-sdk="v2"]');
  if (script?.dataset.tossPaymentsState === "failed"
      || script?.dataset.tossPaymentsState === "loaded") {
    script.remove();
    script = null;
  }

  if (!script) {
    script = documentRef.createElement("script");
    script.src = TOSS_SDK_URL;
    script.async = true;
    script.dataset.tossPaymentsSdk = "v2";
    script.dataset.tossPaymentsState = "loading";
  }

  tossSdkPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
      if (error) {
        script.dataset.tossPaymentsState = "failed";
        script.remove();
        reject(error);
        return;
      }
      script.dataset.tossPaymentsState = "loaded";
      resolve(globalThis.TossPayments);
    };
    const handleLoad = () => finish(
      typeof globalThis.TossPayments === "function"
        ? null
        : new Error("토스페이먼츠 SDK 초기화에 실패했습니다.")
    );
    const handleError = () => finish(new Error("토스페이먼츠 SDK를 불러오지 못했습니다."));
    const timeout = globalThis.setTimeout(
      () => finish(new Error("토스페이먼츠 SDK 연결 시간이 초과되었습니다.")),
      Math.max(1, Number(timeoutMs) || TOSS_SDK_TIMEOUT_MS)
    );

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!script.isConnected) documentRef.head.appendChild(script);
  }).catch((error) => {
    tossSdkPromise = null;
    throw error;
  });

  return tossSdkPromise;
}

export function hasActivePaymentGesture(navigatorRef = globalThis.navigator) {
  const activation = navigatorRef?.userActivation;
  return !activation || activation.isActive !== false;
}

export async function requestTossPayment({ clientKey, customerKey, payment }) {
  if (!clientKey) throw new Error("토스페이먼츠 client key가 필요합니다.");
  if (!hasActivePaymentGesture()) {
    throw new Error("주문 접수가 완료되었습니다. 주문 화면의 토스 결제하기 버튼을 눌러 결제를 시작해 주세요.");
  }
  const TossPayments = await loadTossSdk();
  if (typeof TossPayments !== "function") throw new Error("토스페이먼츠 SDK 초기화에 실패했습니다.");
  const client = TossPayments(clientKey);
  const checkout = client.payment({ customerKey: customerKey || "ANONYMOUS" });
  return checkout.requestPayment(payment);
}

export {
  TOSS_SDK_URL,
  TOSS_API_TIMEOUT_MS,
  TOSS_CONFIRM_TIMEOUT_MS,
  TOSS_CONFIRM_AUTO_ATTEMPTS,
  RECOVERABLE_CONFIRM_CODES,
};
