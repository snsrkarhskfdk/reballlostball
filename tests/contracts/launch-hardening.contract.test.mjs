import assert from "node:assert/strict";
import test from "node:test";
import { read } from "./helpers.mjs";

const index = read("index.html");
const app = read("app.js");
const content = read("src/frontend/catalog/content.mjs");
const runtime = read("src/frontend/runtime/launch-hardening.mjs");
const toss = read("src/frontend/payments/toss-client.mjs");

test("launch hardening runs before the storefront entry", () => {
  const hardeningIndex = index.indexOf("src/frontend/runtime/launch-hardening.mjs");
  const appIndex = index.indexOf("./app.js");
  assert.ok(hardeningIndex >= 0, "launch hardening module is not loaded");
  assert.ok(appIndex >= 0, "app.js is not loaded");
  assert.ok(hardeningIndex < appIndex, "launch hardening must run before app.js");
});

test("checkout contract hides uncontracted virtual accounts and manual transfer account copy", () => {
  assert.match(content, /methods:\s*Object\.freeze\(\["카드", "계좌이체", "간편결제"\]\)/);
  assert.doesNotMatch(app, /renderCheckoutMethod\("virtual"/);
  assert.match(runtime, /input\[name=["']payment["']\]\[value=["']virtual/);
  assert.match(runtime, /토스페이먼츠 결제 안내/);
  assert.match(runtime, /카드·계좌이체·간편결제는 토스페이먼츠 결제창/);
});

test("Toss payment window is launched from a live user gesture after preparation", () => {
  assert.match(toss, /hasActivePaymentGesture/);
  assert.match(toss, /userActivation/);
  assert.match(runtime, /requestPayment\(prepared\.payment\)/);
  assert.match(runtime, /data-payment-retry/);
});

test("maximum delivery period promised to the PG is visible at checkout and product surfaces", () => {
  assert.match(runtime, /결제일로부터 최대 7일/);
  assert.match(runtime, /data-max-delivery-note/);
});

test("customer payment cancellation and admin shipping use server APIs", () => {
  assert.match(runtime, /"payment-cancel"/);
  assert.match(runtime, /"admin-shipping"/);
  assert.match(runtime, /Idempotency-Key/);
  assert.match(runtime, /trackingNumber/);
});

test("guest lookup token is masked before normal order-page use", () => {
  assert.match(runtime, /launchTokenMasked/);
  assert.match(runtime, /조회 토큰 복사/);
  assert.match(runtime, /••••••••••••/);
});
