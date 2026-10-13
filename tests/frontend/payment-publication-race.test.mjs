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
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
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

function preparationHarness(user = "A") {
  const h = harness(user);
  h.context.loadTossSdk = () => Promise.resolve();
  h.context.prepareTossPayment = (config, orderId) => new Promise((resolve, reject) => {
    h.requests.push({ config, orderId, resolve, reject });
  });
  class RetryButton {
    constructor() {
      this.dataset = { paymentRetry: "RB-SYNTHETIC-A" };
      this.disabled = false;
      this.isConnected = true;
      this.textContent = "Retry";
      this.attrs = {};
    }
    setAttribute(name, value) { this.attrs[name] = value; }
    removeAttribute(name) { delete this.attrs[name]; }
    closest(selector) { return selector === "[data-payment-retry]" ? this : null; }
  }
  h.context.Element = RetryButton;
  h.context.HTMLButtonElement = RetryButton;
  h.button = new RetryButton();
  h.sdkRequests = [];
  h.context.TossPayments = () => ({ payment: ({ customerKey }) => ({
    requestPayment: payment => new Promise((resolve, reject) => {
      h.sdkRequests.push({ customerKey, payment, resolve, reject });
    }),
  }) });
  h.click = () => h.document.dispatchEvent({ type: "click", target: h.button,
    preventDefault() {}, stopImmediatePropagation() {} });
  return h;
}

const preparedFor = (customerKey = "A") => ({
  clientKey: "synthetic-client-key", customerKey,
  payment: { orderId: "RB-SYNTHETIC-A", successUrl: "https://synthetic.invalid/return" },
});
const flushPreparation = () => new Promise(resolve => setImmediate(resolve));

for (const mode of ["B", "direct-B", "logout", "logout-A", "guest-member"]) {
  test(`prepare: ${mode} neither reuses completed capability nor launches prior owner's SDK`, async () => {
    const h = preparationHarness(mode === "guest-member" ? null : "A");
    const initial = h.context.primePayment("RB-SYNTHETIC-A");
    h.requests[0].resolve(preparedFor());
    await initial;
    switchIdentity(h, mode);
    assert.throws(() => h.context.requestPreparedPayment("RB-SYNTHETIC-A"));
    assert.equal(h.sdkRequests.length, 0);
    h.click();
    assert.equal(h.sdkRequests.length, 0, "stale cache must trigger fresh preparation on click");
    const current = h.context.primePayment("RB-SYNTHETIC-A");
    assert.equal(h.requests.length, 2, "current owner must obtain fresh server authority");
    h.requests[1].resolve(preparedFor("current"));
    assert.equal((await current).customerKey, "current");
  });

  test(`prepare: ${mode} stale completion cannot publish or clear newer request`, async () => {
    const h = preparationHarness(mode === "guest-member" ? null : "A");
    const old = h.context.primePayment("RB-SYNTHETIC-A");
    switchIdentity(h, mode);
    const current = h.context.primePayment("RB-SYNTHETIC-A");
    assert.equal(h.requests.length, 2);
    h.requests[0].resolve(preparedFor());
    await old;
    assert.equal(runInContext("preparedPayments.size", h.context), 0);
    assert.equal(runInContext("preparingPayments.size", h.context), 1);
    const joined = h.context.primePayment("RB-SYNTHETIC-A");
    assert.equal(h.requests.length, 2, "old cleanup must not discard the current request");
    h.requests[1].resolve(preparedFor("current"));
    assert.equal((await current).customerKey, "current");
    assert.equal((await joined).customerKey, "current");
  });

  for (const flow of ["decorate", "click"]) {
    for (const failure of [false, true]) {
      test(`prepare ${flow}: ${mode} stale ${failure ? "error" : "success"} cannot update retry DOM`, async () => {
        const h = preparationHarness(mode === "guest-member" ? null : "A");
        if (flow === "decorate") h.context.decoratePaymentRetry(h.button);
        else h.click();
        assert.equal(h.requests.length, 1);
        switchIdentity(h, mode);
        const before = JSON.stringify({ button: h.button, inline: h.effects.inline });
        if (failure) h.requests[0].reject(new Error("stale synthetic preparation failure"));
        else h.requests[0].resolve(preparedFor());
        await flushPreparation();
        assert.equal(JSON.stringify({ button: h.button, inline: h.effects.inline }), before);
        assert.equal(runInContext("preparedPayments.size", h.context), 0);
      });
    }
  }

  for (const failure of [false, true]) {
  test(`payment SDK: ${mode} stale ${failure ? "error" : "success"} cannot update retry DOM`, async () => {
    const h = preparationHarness(mode === "guest-member" ? null : "A");
    const pending = h.context.primePayment("RB-SYNTHETIC-A");
    h.requests[0].resolve(preparedFor());
    await pending;
    h.click();
    assert.equal(h.sdkRequests.length, 1);
    switchIdentity(h, mode);
    const before = JSON.stringify({ button: h.button, inline: h.effects.inline });
    if (failure) h.sdkRequests[0].reject(new Error("stale synthetic SDK failure"));
    else h.sdkRequests[0].resolve();
    await flushPreparation();
    assert.equal(JSON.stringify({ button: h.button, inline: h.effects.inline }), before);
  });
  }
}

for (const user of ["A", null]) {
  test(`prepare: same ${user || "guest"} owner coalesces and survives token refresh`, async () => {
    const h = preparationHarness(user);
    const first = h.context.primePayment("RB-SYNTHETIC-A");
    if (user) h.state.authSession = { access_token: "synthetic-refreshed-token" };
    const second = h.context.primePayment("RB-SYNTHETIC-A");
    assert.equal(h.requests.length, 1);
    const customerKey = user || "guest";
    h.requests[0].resolve(preparedFor(customerKey));
    assert.equal((await first).customerKey, customerKey);
    assert.equal((await second).customerKey, customerKey);
    assert.equal((await h.context.primePayment("RB-SYNTHETIC-A")).customerKey, customerKey);
    h.click();
    assert.equal(h.sdkRequests.length, 1);
    h.sdkRequests[0].reject(new Error("current SDK failure"));
    await flushPreparation();
    assert.equal(h.button.disabled, false);
    assert.equal(h.effects.inline.at(-1).text, "current SDK failure");
  });
}

for (const flow of ["decorate", "click"]) {
  for (const failure of [false, true]) {
    test(`prepare ${flow}: current ${failure ? "error" : "success"} remains visible`, async () => {
      const h = preparationHarness();
      if (flow === "decorate") h.context.decoratePaymentRetry(h.button);
      else h.click();
      if (failure) h.requests[0].reject(new Error("current preparation failure"));
      else h.requests[0].resolve(preparedFor());
      await flushPreparation();
      assert.equal(h.effects.inline.length, 1);
      if (failure) assert.equal(h.effects.inline[0].text, "current preparation failure");
      else assert.equal(h.button.disabled, false);
    });

    test(`prepare ${flow}: detached button ignores ${failure ? "error" : "success"}`, async () => {
      const h = preparationHarness();
      if (flow === "decorate") h.context.decoratePaymentRetry(h.button);
      else h.click();
      h.button.isConnected = false;
      const before = JSON.stringify({ button: h.button, inline: h.effects.inline });
      if (failure) h.requests[0].reject(new Error("detached preparation failure"));
      else h.requests[0].resolve(preparedFor());
      await flushPreparation();
      assert.equal(JSON.stringify({ button: h.button, inline: h.effects.inline }), before);
    });
  }
}

test("prepare: unavailable owner fails closed before fetch or SDK", async () => {
  const h = preparationHarness();
  h.document.dispatchEvent = () => true;
  const pending = h.context.primePayment("RB-SYNTHETIC-A");
  assert.equal(h.requests.length, 0);
  assert.equal(await pending, null);
  assert.throws(() => h.context.requestPreparedPayment("RB-SYNTHETIC-A"));
  assert.equal(h.sdkRequests.length, 0);
});

for (const stale of [false, true]) {
  test(`payment SDK: synchronous ${stale ? "stale" : "current"} failure respects ownership`, async () => {
    const h = preparationHarness();
    const pending = h.context.primePayment("RB-SYNTHETIC-A");
    h.requests[0].resolve(preparedFor());
    await pending;
    let before;
    h.context.TossPayments = () => {
      if (stale) switchIdentity(h, "B");
      before = JSON.stringify({ button: h.button, inline: h.effects.inline });
      throw new Error("synchronous SDK failure");
    };
    h.click();
    if (stale) assert.equal(JSON.stringify({ button: h.button, inline: h.effects.inline }), before);
    else {
      assert.equal(h.button.disabled, false);
      assert.equal(h.effects.inline.at(-1).text, "synchronous SDK failure");
    }
  });
}

test("prepare UI: unavailable owner cannot bind, dispatch, or change a retry button", () => {
  const h = preparationHarness();
  h.context.captureOrderOwner = () => null;
  const before = JSON.stringify(h.button);
  h.context.decoratePaymentRetry(h.button);
  h.click();
  assert.equal(JSON.stringify(h.button), before);
  assert.equal(h.requests.length, 0);
  assert.equal(h.sdkRequests.length, 0);
});

test("prepare: invalid provider result never becomes a usable capability", async () => {
  const h = preparationHarness();
  h.context.decoratePaymentRetry(h.button);
  h.requests[0].resolve({ payment: {}, clientKey: "synthetic" });
  await flushPreparation();
  assert.equal(runInContext("preparedPayments.size", h.context), 0);
  assert.equal(h.button.disabled, true);
  assert.equal(h.effects.inline.length, 1);
  assert.throws(() => h.context.requestPreparedPayment("RB-SYNTHETIC-A"));
});

test("prepare UI: SDK load failure stays visible for the current owner", async () => {
  const h = preparationHarness();
  h.context.loadTossSdk = () => Promise.reject(new Error("synthetic SDK load failure"));
  h.context.decoratePaymentRetry(h.button);
  h.requests[0].resolve(preparedFor());
  await flushPreparation();
  assert.equal(h.button.disabled, true);
  assert.equal(h.effects.inline.at(-1).text, "synthetic SDK load failure");
  assert.equal(runInContext("preparedPayments.size", h.context), 0);
});

for (const mode of ["B", "logout-A", "guest-member"]) {
  test(`prepare UI: ${mode} can rebind the same connected retry button`, async () => {
    const h = preparationHarness(mode === "guest-member" ? null : "A");
    h.context.decoratePaymentRetry(h.button);
    switchIdentity(h, mode);
    h.context.decoratePaymentRetry(h.button);
    assert.equal(h.requests.length, 2, "fresh owner must not inherit the permanent bound marker");
    h.context.decoratePaymentRetry(h.button);
    assert.equal(h.requests.length, 2, "same owner hardening must remain idempotent");
    h.requests[0].resolve(preparedFor("old"));
    await flushPreparation();
    assert.equal(h.button.disabled, true, "stale completion cannot enable current pending preparation");
    h.requests[1].resolve(preparedFor("current"));
    await flushPreparation();
    assert.equal(h.button.disabled, false);
    h.click();
    assert.equal(h.sdkRequests.length, 1);
    assert.equal(h.sdkRequests[0].customerKey, "current");
    h.sdkRequests[0].resolve();
  });
}

function authPreparationHarness() {
  const h = preparationHarness(null);
  h.context.queueMicrotask = queueMicrotask;
  h.document.querySelectorAll = selector => selector === "[data-payment-retry]" ? [h.button] : [];
  h.context.loadAccountData = () => new Promise(resolve => { h.completeAccount = resolve; });
  h.context.loadCurrentAuthRoles = async () => {};
  h.context.parseRoute = () => "/payment/fail";
  h.context.handleAuthCallbackHash = async () => false;
  h.context.handlePaymentReturn = async () => true;
  h.context.paymentReturnKind = () => "fail";
  h.context.normalizeAuthError = error => error.message;
  h.context.buildViewer = () => ({});
  h.context.supabase = { auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: callback => { h.emitAuth = callback; },
  } };
  h.notices = [];
  h.document.addEventListener("reball:order-owner-changed", () => h.notices.push({
    owner: h.context.captureOrderOwner(), token: h.state.authSession?.access_token,
  }));
  runInContext(production(app, "async function syncSessionState(", "async function handleAuthFormSubmit("), h.context);
  return h;
}

for (const path of ["syncSessionState", "auth-listener"]) {
  test(`prepare UI: actual ${path} publishes stable auth owner and retries without route render`, async () => {
    const h = authPreparationHarness();
    if (path === "auth-listener") await h.context.initializeAuth();
    h.context.decoratePaymentRetry(h.button);
    const epoch = h.state.authEpoch || 0;
    const session = { user: { id: "A" }, access_token: "synthetic-member-token" };
    const pending = path === "syncSessionState"
      ? h.context.syncSessionState(session)
      : h.emitAuth("SIGNED_IN", session);
    await flushPreparation();
    assert.equal(typeof h.completeAccount, "function", "account load is still pending");
    assert.equal(h.notices.length, 1, "actual auth assignment must announce the stable owner");
    assert.equal(h.notices[0].owner.userId, "A");
    assert.ok(h.notices[0].owner.epoch > epoch);
    assert.equal(h.notices[0].token, session.access_token);
    assert.equal(h.effects.renders.length, 0);
    assert.equal(h.requests.length, 2, "notification must rebind the existing button before account await");
    h.requests[0].resolve(preparedFor("guest"));
    await flushPreparation();
    assert.equal(h.button.disabled, true);
    h.requests[1].resolve(preparedFor("A"));
    await flushPreparation();
    assert.equal(h.button.disabled, false);
    h.completeAccount();
    await pending;
    await flushPreparation();
    assert.equal(h.effects.renders.length, 0, "payment-return route deliberately keeps the connected DOM");
    h.click();
    assert.equal(h.sdkRequests.length, 1);
    assert.equal(h.sdkRequests[0].customerKey, "A");
    h.sdkRequests[0].resolve();
  });
}

test("prepare UI: actual TOKEN_REFRESHED notice keeps same-owner binding and in-flight request", async () => {
  const h = authPreparationHarness();
  await h.context.initializeAuth();
  h.state.authUser = { id: "A" };
  h.state.authSession = { user: h.state.authUser, access_token: "synthetic-before" };
  h.state.viewer = {};
  h.state.authRolesLoaded = true;
  h.context.decoratePaymentRetry(h.button);
  const epoch = h.state.authEpoch;
  h.emitAuth("TOKEN_REFRESHED", { user: { id: "A" }, access_token: "synthetic-refreshed" });
  await flushPreparation();
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].owner.epoch, epoch);
  assert.equal(h.notices[0].token, "synthetic-refreshed");
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(preparedFor("A"));
  await flushPreparation();
  assert.equal(h.button.disabled, false);
  assert.equal(h.effects.renders.length, 0);
});
