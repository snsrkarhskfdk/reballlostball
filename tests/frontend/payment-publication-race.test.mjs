import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { confirmTossPayment } from "../../src/frontend/payments/toss-client.mjs";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../../src/frontend/runtime/launch-hardening.mjs", import.meta.url), "utf8");
function production(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Production boundary: ${start}`);
  return source.slice(from, to);
}

function harness(user = "A") {
  const requests = [], listeners = new Map();
  const stored = new Map();
  const storage = { getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  const effects = { routes: [], renders: [], toasts: [], terminal: [], events: [], inline: [], fields: [] };
  const state = { authUser: user ? { id: user } : null, authSession: user ? { access_token: `synthetic-${user}` } : null,
    orders: [], cart: [], paymentRequestState: "idle" };
  const document = {
    querySelector: () => ({ content: "synthetic" }),
    addEventListener: (name, callback) => listeners.set(name, [...(listeners.get(name) || []), callback]),
    dispatchEvent: event => {
      if (event.type === "reball:order-updated") effects.events.push(event.detail);
      for (const callback of listeners.get(event.type) || []) callback(event);
      return true;
    },
  };
  const context = createContext({ state, document, console, URLSearchParams,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    SUPABASE_URL: "synthetic", SUPABASE_KEY: "synthetic", paymentProfile: { methods: [] }, shippingPolicy: {},
    confirm: () => true, createIdempotencyKey: () => "order_synthetic", localStorage: { getItem: () => null }, sessionStorage: storage,
    loadGuestLookupSession: () => ({ orderId: "RB-SYNTHETIC-A", lookupToken: "synthetic-lookup" }),
    normalizeServerOrder: result => result?.order || result,
    paymentReturnKind: () => "success",
    paymentReturnParams: () => new URLSearchParams("orderId=RB-SYNTHETIC-A&paymentKey=synthetic&amount=17000"),
    replacePaymentReturnUrl: path => effects.routes.push(path),
    renderPaymentReturnStatus: status => effects.renders.push(status),
    renderRoute: () => effects.renders.push("route"), showToast: text => effects.toasts.push(text),
    terminalConfirmationFailure: error => error.code === "DECLINED",
    rememberTerminalPaymentFailure: id => effects.terminal.push(id),
    confirmTossPayment: (options, body) => new Promise((resolve, reject) => requests.push({ options, body, resolve, reject })),
  });
  runInContext([
    production(app, "function emptyAuthData(", "function buildViewer("),
    production(app, "function commitServerOrder(", "async function syncSessionState("),
    production(app, "async function handlePaymentReturn(", "function renderOrder("),
  ].join("\n"), context, { filename: "app-production-payment.js" });
  const launch = runtime.replace(/^import .*;\r?\n/gm, "");
  runInContext(launch.slice(0, launch.indexOf('new MutationObserver(')), context, { filename: "runtime-production-payment.js" });
  context.postFunction = (name, body, options) => new Promise((resolve, reject) => requests.push({ name, body, options, resolve, reject }));
  context.setInlineStatus = (_anchor, text, tone) => effects.inline.push({ text, tone });
  context.updateDefinitionField = (_root, name, value) => effects.fields.push({ name, value });
  const button = { dataset: {}, disabled: false, isConnected: true, textContent: "결제 취소", attrs: {}, removed: false,
    setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; },
    closest: () => ({ querySelector: () => ({}) }), remove() { this.removed = true; } };
  return { context, state, effects, requests, button, document, stored, storage };
}

function switchIdentity(h, mode) {
  if (mode !== "direct-B") h.context.emptyAuthData();
  const user = mode === "logout" ? null : mode === "logout-A" ? "A" : "B";
  h.state.authUser = user ? { id: user } : null;
  h.state.authSession = user ? { access_token: `synthetic-${user}` } : null;
  h.state.orders = [{ id: "CURRENT-ORDER", status: "paid" }];
  h.state.paymentRequestState = "current-operation";
  h.button.textContent = "current-session-button";
}

const response = { order: { id: "RB-SYNTHETIC-A", orderNo: "RB-SYNTHETIC-A", status: "canceled" }, paid: true };
function view(h) { return JSON.stringify({ state: h.state, effects: h.effects, button: h.button }); }

for (const mode of ["B", "direct-B", "logout", "logout-A", "guest-member"]) {
  for (const failure of [false, true]) {
    for (const flow of ["confirm", "cancel"]) {
      test(`N0${flow === "confirm" ? "4" : "5"} ${flow}: ${mode} ${failure ? "failure" : "success"} publishes nothing`, async () => {
        const h = harness(mode === "guest-member" ? null : "A");
        const pending = flow === "confirm" ? h.context.handlePaymentReturn() : h.context.cancelPayment("RB-SYNTHETIC-A", h.button);
        assert.equal(h.requests.length, 1, "actual request boundary reached");
        switchIdentity(h, mode);
        const before = view(h);
        if (failure) h.requests[0].reject(Object.assign(new Error("synthetic stale failure"), { code: "DECLINED" }));
        else h.requests[0].resolve(response);
        await pending;
        assert.equal(view(h), before, "stale result must have zero state/event/cache/route/toast/DOM publication");
        assert.equal(runInContext("orderSnapshots.size", h.context), 0, "stale cancellation snapshot must not be cached");
      });
    }
  }
}

for (const user of ["A", null]) {
  for (const flow of ["confirm", "cancel"]) {
    test(`${flow}: same ${user || "guest"} owner succeeds across token refresh`, async () => {
      const h = harness(user);
      const pending = flow === "confirm" ? h.context.handlePaymentReturn() : h.context.cancelPayment("RB-SYNTHETIC-A", h.button);
      h.state.accountLoadSeq = 999;
      if (user) h.state.authSession = { access_token: "synthetic-refreshed-token" };
      h.requests[0].resolve(response);
      await pending;
      assert.equal(h.state.orders[0].id, "RB-SYNTHETIC-A");
      if (flow === "confirm") {
        assert.deepEqual(h.effects.routes, ["/order/RB-SYNTHETIC-A"]);
        assert.equal(h.effects.toasts.length, 1);
      } else {
        assert.equal(h.effects.events.length, 1);
        assert.equal(h.button.removed, true);
        assert.equal(h.effects.fields.length, 2);
      }
    });
  }
}

for (const flow of ["confirm", "cancel"]) {
  test(`${flow}: current failure remains visible`, async () => {
    const h = harness();
    const pending = flow === "confirm" ? h.context.handlePaymentReturn() : h.context.cancelPayment("RB-SYNTHETIC-A", h.button);
    h.requests[0].reject(Object.assign(new Error("synthetic current failure"), { code: "DECLINED" }));
    await pending;
    if (flow === "confirm") assert.deepEqual(h.effects.terminal, ["RB-SYNTHETIC-A"]);
    else { assert.equal(h.effects.inline.length, 1); assert.equal(h.button.disabled, false); }
  });
}

test("N04: newer confirmation owns publication even under the same user", async () => {
  const h = harness(), old = h.context.handlePaymentReturn(), current = h.context.handlePaymentReturn();
  h.requests[1].resolve({ order: { id: "CURRENT-ORDER" }, paid: true });
  await current;
  const before = view(h);
  h.requests[0].resolve(response);
  await old;
  assert.equal(view(h), before);
});

test("N05: consumer rejects unowned events and replay after logout and return", async () => {
  const h = harness();
  h.document.dispatchEvent(new h.context.CustomEvent("reball:order-updated", { detail: response }));
  assert.equal(h.state.orders.length, 0, "consumer must reject missing owner");
  const pending = h.context.cancelPayment("RB-SYNTHETIC-A", h.button);
  h.requests[0].resolve(response);
  await pending;
  const event = h.effects.events.at(-1);
  switchIdentity(h, "logout-A");
  const before = JSON.stringify(h.state);
  h.document.dispatchEvent(new h.context.CustomEvent("reball:order-updated", { detail: event }));
  assert.equal(JSON.stringify(h.state), before, "consumer must independently check epoch");
});

test("N05: ownership is rechecked after synchronous event delivery before DOM writes", async () => {
  const h = harness();
  h.document.addEventListener("reball:order-updated", () => switchIdentity(h, "B"));
  const pending = h.context.cancelPayment("RB-SYNTHETIC-A", h.button);
  h.requests[0].resolve(response);
  await pending;
  assert.equal(h.effects.fields.length, 0);
  assert.equal(h.effects.inline.length, 0);
  assert.equal(h.button.removed, false);
});

test("N05: cancellation snapshot cache cannot be reused by another session", async () => {
  const h = harness(), pending = h.context.cancelPayment("RB-SYNTHETIC-A", h.button);
  h.requests[0].resolve(response);
  await pending;
  switchIdentity(h, "logout-A");
  const lookup = h.context.fetchOrderSnapshot("RB-SYNTHETIC-A");
  assert.equal(h.requests.length, 2, "new ownership must fetch instead of serving the old cancellation snapshot");
  h.requests[1].resolve({ order: { id: "CURRENT-ORDER" } });
  assert.equal((await lookup).id, "CURRENT-ORDER");
});

test("N05: stale snapshot completion cannot overwrite or release a newer session request", async () => {
  const h = harness(), old = h.context.fetchOrderSnapshot("RB-SYNTHETIC-A");
  switchIdentity(h, "B");
  const current = h.context.fetchOrderSnapshot("RB-SYNTHETIC-A");
  assert.equal(h.requests.length, 2, "in-flight lookups must be owned");
  h.requests[0].resolve(response);
  await old;
  assert.equal(runInContext("orderSnapshots.size", h.context), 0);
  assert.equal(runInContext("loadingOrders.size", h.context), 1);
  h.requests[1].resolve({ order: { id: "CURRENT-ORDER" } });
  assert.equal((await current).id, "CURRENT-ORDER");
  assert.equal(runInContext("loadingOrders.size", h.context), 0);
});

for (const mode of ["B", "direct-B", "logout", "logout-A", "guest-member"]) {
for (const failure of [false, true]) {
  test(`N04: real confirmation helper ${mode} cannot ${failure ? "clear" : "publish"} session storage after owner changes`, async () => {
    const h = harness(mode === "guest-member" ? null : "A");
    let release;
    h.context.confirmTossPayment = (config, body) => confirmTossPayment({
      ...config, storage: config.storage || h.storage, locationLike: { search: "", hash: "" }, confirmAutoAttempts: 1,
      fetchImpl: () => new Promise(resolve => { release = resolve; }),
    }, body);
    const pending = h.context.handlePaymentReturn();
    assert.equal(typeof release, "function", "actual payment client dispatched");
    switchIdentity(h, mode);
    h.stored.set("reball.paymentConfirm.RB-SYNTHETIC-A", "current-session-value");
    const before = JSON.stringify([...h.stored]);
    release({ ok: !failure, status: failure ? 400 : 200,
      json: async () => failure ? { code: "DECLINED", message: "synthetic decline" } : { ...response, guestLookupToken: "synthetic-refreshed-token" } });
    await pending;
    assert.equal(JSON.stringify([...h.stored]), before, "helper storage effects must be owned too");
  });
}
}

test("N05: same-owner cache and concurrent request coalescing preserve returned orders", async () => {
  const h = harness(), first = h.context.fetchOrderSnapshot("RB-SYNTHETIC-A"), second = h.context.fetchOrderSnapshot("RB-SYNTHETIC-A");
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(response);
  assert.equal((await first).id, response.order.id);
  assert.equal((await second).id, response.order.id);
  assert.equal((await h.context.fetchOrderSnapshot("RB-SYNTHETIC-A")).id, response.order.id);
  assert.equal(h.requests.length, 1);
});

for (const mode of ["same", "B", "logout-A", "guest-member", "detached"]) {
  test(`N05: order DOM hydration belongs to ${mode} session and connected root`, async () => {
    const h = harness(mode === "guest-member" ? null : "A");
    const root = { dataset: {}, isConnected: true,
      querySelectorAll: () => [{ textContent: "주문번호", nextElementSibling: { textContent: "RB-SYNTHETIC-A" } }],
      querySelector: () => null };
    const pending = h.context.hydrateOrderPage(root);
    assert.equal(h.requests.length, 1);
    if (mode === "detached") root.isConnected = false;
    else if (mode !== "same") switchIdentity(h, mode);
    h.requests[0].resolve(response);
    await pending;
    assert.equal(h.effects.fields.length, mode === "same" ? 3 : 0);
  });
}

test("N05: consumer independently rejects a different owner even at the current epoch", () => {
  const h = harness();
  h.document.dispatchEvent(new h.context.CustomEvent("reball:order-updated", {
    detail: { order: response.order, owner: { userId: "B", epoch: 0 } },
  }));
  assert.equal(h.state.orders.length, 0);
});

test("N05: an unavailable SPA owner fails closed before request dispatch", async () => {
  const h = harness();
  h.document.dispatchEvent = () => true;
  const cancellation = h.context.cancelPayment("RB-SYNTHETIC-A", h.button);
  assert.equal(h.requests.length, 0);
  await cancellation;
  const lookup = h.context.fetchOrderSnapshot("RB-SYNTHETIC-A");
  assert.equal(h.requests.length, 0);
  assert.equal(await lookup, null);
});
