import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { parseRoute, paymentReturnKind, paymentReturnParams, replacePaymentReturnUrl } from "../../src/frontend/core/router.mjs";
import { pendingTossConfirmation, terminalConfirmationFailure } from "../../src/frontend/payments/toss-client.mjs";
import { escapeHtml } from "../../src/frontend/ui/components.mjs";

// Execute the production return controller, renderer and route branch with only
// network/UI boundaries stubbed, so classifying an error alone cannot pass.
function paymentReturnHarness(code) {
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const orderId = "RB-MOBILE-RETURN-001";
  const pending = { orderId, paymentKey: "pay_secret", amount: 17000 };
  const values = new Map([[`reball.paymentConfirm.${orderId}`, JSON.stringify(pending)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let location = new URL(`https://shop.example/?paymentKey=pay_secret&orderId=${orderId}&amount=17000#/payment/success`);
  let html = "";
  let confirmCalls = 0;
  let signOutScope = "";
  const context = createContext({
    state: { orders: [], authReady: true, authUser: { id: "member" }, authSession: { access_token: "expired" } }, bundleRegistry: new Map(),
    icons: { lock: "lock", close: "close" }, escapeHtml,
    layout: (value) => { html = value; },
    parseRoute: () => parseRoute(location),
    paymentReturnKind: () => paymentReturnKind(location),
    paymentReturnParams: () => paymentReturnParams(location),
    replacePaymentReturnUrl: (route) => replacePaymentReturnUrl(route, {
      documentRef: { baseURI: "https://shop.example/index.html" }, locationRef: location, storageRef: storage,
      historyRef: { replaceState: (_state, _title, url) => { location = new URL(url, location); } },
    }),
    SUPABASE_URL: "https://example.supabase.co", SUPABASE_KEY: "public",
    sessionStorage: storage, loadGuestLookupSession: () => null, pendingTossConfirmation, terminalConfirmationFailure,
    confirmTossPayment: async () => { confirmCalls += 1; throw Object.assign(new Error("provider result"), { code }); },
    supabase: { auth: { signOut: async (options) => { signOutScope = options?.scope; } } },
    showToast: () => {},
    setAuthRedirect: (route) => { context.state.authRedirect = route; },
    routeTo: (route) => { location.hash = route; context.renderRoute(); },
    renderAuthPage: () => { html = "login form"; },
  });
  const returnSource = app.slice(app.indexOf("function renderPaymentReturnStatus("), app.indexOf("\nfunction renderOrder("));
  const routeStart = app.indexOf("function renderRoute()");
  const routeSource = app.slice(routeStart, app.indexOf('\nwindow.addEventListener("hashchange"', routeStart));
  const logoutSource = app.slice(app.indexOf("async function handleLogout("), app.indexOf("\nasync function loadCurrentAuthRoles("));
  const emptyAuthSource = app.slice(app.indexOf("function emptyAuthData("), app.indexOf("\nfunction buildViewer("));
  const loggedInSource = app.slice(app.indexOf("function isLoggedIn("), app.indexOf("\nfunction isWished("));
  runInContext(`${returnSource}\n${routeSource}\n${logoutSource}\n${emptyAuthSource}\n${loggedInSource}`, context);
  return { context, orderId, get html() { return html; }, get location() { return location; }, get confirmCalls() { return confirmCalls; }, get signOutScope() { return signOutScope; } };
}

test("failed and unresolved payment returns preserve safe refresh context and distinct recovery actions", async () => {
  for (const route of ["/payment/fail", "/payment/recovery"]) {
    let replaced = "";
    replacePaymentReturnUrl(route, {
      documentRef: { baseURI: "https://shop.example/store/index.html" },
      historyRef: { replaceState: (_state, _title, value) => { replaced = value; } },
      locationRef: {
        pathname: "/payment/fail",
        search: "?paymentKey=pay_secret&code=PAY_PROCESS_CANCELED&message=cancel&orderId=RB-MOBILE-RETURN-001",
        hash: "",
      },
    });

    assert.equal(replaced, `/store/#${route}?orderId=RB-MOBILE-RETURN-001`);
    assert.equal(replaced.includes("paymentKey"), false);
    assert.equal(replaced.includes("code="), false);
    assert.equal(replaced.includes("message="), false);
  }

  for (const code of ["PAYMENT_CONFIRM_RECOVERY_REQUIRED", "PAYMENT_CONFIRM_AUTH_REQUIRED", "MOCK_CARD_DECLINED"]) {
    const harness = paymentReturnHarness(code);
    const isRecovery = code !== "MOCK_CARD_DECLINED";
    assert.equal(await harness.context.handlePaymentReturn(), true);
    assert.equal(harness.location.hash, `#/payment/${isRecovery ? "recovery" : "fail"}?orderId=${harness.orderId}`);
    assert.equal(harness.location.search, "");
    assert.equal(harness.context.state.paymentRequestState, isRecovery ? "recovery_required" : "error");
    const assertView = () => {
      if (isRecovery) {
        assert.match(harness.html, /<h1>결제 승인 결과가 아직 확정되지 않았습니다\.<\/h1>/);
        assert.doesNotMatch(harness.html, /결제를 완료하지 못했습니다|결제 다시 시도|data-payment-retry/);
        assert.match(harness.html, new RegExp(`class="primary-btn"[^>]*data-payment-confirm-recovery="${harness.orderId}"`));
        assert.match(harness.html, /새 주문이나 재결제 전에/);
      } else {
        assert.match(harness.html, /결제를 완료하지 못했습니다/);
        assert.match(harness.html, /data-payment-retry/);
      }
    };
    assertView();
    harness.context.renderRoute();
    assertView();
    await harness.context.handlePaymentReturn();
    assertView();
    assert.equal(harness.confirmCalls, 1, "Reloading a scrubbed return must not resubmit incomplete confirmation data.");
    if (code === "PAYMENT_CONFIRM_AUTH_REQUIRED") {
      assert.match(harness.html, /data-payment-reauth=/);
      await harness.context.handlePaymentReauthentication(harness.orderId);
      assert.equal(harness.signOutScope, "local");
      assert.equal(harness.context.state.authUser, null);
      assert.equal(harness.location.hash, "#/login");
      assert.equal(harness.html, "login form", "A stale member must reach login instead of bouncing to My Page.");
      assert.equal(harness.context.state.authRedirect, `/payment/recovery?orderId=${harness.orderId}`);
      assert.ok(pendingTossConfirmation(harness.orderId, harness.context.sessionStorage));
      harness.context.routeTo(harness.context.state.authRedirect);
      assertView();
    }
    if (isRecovery) {
      harness.context.sessionStorage.removeItem(`reball.paymentConfirm.${harness.orderId}`);
      harness.context.renderRoute();
      assert.doesNotMatch(harness.html, /data-payment-retry|data-payment-confirm-recovery/);
      assert.match(harness.html, new RegExp(`class="primary-btn"[^>]*data-route="/order/${harness.orderId}"`));
    }
  }
});

test("failed and unresolved payment URLs do not retain malformed order identifiers", () => {
  for (const route of ["/payment/fail", "/payment/recovery"]) {
    let replaced = "";
    replacePaymentReturnUrl(route, {
      documentRef: { baseURI: "https://shop.example/index.html" },
      historyRef: { replaceState: (_state, _title, value) => { replaced = value; } },
      locationRef: {
        pathname: "/payment/fail",
        search: "?orderId=%3Cscript%3E&paymentKey=pay_secret",
        hash: "",
      },
    });

    assert.equal(replaced, `/#${route}`);
  }
});

test("a definitively declined order never advertises a payment retry it cannot honour", async () => {
  // PAYMENT_REJECTED / PAYMENT_NOT_COMPLETED / ORDER_PAYMENT_TERMINATED leave the
  // order unpayable, so prepare-payment answers 409 ORDER_NOT_PAYMENT_READY. A
  // "결제 다시 시도" control there is a dead end the customer cannot escape.
  for (const code of ["PAYMENT_REJECTED", "PAYMENT_NOT_COMPLETED", "ORDER_PAYMENT_TERMINATED"]) {
    const harness = paymentReturnHarness(code);
    assert.equal(await harness.context.handlePaymentReturn(), true);
    assert.match(harness.html, /결제를 완료하지 못했습니다/);
    assert.doesNotMatch(
      harness.html,
      /data-payment-retry/,
      `${code} is terminal and must not render a retry control.`,
    );
    assert.match(
      harness.html,
      new RegExp(`data-route="/order/${harness.orderId}"`),
      `${code} must still let the customer reach the order.`,
    );
  }

  // A non-terminal decline keeps the retry affordance, which still works.
  const retryable = paymentReturnHarness("MOCK_CARD_DECLINED");
  assert.equal(await retryable.context.handlePaymentReturn(), true);
  assert.match(retryable.html, /data-payment-retry/);
});

test("a terminal decline stays terminal when the screen is re-rendered", async () => {
  // supabase-js hands INITIAL_SESSION to every new onAuthStateChange subscriber, so a
  // logged-in member's payment return can be repainted through the generic route
  // branch moments after the controller drew it. That branch has no error code to
  // classify from, so without carried state the dead-end retry control came back.
  const harness = paymentReturnHarness("PAYMENT_REJECTED");
  assert.equal(await harness.context.handlePaymentReturn(), true);
  assert.doesNotMatch(harness.html, /data-payment-retry/);

  harness.context.renderRoute();
  assert.doesNotMatch(
    harness.html,
    /data-payment-retry/,
    "A re-render must not resurrect a retry control for a terminally declined order.",
  );

  // A recoverable failure must still keep its retry control across a re-render.
  const retryable = paymentReturnHarness("MOCK_CARD_DECLINED");
  assert.equal(await retryable.context.handlePaymentReturn(), true);
  retryable.context.renderRoute();
  assert.match(retryable.html, /data-payment-retry/);
});
