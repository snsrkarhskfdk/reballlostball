export class HttpError extends Error {
  status: number;
  code: string;
  retryAfter?: number;

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export class ProviderError extends Error {
  status: number;
  code: string;
  definitive: boolean;
  payload: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    definitive: boolean,
    payload: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.code = code;
    this.definitive = definitive;
    this.payload = payload;
  }
}

export function cleanString(value: unknown, maxLength = 1000): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function normalizeEmail(value: unknown): string {
  return cleanString(value, 254).toLowerCase();
}

export function normalizeLoginId(value: unknown): string {
  return cleanString(value, 20).toLowerCase();
}

export function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 20);
}

export function isExplicitNonProductionRuntime(): boolean {
  const environment = cleanString(Deno.env.get("DENO_ENV"), 20).toLowerCase();
  return new Set(["development", "dev", "local", "test"]).has(environment);
}

export function isEmailLike(value: string): boolean {
  return value.length <= 254 && /^[^\s@(),]+@[^\s@(),]+\.[^\s@(),]+$/.test(value);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function assertObject(value: unknown, message = "Invalid request body"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_REQUEST", message);
  }
  return value as Record<string, unknown>;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function aesGcmKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  if (secret.length < 32) throw new HttpError(503, "SECURITY_CONFIG_MISSING", "Security configuration is unavailable");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, usages);
}

export async function encryptSensitiveJson(secret: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesGcmKey(secret, ["encrypt"]);
  const plaintext = new TextEncoder().encode(stableStringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptSensitiveJson(secret: string, value: string): Promise<unknown> {
  const parts = cleanString(value, 4096).split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new HttpError(422, "INVALID_SENSITIVE_CIPHERTEXT", "Sensitive request state is invalid");
  }
  try {
    const iv = base64UrlToBytes(parts[1]);
    const ciphertext = base64UrlToBytes(parts[2]);
    if (iv.length !== 12 || ciphertext.length < 17) throw new Error("invalid ciphertext");
    const key = await aesGcmKey(secret, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer,
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, "INVALID_SENSITIVE_CIPHERTEXT", "Sensitive request state is invalid");
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Base64Url(secret: string, value: string): Promise<string> {
  if (secret.length < 32) throw new HttpError(503, "SECURITY_CONFIG_MISSING", "Security configuration is unavailable");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  if (secret.length < 32) throw new HttpError(503, "SECURITY_CONFIG_MISSING", "Security configuration is unavailable");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(signature));
}

export function constantTimeEqual(left: string, right: string): boolean {
  const size = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < size; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function normalizePaymentMethod(value: unknown): "card" | "transfer" | "virtual_account" | "easy_pay" {
  const method = cleanString(value, 40).toLowerCase();
  const aliases: Record<string, "card" | "transfer" | "virtual_account" | "easy_pay"> = {
    card: "card",
    transfer: "transfer",
    virtual: "virtual_account",
    virtual_account: "virtual_account",
    easy: "easy_pay",
    easy_pay: "easy_pay",
  };
  if (!aliases[method]) throw new HttpError(400, "INVALID_PAYMENT_METHOD", "지원하지 않는 결제수단입니다.");
  return aliases[method];
}

export function normalizeItems(value: unknown): Array<{ variantId: string; quantity: number }> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw new HttpError(400, "INVALID_ITEMS", "주문 상품을 확인해 주세요.");
  }
  const items = value.map((raw) => {
    const row = assertObject(raw, "주문 상품을 확인해 주세요.");
    const variantId = cleanString(row.variantId, 36).toLowerCase();
    const quantity = Number(row.quantity);
    if (!isUuid(variantId) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new HttpError(400, "INVALID_ITEMS", "주문 상품을 확인해 주세요.");
    }
    return { variantId, quantity };
  });
  const uniqueVariants = new Set(items.map((item) => item.variantId));
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  if (uniqueVariants.size !== items.length || totalUnits > 20) {
    throw new HttpError(400, "INVALID_ITEMS", "주문 상품을 확인해 주세요.");
  }
  return items;
}

export function normalizeAddress(value: unknown): Record<string, string> {
  const row = assertObject(value, "배송지 정보를 확인해 주세요.");
  const address = {
    receiverName: cleanString(row.receiverName ?? row.name, 80),
    receiverPhone: normalizePhone(row.receiverPhone ?? row.phone),
    zipCode: cleanString(row.zipCode ?? row.postalCode, 5),
    roadAddress: cleanString(row.roadAddress ?? row.address, 240),
    detailAddress: cleanString(row.detailAddress, 240),
    memo: cleanString(row.memo, 240),
  };
  if (!address.receiverName || !/^[0-9]{9,11}$/.test(address.receiverPhone)
      || !/^[0-9]{5}$/.test(address.zipCode) || !address.roadAddress) {
    throw new HttpError(400, "INVALID_ADDRESS", "배송지 정보를 확인해 주세요.");
  }
  return address;
}

export function tossAuthorizationHeader(secretKey: string): string {
  if (!/^(test|live)_(g?sk)_/.test(secretKey)) {
    throw new HttpError(503, "PAYMENT_CONFIG_MISSING", "결제 설정을 확인할 수 없습니다.");
  }
  return `Basic ${btoa(`${secretKey}:`)}`;
}

const PROVIDER_PAYLOAD_SCHEMA = Object.freeze({
  root: Object.freeze({
    version: true,
    paymentKey: true,
    type: true,
    orderId: true,
    orderName: true,
    mId: true,
    currency: true,
    method: true,
    totalAmount: true,
    balanceAmount: true,
    status: true,
    requestedAt: true,
    approvedAt: true,
    useEscrow: true,
    lastTransactionKey: true,
    transactionKey: true,
    suppliedAmount: true,
    vat: true,
    cultureExpense: true,
    taxFreeAmount: true,
    taxExemptionAmount: true,
    isPartialCancelable: true,
    cancels: "cancel",
    card: "card",
    virtualAccount: "virtualAccount",
    transfer: "transfer",
    easyPay: "easyPay",
    failure: "failure",
  }),
  cancel: Object.freeze({
    cancelAmount: true,
    cancelReason: true,
    taxFreeAmount: true,
    taxExemptionAmount: true,
    refundableAmount: true,
    easyPayDiscountAmount: true,
    canceledAt: true,
    transactionKey: true,
    cancelStatus: true,
    cancelRequestId: true,
  }),
  card: Object.freeze({
    issuerCode: true,
    acquirerCode: true,
    approveNo: true,
    installmentPlanMonths: true,
    useCardPoint: true,
    cardType: true,
    ownerType: true,
    acquireStatus: true,
    isInterestFree: true,
    interestPayer: true,
    amount: true,
  }),
  virtualAccount: Object.freeze({
    dueDate: true,
    refundStatus: true,
    expired: true,
    settlementStatus: true,
  }),
  transfer: Object.freeze({ bankCode: true, settlementStatus: true }),
  easyPay: Object.freeze({ provider: true, amount: true, discountAmount: true }),
  failure: Object.freeze({ code: true }),
}) as Record<string, Record<string, true | string>>;

function safeProviderPrimitive(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return undefined;
}

function projectProviderPayload(value: unknown, scope: string): unknown {
  const schema = PROVIDER_PAYLOAD_SCHEMA[scope];
  if (!schema) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 100)
      .map((entry) => projectProviderPayload(entry, scope))
      .filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, rule] of Object.entries(schema)) {
    if (!Object.hasOwn(source, key)) continue;
    const projected = rule === true
      ? safeProviderPrimitive(source[key])
      : projectProviderPayload(source[key], rule);
    if (projected !== undefined) output[key] = projected;
  }
  return output;
}

export function sanitizeProviderPayload(value: unknown): unknown {
  return projectProviderPayload(value, "root") || {};
}

export function providerStatus(value: unknown): string {
  const status = cleanString(value, 40).toUpperCase();
  const allowed = new Set([
    "READY", "IN_PROGRESS", "WAITING_FOR_DEPOSIT", "DONE",
    "CANCELED", "PARTIAL_CANCELED", "ABORTED", "EXPIRED",
  ]);
  if (!allowed.has(status)) throw new HttpError(422, "UNSUPPORTED_PAYMENT_STATUS", "지원하지 않는 결제 상태입니다.");
  return status;
}

export function safeIsoDate(value: unknown): string | null {
  const raw = cleanString(value, 80);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
