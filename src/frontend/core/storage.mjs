export const CART_SESSION_KEY = "reball.cart.session.v2";
export const GUEST_LOOKUP_SESSION_KEY = "reball.guestLookup.session.v1";
export const PENDING_ORDER_ATTEMPT_SESSION_KEY = "reball.pendingOrderAttempt.v1";

export const LEGACY_SENSITIVE_KEYS = Object.freeze([
  "reball.cart",
  "reball.ephemeralOrders",
  "reball.viewer",
  "reball.orders",
  "reball.addresses",
  "reball.paymentMethods",
  "reball.posts",
  "reball.adminUser",
  "reball.adminCredentials",
  "reball.adminProfile",
  "reball.adminCustomers",
  "reball.pendingSignupEmail",
  "reball.pendingSignupLoginId",
  "reball.signupLoginIds",
]);

function safeJson(value, fallback) {
  try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
}

export function clearLegacySensitiveStorage(storage) {
  if (!storage) return;
  for (const key of LEGACY_SENSITIVE_KEYS) {
    try { storage.removeItem(key); } catch {}
  }
}

export function sanitizeCartEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const merged = new Map();
  for (const entry of entries) {
    const variantId = String(entry?.variantId ?? "").trim();
    const quantity = Number(entry?.quantity);
    if (!variantId || !Number.isInteger(quantity) || quantity < 1) continue;
    merged.set(variantId, Math.min(99, (merged.get(variantId) ?? 0) + quantity));
  }
  return [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
}

export function loadCartSession(storage) {
  if (!storage) return [];
  try { return sanitizeCartEntries(safeJson(storage.getItem(CART_SESSION_KEY), [])); } catch { return []; }
}

export function saveCartSession(storage, cart) {
  if (!storage) return;
  const entries = sanitizeCartEntries(
    (Array.isArray(cart) ? cart : []).map((item) => ({ variantId: item?.variantId ?? item?.variant?.id, quantity: item?.quantity }))
  );
  try {
    if (entries.length) {
      storage.setItem(CART_SESSION_KEY, JSON.stringify(entries));
    } else {
      // A successful create-order flow clears the cart only after the server
      // response has been accepted by the app. Clear the persisted idempotency
      // attempt at the same authority boundary, not merely when fetch returns,
      // so a timeout/reload keeps reusing the original key.
      storage.removeItem(CART_SESSION_KEY);
      storage.removeItem(PENDING_ORDER_ATTEMPT_SESSION_KEY);
    }
  } catch {}
}

export function saveGuestLookupSession(storage, value) {
  if (!storage) return;
  const orderId = String(value?.orderId ?? "").trim();
  const lookupToken = String(value?.lookupToken ?? "").trim();
  if (!orderId || !lookupToken) return;
  try { storage.setItem(GUEST_LOOKUP_SESSION_KEY, JSON.stringify({ orderId, lookupToken })); } catch {}
}

export function loadGuestLookupSession(storage) {
  if (!storage) return null;
  try {
    const value = safeJson(storage.getItem(GUEST_LOOKUP_SESSION_KEY), null);
    const orderId = String(value?.orderId ?? "").trim();
    const lookupToken = String(value?.lookupToken ?? "").trim();
    return orderId && lookupToken ? { orderId, lookupToken } : null;
  } catch {
    return null;
  }
}
