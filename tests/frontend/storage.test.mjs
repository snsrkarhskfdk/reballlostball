import test from "node:test";
import assert from "node:assert/strict";

import {
  CART_SESSION_KEY,
  LEGACY_SENSITIVE_KEYS,
  clearLegacySensitiveStorage,
  loadCartSession,
  saveCartSession,
} from "../../src/frontend/core/storage.mjs";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    dump: () => Object.fromEntries(values),
  };
}

test("legacy 주문·PII·관리자 키를 모두 정리한다", () => {
  const storage = memoryStorage(Object.fromEntries(LEGACY_SENSITIVE_KEYS.map((key) => [key, "secret"])));
  clearLegacySensitiveStorage(storage);
  assert.deepEqual(storage.dump(), {});
});

test("session cart에는 variantId와 quantity만 저장한다", () => {
  const storage = memoryStorage();
  saveCartSession(storage, [
    {
      variantId: "variant-a",
      quantity: 2,
      price: 999999,
      customer: { name: "저장 금지" },
      selection: { grade: "A" },
    },
  ]);
  const raw = storage.dump()[CART_SESSION_KEY];
  assert.deepEqual(JSON.parse(raw), [{ variantId: "variant-a", quantity: 2 }]);
  assert.doesNotMatch(raw, /price|customer|selection|저장 금지/);
  assert.deepEqual(loadCartSession(storage), [{ variantId: "variant-a", quantity: 2 }]);
});
