import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

// Executes the production initializeAuth() body. A `return` inside its `finally`
// exits the function, so registering the auth listener after the routing calls
// meant a payment-return load never got a listener at all — and nothing else in
// app.js assigns state.authSession / state.authUser. An in-SPA re-login from the
// payment recovery screen then left the customer logged out until a full reload.
function initAuthHarness({ paymentReturn = false, authCallback = false } = {}) {
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const source = app.slice(
    app.indexOf("async function initializeAuth()"),
    app.indexOf("\nasync function handleAuthFormSubmit("),
  );

  let listenerRegistered = 0;
  let renderRouteCalls = 0;
  let registeredCallback = null;
  const context = createContext({
    state: {},
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: (callback) => { listenerRegistered += 1; registeredCallback = callback; },
      },
    },
    syncSessionState: async () => {},
    emptyAuthData: () => {},
    showToast: () => {},
    normalizeAuthError: (error, fallback) => fallback || String(error),
    handleAuthCallbackHash: async () => authCallback,
    handlePaymentReturn: async () => paymentReturn,
    paymentReturnKind: () => (paymentReturn ? "fail" : ""),
    consumeAuthRedirect: () => "/",
    renderRoute: () => { renderRouteCalls += 1; },
    parseRoute: () => "/",
    routeTo: () => {},
    loadAccountData: async () => {},
    loadCurrentAuthRoles: async () => {},
    buildViewer: () => ({}),
  });
  runInContext(source, context);
  return {
    context,
    get listenerRegistered() { return listenerRegistered; },
    get registeredCallback() { return registeredCallback; },
    get renderRouteCalls() { return renderRouteCalls; },
  };
}

test("the auth state listener is registered on every entry path, including payment returns", async () => {
  // The regression: a payment return short-circuits routing, and previously took
  // the listener registration with it.
  const paymentReturn = initAuthHarness({ paymentReturn: true });
  await paymentReturn.context.initializeAuth();
  assert.equal(
    paymentReturn.listenerRegistered,
    1,
    "A payment-return load must still register onAuthStateChange, otherwise an in-SPA re-login cannot restore state.authUser/state.authSession.",
  );
  assert.equal(paymentReturn.renderRouteCalls, 0, "A payment return still owns rendering and must not fall through to renderRoute.");

  // The auth callback path short-circuits the same way.
  const authCallback = initAuthHarness({ authCallback: true });
  await authCallback.context.initializeAuth();
  assert.equal(authCallback.listenerRegistered, 1, "An auth-callback load must also register onAuthStateChange.");

  // The ordinary path keeps rendering.
  const normal = initAuthHarness();
  await normal.context.initializeAuth();
  assert.equal(normal.listenerRegistered, 1, "An ordinary load must register onAuthStateChange exactly once.");
  assert.equal(normal.renderRouteCalls, 1, "An ordinary load must still render its route.");
  assert.equal(normal.context.state.authReady, true, "authReady must be set regardless of entry path.");
});

test("the registered listener does not repaint a screen the payment return owns", async () => {
  // supabase-js delivers INITIAL_SESSION to every new subscriber. On a payment
  // return that callback used to run renderRoute() over the screen the return
  // controller had just drawn, through a branch that has none of its context.
  const paymentReturn = initAuthHarness({ paymentReturn: true });
  await paymentReturn.context.initializeAuth();
  assert.equal(paymentReturn.listenerRegistered, 1);
  assert.ok(typeof paymentReturn.registeredCallback === "function", "The callback must be captured, not just counted.");

  const before = paymentReturn.renderRouteCalls;
  await paymentReturn.registeredCallback("INITIAL_SESSION", { user: { id: "member-1" } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    paymentReturn.renderRouteCalls,
    before,
    "The auth listener must not re-render while a payment return owns the screen.",
  );

  // On an ordinary route the same callback must still drive a re-render.
  const normal = initAuthHarness();
  await normal.context.initializeAuth();
  const normalBefore = normal.renderRouteCalls;
  await normal.registeredCallback("INITIAL_SESSION", { user: { id: "member-1" } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(
    normal.renderRouteCalls > normalBefore,
    "Outside a payment return the listener must still render.",
  );
});
