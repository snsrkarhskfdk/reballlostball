import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const source = readFileSync(new URL("../../supabase/functions/admin-orders-page/index.ts", import.meta.url), "utf8");
const start = source.indexOf("function orderSearchText(");
const end = source.indexOf("\nfunction applyScopeStatus(", start);
assert.ok(start >= 0 && end > start);
// Execute the actual Edge search function; strip only its TypeScript annotations.
const searchSource = source.slice(start, end)
  .replace(/: (?:AnyRow|boolean|OrderScope|string)(?=\s*[,)=\{])/g, "")
  .replace(/ as AnyRow/g, "");
const context = createContext({});
runInContext(searchSource, context);

const order = {
  order_no: "RB-SEARCH-0001", status: "paid", payment_status: "done",
  payment_method: "card", payment_provider: "toss_payments", total_krw: 23500,
  address_snapshot: { receiverName: "김고객", receiverPhone: "010-1234-5678", roadAddress: "서울시 골프길 10" },
  order_items: [{ product_name: "타이틀리스트", variant_name: "화이트 A" }, { product_name: "SRIXON", variant_name: "Z-STAR" }],
};

test("server order search retains the console's product and variant phrase", () => {
  const text = context.orderSearchText(order, true, "orders");
  assert.ok(text.includes("타이틀리스트 화이트"));
  assert.ok(text.includes("srixon z-star"));
});

test("server order search preserves adjacent order, recipient and address fields", () => {
  const text = context.orderSearchText(order, true, "orders");
  assert.ok(text.includes("rb-search-0001 김고객 010-1234-5678 서울시 골프길 10"));
});

test("shipping search retains consecutive product names without interleaved variants", () => {
  const text = context.orderSearchText(order, true, "shipping");
  assert.ok(text.includes("타이틀리스트 srixon"));
});

test("non-PII roles do not gain recipient, address or product text through search", () => {
  const text = context.orderSearchText(order, false, "orders");
  assert.ok(text.includes("rb-search-0001"));
  for (const restricted of ["김고객", "010-1234-5678", "골프길", "타이틀리스트", "srixon"]) {
    assert.equal(text.includes(restricted), false);
  }
});

test("legacy snake-case address keys and missing items remain searchable without throwing", () => {
  const legacy = { ...order, address_snapshot: { receiver_name: "박고객", receiver_phone: "010-0000-1111", road_address: "부천시 골프길" }, order_items: null };
  assert.ok(context.orderSearchText(legacy, true, "orders").includes("박고객 010-0000-1111 부천시 골프길"));
});
