import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleText = await readFile(new URL("../../src/frontend/runtime/payment-status-compat.mjs", import.meta.url), "utf8");
const indexText = await readFile(new URL("../../index.html", import.meta.url), "utf8");

test("paid order UI receives customer cancellation action for server done status", () => {
  assert.match(moduleText, /orderStatus !== "결제 완료"/);
  assert.match(moduleText, /paymentStatus !== "결제 완료"/);
  assert.match(moduleText, /dataset\.paymentCancelOrder = orderId/);
  assert.match(indexText, /payment-status-compat\.mjs/);
});
