const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";
const TOSS_SDK_TIMEOUT_MS = 15_000;
const PAYMENT_RETURN_STORAGE_PREFIX = "reball.paymentReturnToken.";
let tossSdkPromise = null;

async function postJson(fetchImpl, url, body, headers = {}) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || "결제 준비에 실패했습니다.");
  return payload;
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

export function prepareTossPayment(config, orderId, guestLookupToken = "") {
  const safeId = safeOrderId(orderId);
  const storage = config.storage ?? globalThis.sessionStorage;
  const locationLike = config.locationLike ?? globalThis.location;
  const paymentReturnToken = guestLookupToken
    ? ""
    : browserPaymentReturnToken(safeId, { locationLike, storage });
  return postJson(
    config.fetchImpl ?? fetch,
    `${String(config.baseUrl).replace(/\/$/, "")}/functions/v1/prepare-payment`,
    {
      orderId: safeId || orderId,
      ...(guestLookupToken ? { guestLookupToken } : {}),
      ...(paymentReturnToken ? { paymentReturnToken } : {}),
    },
    {
      apikey: config.anonKey,
      ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
    }
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
  const paymentReturnToken = explicitReturnToken
    ? rememberPaymentReturnToken(orderId, explicitReturnToken, storage)
    : browserPaymentReturnToken(orderId, { locationLike, storage });
  if (!orderId || paymentKey.length < 6
      || !Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("결제 승인 정보가 올바르지 않습니다.");
  }
  const result = await postJson(
    config.fetchImpl ?? fetch,
    `${String(config.baseUrl).replace(/\/$/, "")}/functions/v1/payment-confirm`,
    {
      paymentKey,
      orderId,
      amount,
      ...(guestLookupToken ? { guestLookupToken } : {}),
      ...(!guestLookupToken && paymentReturnToken ? { paymentReturnToken } : {}),
    },
    {
      apikey: config.anonKey,
      ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
    }
  );
  clearPaymentReturnToken(orderId, storage);
  return result;
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
  if (!clientKey) throw new Error("토스페이먼츠 테스트 client key가 필요합니다.");
  if (!hasActivePaymentGesture()) {
    throw new Error("주문 접수가 완료되었습니다. 주문 화면의 토스 결제하기 버튼을 눌러 결제를 시작해 주세요.");
  }
  const TossPayments = await loadTossSdk();
  if (typeof TossPayments !== "function") throw new Error("토스페이먼츠 SDK 초기화에 실패했습니다.");
  const client = TossPayments(clientKey);
  const checkout = client.payment({ customerKey: customerKey || "ANONYMOUS" });
  return checkout.requestPayment(payment);
}

export { TOSS_SDK_URL };
