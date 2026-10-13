import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const source = readFileSync(new URL("../../src/frontend/runtime/launch-hardening.mjs", import.meta.url), "utf8");
const slice = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
};
function harness() {
  let owner = { userId: "A", epoch: 1 };
  const requests = [], errors = [];
  const button = { disabled: false, textContent: "save", attrs: {},
    setAttribute(k,v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  const fields = Object.fromEntries(["status", "paymentStatus", "delivery", "trackingCompany", "trackingNumber", ".admin-modal-helper"]
    .map(k => [k, { value: "", textContent: "", disabled: false }]));
  class Form { dataset = { orderId: "RB-ORDER-A" }; isConnected = true;
    querySelector(selector) { return fields[selector.match(/name="([^"]+)"/)?.[1] || selector]; } }
  const form = new Form();
  const context = createContext({ HTMLFormElement: Form,
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts.detail; } },
    document: { querySelector: () => button, dispatchEvent: e => e.detail.capture(owner) },
    fetchOrderSnapshot: () => new Promise((resolve,reject) => requests.push({resolve,reject})),
    setInlineStatus: (_form, message) => errors.push(message),
  });
  runInContext(slice("function captureOrderOwner()", "function accessTokenFromStorage()") +
    slice("function configureAdminShippingForm(", "async function saveAdminShipping("), context);
  context.configureAdminShippingForm(form);
  assert.equal(requests.length, 1);
  return { form, fields, button, errors, requests, switchIdentity: () => { owner = { userId: "B", epoch: 2 }; } };
}
const order = { id: "private-order-A", status: "shipped", shippingCarrier: "private-carrier-A", trackingNumber: "private-tracking-A" };
const settle = () => new Promise(resolve => setImmediate(resolve));

test("admin shipping: current owner receives the order and enabled save", async () => {
  const h = harness(); h.requests[0].resolve(order); await settle();
  assert.equal(h.form.dataset.orderDbId, order.id);
  assert.equal(h.fields.trackingNumber.value, order.trackingNumber);
  assert.equal(h.button.disabled, false);
});
for (const detach of [false,true]) {
  for (const failure of [false,true]) {
    test(`admin shipping: ${detach ? "detached form" : "new identity"} suppresses stale ${failure ? "error" : "PII"}`, async () => {
      const h = harness();
      if (detach) h.form.isConnected = false; else h.switchIdentity();
      const before = JSON.stringify({fields:h.fields,button:h.button,dataset:h.form.dataset});
      if (failure) h.requests[0].reject(new Error("private error A")); else h.requests[0].resolve(order);
      await settle();
      assert.equal(JSON.stringify({fields:h.fields,button:h.button,dataset:h.form.dataset}), before);
      assert.deepEqual(h.errors, []);
    });
  }
}

test("admin shipping snapshot cache rejects another identity's delayed response", async () => {
  let owner = { userId: "A", epoch: 1 };
  const requests = [];
  const context = createContext({
    CustomEvent: class { constructor(type, opts) { this.type=type; this.detail=opts.detail; } },
    document: { dispatchEvent: e => e.detail.capture(owner) },
    orderSnapshots: new Map(), loadingOrders: new Map(),
    guestLookupFor: () => null, accessTokenFromStorage: () => "fixture",
    postFunction: () => new Promise(resolve => requests.push(resolve)),
  });
  runInContext(slice("function captureOrderOwner()", "function accessTokenFromStorage()") +
    slice("async function fetchOrderSnapshot(", "function valueForOrderField("), context);
  const first = context.fetchOrderSnapshot("RB-ORDER-A");
  owner = { userId: "B", epoch: 2 };
  requests[0]({ order });
  assert.equal(await first, null);
  assert.equal(context.orderSnapshots.size, 0);
  const second = context.fetchOrderSnapshot("RB-ORDER-A");
  assert.equal(requests.length, 2, "B must perform its own authorized fetch");
  requests[1]({order:{...order,id:"order-B"}});
  assert.equal((await second).id, "order-B");
});
