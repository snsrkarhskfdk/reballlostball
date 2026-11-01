import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { normalizeServerOrder } from "../../src/frontend/commerce/order-client.mjs";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
function production(start, end) {
  const from = app.indexOf(start), to = app.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Production boundaries: ${start}`);
  return app.slice(from, to);
}

function harness(userId = "A") {
  const requests = [];
  const effects = { routes: [], payments: [], guestSessions: [], toasts: [], cartSaves: 0, renders: 0 };
  const state = {
    authUser: userId ? { id: userId } : null,
    authSession: userId ? { access_token: `synthetic-${userId}` } : null,
    viewer: userId ? { id: userId } : null, orders: [], addresses: [], paymentMethods: [], cart: [],
    checkoutBusy: false, checkoutIdempotencyKey: "", paymentRequestState: "idle",
  };
  const context = createContext({
    state, console, normalizeServerOrder, SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_KEY: "synthetic",
    checkoutCustomerFromForm: () => ({ receiverName: "Alpha private", receiverPhone: "01000000001" }),
    isCheckoutCustomerValid: () => true, orderLinePayload: () => [{ variantId: "synthetic", qty: 1 }],
    renderCheckout: () => { effects.renders += 1; }, createIdempotencyKey: () => "synthetic-idempotency",
    createOrderRequest: (options, payload) => new Promise((resolve, reject) => requests.push({ options, payload, resolve, reject })),
    saveGuestLookupSession: (_storage, session) => effects.guestSessions.push(session),
    saveCartState: () => { effects.cartSaves += 1; }, routeTo: path => effects.routes.push(path),
    maybeRequestTossPayment: async (order, result) => effects.payments.push({ order, result }),
    normalizeAuthError: error => error.message, showToast: message => effects.toasts.push(message), parseRoute: () => "/checkout",
  });
  runInContext([
    production("async function createOrder(", "async function maybeRequestTossPayment("),
    production("function emptyAuthData(", "function buildViewer("),
    production("function commitServerOrder(", "// Runtime modules"),
  ].join("\n"), context);
  return { context, state, effects, requests };
}

function resultForA() {
  return { order: { id: "db-A", orderNo: "RB-SYNTHETIC-A", status: "payment_ready", totalKrw: 17000,
    address: { receiverName: "Alpha private", receiverPhone: "01000000001", roadAddress: "Alpha private address" } },
  lookupToken: "synthetic-lookup-A", skipPayment: true };
}

function start(h) {
  const pending = h.context.createOrder(new Map([["payment", "card"]]));
  assert.equal(h.requests.length, 1, "R42-N03 request reached and completion held");
  assert.equal(h.requests[0].options.accessToken, h.state.authUser ? `synthetic-${h.state.authUser.id}` : "");
  return pending;
}

function changeIdentity(h, mode) {
  if (mode !== "direct-B") h.context.emptyAuthData();
  const id = mode === "signed-out" ? null : mode === "returned-A" ? "A" : "B";
  h.state.authUser = id ? { id } : null;
  h.state.authSession = id ? { access_token: `synthetic-${id}` } : null;
  h.state.viewer = id ? { id, name: `${id} current` } : null;
  h.state.orders = id ? [{ id: `existing-${id}`, customer: { name: `${id} current` } }] : [];
  h.state.cart = [{ slug: "new-session-cart", quantity: 2 }];
  // Represent work already owned by the current session; old finally must not clear it.
  h.state.checkoutBusy = true;
  h.state.paymentRequestState = "new-session-operation";
}

for (const mode of ["B", "signed-out", "direct-B", "returned-A"]) {
  test(`R42-N03: held A order completion cannot publish after ${mode}`, async () => {
    const h = harness();
    const pending = start(h);
    changeIdentity(h, mode);
    const expectedState = JSON.stringify(h.state), expectedEffects = JSON.stringify(h.effects);
    h.requests[0].resolve(resultForA());
    await pending;
    assert.equal(JSON.stringify(h.state), expectedState, "R42-N03 assertion reached: no A customer/order publication or stale checkout state");
    assert.equal(JSON.stringify(h.effects), expectedEffects, "No stale route, cart, token, payment, or render effects");
  });
}

test("R42-N03: guest completion cannot publish after member sign-in", async () => {
  const h = harness(null), pending = start(h);
  changeIdentity(h, "B");
  const expectedState = JSON.stringify(h.state), expectedEffects = JSON.stringify(h.effects);
  h.requests[0].resolve(resultForA());
  await pending;
  assert.equal(JSON.stringify(h.state), expectedState);
  assert.equal(JSON.stringify(h.effects), expectedEffects);
});

test("R42-N03: old rejection cannot change a new session's checkout or display its error", async () => {
  const h = harness(), pending = start(h);
  changeIdentity(h, "B");
  const expectedState = JSON.stringify(h.state), expectedEffects = JSON.stringify(h.effects);
  h.requests[0].reject(new Error("Alpha private request failure"));
  await pending;
  assert.equal(JSON.stringify(h.state), expectedState);
  assert.equal(JSON.stringify(h.effects), expectedEffects);
});

test("R42-N03: same-user and guest success preserve order, cart, route and payment behavior", async () => {
  for (const userId of ["A", null]) {
    const h = harness(userId), pending = start(h);
    // A same-user account refresh is not an identity change.
    h.state.accountLoadSeq = 10;
    if (userId) h.state.authSession = { access_token: "synthetic-A-refreshed" };
    h.requests[0].resolve(resultForA());
    await pending;
    assert.equal(h.state.orders[0].id, "RB-SYNTHETIC-A");
    assert.equal(h.state.orders[0].customer.name, "Alpha private");
    assert.equal(h.state.orders[0].customer.phone, "01000000001");
    assert.equal(h.state.checkoutBusy, false);
    assert.equal(h.state.paymentRequestState, "payment_ready");
    assert.equal(h.state.cart.length, 0);
    assert.equal(h.effects.cartSaves, 1);
    assert.deepEqual(h.effects.routes, ["/order/RB-SYNTHETIC-A"]);
    assert.equal(h.effects.payments.length, 1);
    assert.equal(h.effects.guestSessions.length, 1);
    assert.deepEqual(h.effects.toasts, []);
  }
});

test("R42-N03: current-user failure stays visible and retry is unlocked", async () => {
  const h = harness(), pending = start(h);
  h.requests[0].reject(new Error("synthetic failure"));
  await pending;
  assert.equal(h.state.checkoutBusy, false);
  assert.equal(h.state.paymentRequestState, "error");
  assert.deepEqual(h.effects.toasts, ["synthetic failure"]);
});
