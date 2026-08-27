import {
  HttpError,
  ProviderError,
  cleanString,
  isExplicitNonProductionRuntime,
  providerStatus,
  sanitizeProviderPayload,
  tossAuthorizationHeader,
} from "./core.ts";

export type RefundReceiveAccount = {
  bank: string;
  accountNumber: string;
  holderName: string;
};

export function normalizeRefundReceiveAccount(value: unknown): RefundReceiveAccount | null {
  if (value == null || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_REFUND_ACCOUNT", "환불 계좌 정보를 확인해 주세요.");
  }
  const source = value as Record<string, unknown>;
  const bank = cleanString(source.bank ?? source.bankCode, 10).toUpperCase();
  const accountNumber = cleanString(source.accountNumber, 20);
  const holderName = cleanString(source.holderName, 60);
  if (!/^[A-Z0-9]{2,10}$/.test(bank) || !/^[0-9]{6,20}$/.test(accountNumber)
      || holderName.length < 1 || /[\u0000-\u001f\u007f]/.test(holderName)) {
    throw new HttpError(400, "INVALID_REFUND_ACCOUNT", "환불 계좌 정보를 확인해 주세요.");
  }
  return { bank, accountNumber, holderName };
}

export type ProviderPayment = Record<string, unknown>;

export function assertMockPaymentProviderAllowed(): void {
  if (!isExplicitNonProductionRuntime()) {
    throw new HttpError(503, "MOCK_PROVIDER_DISABLED", "Mock payments are disabled outside explicit non-production runtimes");
  }
}

export interface PaymentProvider {
  name: "toss_payments" | "mock";
  confirm(input: { paymentKey: string; orderId: string; amount: number; idempotencyKey: string; scenario?: string }): Promise<ProviderPayment>;
  get(paymentKey: string): Promise<ProviderPayment>;
  cancel(input: { paymentKey: string; orderId: string; amount: number; cancelReason: string; cancelAmount?: number; idempotencyKey: string; scenario?: string; refundReceiveAccount?: RefundReceiveAccount }): Promise<ProviderPayment>;
}

export type PaymentConfirmationDisposition = "success" | "reconcile" | "terminal_failure";

export function paymentConfirmationDisposition(value: unknown): PaymentConfirmationDisposition {
  const status = providerStatus(value);
  if (status === "DONE" || status === "WAITING_FOR_DEPOSIT") return "success";
  if (status === "ABORTED" || status === "EXPIRED") return "terminal_failure";
  return "reconcile";
}

const RETRYABLE_PROVIDER_ERROR_CODES = new Set([
  "IDEMPOTENT_REQUEST_PROCESSING",
  "PROVIDER_ERROR",
  "FORBIDDEN_CONSECUTIVE_REQUEST",
  "ALREADY_PROCESSED_PAYMENT",
  "ALREADY_CANCELED_PAYMENT",
  "FAILED_INTERNAL_SYSTEM_PROCESSING",
  "FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING",
]);

export function providerFailureIsDefinitive(status: number, code: unknown): boolean {
  const normalizedCode = cleanString(code, 100).toUpperCase();
  if (RETRYABLE_PROVIDER_ERROR_CODES.has(normalizedCode)) return false;
  if (new Set([408, 425, 429]).has(status) || status >= 500) return false;
  return status >= 400 && status < 500;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 15_000): Promise<ProviderPayment> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as ProviderPayment;
    if (!response.ok) {
      const code = cleanString(payload.code || payload.error, 100) || "PAYMENT_PROVIDER_ERROR";
      const message = cleanString(payload.message, 240) || "Payment provider request failed";
      throw new ProviderError(response.status, code, message, providerFailureIsDefinitive(response.status, code), payload);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(502, "PAYMENT_PROVIDER_UNREACHABLE", "Payment provider response is unknown", false);
  } finally {
    clearTimeout(timeout);
  }
}

class TossPaymentsProvider implements PaymentProvider {
  readonly name = "toss_payments" as const;
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor() {
    const configuredBaseUrl = String(
      Deno.env.get("TOSS_PAYMENTS_API_URL") || "https://api.tosspayments.com",
    ).trim();
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(configuredBaseUrl);
    } catch {
      throw new HttpError(503, "PAYMENT_CONFIG_MISSING", "Invalid payment provider API URL");
    }
    const official = parsedBaseUrl.origin === "https://api.tosspayments.com";
    const localTest = isExplicitNonProductionRuntime()
      && new Set(["localhost", "127.0.0.1"]).has(parsedBaseUrl.hostname)
      && new Set(["http:", "https:"]).has(parsedBaseUrl.protocol);
    if ((!official && !localTest) || parsedBaseUrl.username || parsedBaseUrl.password
        || parsedBaseUrl.pathname !== "/" || parsedBaseUrl.search || parsedBaseUrl.hash) {
      throw new HttpError(503, "PAYMENT_CONFIG_MISSING", "Invalid payment provider API URL");
    }
    this.baseUrl = parsedBaseUrl.origin;
    this.authorization = tossAuthorizationHeader(Deno.env.get("TOSS_SECRET_KEY") || Deno.env.get("TOSS_PAYMENTS_SECRET_KEY") || "");
  }

  private headers(idempotencyKey?: string): Headers {
    const headers = new Headers({
      Authorization: this.authorization,
      "Content-Type": "application/json",
    });
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
    return headers;
  }

  confirm(input: { paymentKey: string; orderId: string; amount: number; idempotencyKey: string }): Promise<ProviderPayment> {
    return fetchJson(`${this.baseUrl}/v1/payments/confirm`, {
      method: "POST",
      headers: this.headers(input.idempotencyKey),
      body: JSON.stringify({ paymentKey: input.paymentKey, orderId: input.orderId, amount: input.amount }),
    });
  }

  get(paymentKey: string): Promise<ProviderPayment> {
    return fetchJson(`${this.baseUrl}/v1/payments/${encodeURIComponent(paymentKey)}`, {
      method: "GET",
      headers: this.headers(),
    });
  }

  cancel(input: { paymentKey: string; orderId: string; amount: number; cancelReason: string; cancelAmount?: number; idempotencyKey: string; refundReceiveAccount?: RefundReceiveAccount }): Promise<ProviderPayment> {
    const body: Record<string, unknown> = { cancelReason: input.cancelReason };
    if (Number.isSafeInteger(input.cancelAmount) && Number(input.cancelAmount) > 0) body.cancelAmount = input.cancelAmount;
    if (input.refundReceiveAccount) body.refundReceiveAccount = input.refundReceiveAccount;
    return fetchJson(`${this.baseUrl}/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`, {
      method: "POST",
      headers: this.headers(input.idempotencyKey),
      body: JSON.stringify(body),
    });
  }
}

class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;

  private scenario(value?: string): string {
    const scenario = cleanString(value || Deno.env.get("MOCK_PAYMENT_SCENARIO") || "success", 40).toLowerCase();
    assertMockPaymentProviderAllowed();
    return scenario;
  }

  async confirm(input: { paymentKey: string; orderId: string; amount: number; idempotencyKey: string; scenario?: string }): Promise<ProviderPayment> {
    const scenario = this.scenario(input.scenario);
    if (scenario === "timeout") throw new ProviderError(502, "MOCK_TIMEOUT", "Mock provider response is unknown", false);
    if (scenario === "failure") throw new ProviderError(400, "MOCK_REJECTED", "Mock payment rejected", true);
    const waiting = scenario === "waiting";
    return {
      paymentKey: input.paymentKey,
      orderId: input.orderId,
      totalAmount: input.amount,
      status: waiting ? "WAITING_FOR_DEPOSIT" : "DONE",
      method: waiting ? "VIRTUAL_ACCOUNT" : "CARD",
      transactionKey: `mock-${input.idempotencyKey.slice(0, 24)}`,
      approvedAt: waiting ? null : new Date().toISOString(),
      secret: waiting ? `mock-secret-${input.orderId}` : undefined,
      virtualAccount: waiting ? { dueDate: new Date(Date.now() + 86_400_000).toISOString() } : undefined,
    };
  }

  async get(paymentKey: string): Promise<ProviderPayment> {
    const waiting = paymentKey.toLowerCase().includes("waiting");
    return { paymentKey, status: waiting ? "WAITING_FOR_DEPOSIT" : "DONE" };
  }

  async cancel(input: { paymentKey: string; orderId: string; amount: number; cancelReason: string; cancelAmount?: number; idempotencyKey: string; scenario?: string; refundReceiveAccount?: RefundReceiveAccount }): Promise<ProviderPayment> {
    const scenario = this.scenario(input.scenario);
    if (scenario === "timeout") throw new ProviderError(502, "MOCK_TIMEOUT", "Mock cancellation response is unknown", false);
    if (scenario === "failure") throw new ProviderError(400, "MOCK_CANCEL_REJECTED", "Mock cancellation rejected", true);
    const mismatch = scenario === "mismatch";
    return {
      paymentKey: mismatch ? "pk_unrelated_payment" : input.paymentKey,
      orderId: mismatch ? "RB-UNRELATED-ORDER" : input.orderId,
      totalAmount: mismatch ? input.amount + 1 : input.amount,
      status: "CANCELED",
      cancels: [{ cancelAmount: input.cancelAmount || 0, cancelReason: input.cancelReason }],
    };
  }
}

export function paymentProvider(): PaymentProvider {
  const provider = cleanString(Deno.env.get("PAYMENT_PROVIDER") || "toss_payments", 40).toLowerCase();
  if (provider === "mock") {
    assertMockPaymentProviderAllowed();
    return new MockPaymentProvider();
  }
  if (provider === "toss_payments") return new TossPaymentsProvider();
  throw new HttpError(503, "PAYMENT_CONFIG_MISSING", "결제 설정을 확인할 수 없습니다.");
}

export function normalizedProviderResult(payment: ProviderPayment): {
  status: string;
  paymentKey: string;
  orderId: string;
  amount: number;
  canceledAmount: number;
  transactionId: string;
  approvalNo: string;
  approvedAt: string | null;
  secret: string;
  virtualDueAt: string | null;
  safePayload: Record<string, unknown>;
} {
  const card = payment.card && typeof payment.card === "object" ? payment.card as Record<string, unknown> : {};
  const virtual = payment.virtualAccount && typeof payment.virtualAccount === "object"
    ? payment.virtualAccount as Record<string, unknown> : {};
  const totalAmount = Number(payment.totalAmount ?? payment.amount);
  const balanceAmount = Number(payment.balanceAmount);
  const cancels = Array.isArray(payment.cancels) ? payment.cancels : [];
  const cancellationSum = cancels.reduce((sum, entry) => {
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const amount = Number(row.cancelAmount);
    return Number.isSafeInteger(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
  const balanceDerived = Number.isSafeInteger(totalAmount) && Number.isSafeInteger(balanceAmount)
    ? Math.max(0, totalAmount - balanceAmount)
    : 0;
  return {
    status: providerStatus(payment.status),
    paymentKey: cleanString(payment.paymentKey, 200),
    orderId: cleanString(payment.orderId, 64),
    amount: Number(payment.totalAmount ?? payment.balanceAmount ?? payment.amount),
    canceledAmount: Math.max(cancellationSum, balanceDerived),
    transactionId: cleanString(payment.transactionKey, 200),
    approvalNo: cleanString(card.approveNo ?? payment.approvalNo, 100),
    approvedAt: cleanString(payment.approvedAt, 80) || null,
    secret: cleanString(payment.secret, 500),
    virtualDueAt: cleanString(virtual.dueDate, 80) || null,
    safePayload: sanitizeProviderPayload(payment) as Record<string, unknown>,
  };
}
