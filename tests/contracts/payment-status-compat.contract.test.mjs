import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleText = await readFile(new URL("../../src/frontend/runtime/payment-status-compat.mjs", import.meta.url), "utf8");
const indexText = await readFile(new URL("../../index.html", import.meta.url), "utf8");

test("paid order UI receives customer cancellation action only for completed server status", () => {
  assert.match(moduleText, /const cancelable = orderStatus === "결제 완료" && paymentStatus === "결제 완료"/);
  assert.match(moduleText, /if \(!cancelable\)[\s\S]*existing\?\.remove\(\)/);
  assert.match(moduleText, /dataset\.paymentCancelOrder = orderId/);
  assert.match(moduleText, /orderCompletionCopy\(orderStatus, paymentStatus\)/);
  assert.match(moduleText, /formatOrderDateTime\(rawDate\)/);
  assert.match(moduleText, /complete-page:not\(\.payment-return-page\)/);
  assert.match(indexText, /payment-status-compat\.mjs\?v=20260831-01/);
});
