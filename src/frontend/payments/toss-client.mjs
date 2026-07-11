const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";
const TOSS_SDK_TIMEOUT_MS = 15_000;
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

export function prepareTossPayment(config, orderId, guestLookupToken = "") {
  return postJson(
    config.fetchImpl ?? fetch,
    `${String(config.baseUrl).replace(/\/$/, "")}/functions/v1/prepare-payment`,
    { orderId, ...(guestLookupToken ? { guestLookupToken } : {}) },
    {
      apikey: config.anonKey,
      ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
    }
  );
}

export function confirmTossPayment(config, confirmation) {
  const orderId = String(confirmation?.orderId || "").trim();
  const paymentKey = String(confirmation?.paymentKey || "").trim();
  const amount = Number(confirmation?.amount);
  const guestLookupToken = String(confirmation?.guestLookupToken || "").trim();
  if (!/^[A-Z0-9_-]{6,64}$/i.test(orderId) || paymentKey.length < 6
      || !Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("결제 승인 정보가 올바르지 않습니다.");
  }
  return postJson(
    config.fetchImpl ?? fetch,
    `${String(config.baseUrl).replace(/\/$/, "")}/functions/v1/payment-confirm`,
    { paymentKey, orderId, amount, ...(guestLookupToken ? { guestLookupToken } : {}) },
    {
      apikey: config.anonKey,
      ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
    }
  );
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

export async function requestTossPayment({ clientKey, customerKey, payment }) {
  if (!clientKey) throw new Error("토스페이먼츠 테스트 client key가 필요합니다.");
  const TossPayments = await loadTossSdk();
  if (typeof TossPayments !== "function") throw new Error("토스페이먼츠 SDK 초기화에 실패했습니다.");
  const client = TossPayments(clientKey);
  const checkout = client.payment({ customerKey: customerKey || "ANONYMOUS" });
  return checkout.requestPayment(payment);
}

export { TOSS_SDK_URL };
