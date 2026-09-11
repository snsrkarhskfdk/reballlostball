import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

// Runs the production loadAccountData + commitServerOrder against a deliberately
// reordered account query, so this fails if the epoch guard is removed.
function accountRaceHarness() {
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const source = [
    app.slice(
      app.indexOf("async function loadAccountData("),
      app.indexOf("async function syncSessionState("),
    ),
    // the real sign-out path, so invalidation is production behaviour not a stub
    app.slice(
      app.indexOf("function emptyAuthData("),
      app.indexOf("function buildViewer("),
    ),
  ].join(String.fromCharCode(10));

  let releaseOrdersQuery;
  const ordersGate = new Promise((resolve) => { releaseOrdersQuery = resolve; });

  // The snapshot the server held BEFORE the payment was confirmed.
  const staleOrderRow = {
    id: "order-1", order_no: "RB-RACE-0001", status: "payment_ready",
    payment_status: "ready", payment_method: "card", total_krw: 17000,
    created_at: "2026-09-11T00:00:00Z", address_snapshot: {},
  };

  const table = (rows, gate) => {
    const result = gate ? gate.then(() => ({ data: rows, error: null })) : Promise.resolve({ data: rows, error: null });
    const chain = {
      select: () => chain,
      order: () => chain,
      then: (onFulfilled, onRejected) => result.then(onFulfilled, onRejected),
    };
    return chain;
  };

  const context = createContext({
    state: {
      orders: [], accountLoading: false, orderEpoch: 0,
      viewer: null, authSession: null, authUser: null, authRoles: [], authRolesLoaded: false,
      addresses: [], paymentMethods: [],
    },
    parseRoute: () => "/",
    // the sliced source registers the runtime-module bridge at module scope
    document: { addEventListener: () => {} },
    normalizeServerOrder: (order) => order,
    renderMypage: () => {},
    ensureProfileRecord: async () => ({ id: "member-1" }),
    buildViewer: (user, profile) => ({ id: profile.id }),
    mapAddressRecord: (row) => row,
    mapOrderRecord: (row) => ({
      id: row.id, orderNo: row.order_no, status: row.status, paymentStatus: row.payment_status,
    }),
    supabase: {
      from: (name) => {
        if (name === "orders") return table([staleOrderRow], ordersGate);
        return table([]);
      },
    },
  });
  runInContext(source, context);
  return { context, releaseOrdersQuery };
}

test("a stale account snapshot cannot revert a confirmed payment", async () => {
  const { context, releaseOrdersQuery } = accountRaceHarness();

  // The account query must actually be dispatched before the confirmation, or this
  // is not a race at all: a confirmation that lands first is already visible to the
  // query, and discarding that result would throw away fresh data.
  const accountLoad = context.loadAccountData({ id: "member-1" }, { silent: true });
  await new Promise((resolve) => setTimeout(resolve, 0));

  // Confirmation commits while the dispatched query is still in flight.
  context.commitServerOrder({ id: "order-1", orderNo: "RB-RACE-0001", status: "paid", paymentStatus: "done" });
  assert.equal(context.state.orders[0].paymentStatus, "done");

  // Only now does the earlier, now-stale response arrive.
  releaseOrdersQuery();
  await accountLoad;

  assert.equal(
    context.state.orders[0].paymentStatus,
    "done",
    "A snapshot taken before confirmation must not overwrite the confirmed order.",
  );
  assert.equal(context.state.orders[0].status, "paid");
});

test("an uncontended account refresh still replaces the order list", async () => {
  // The guard must not freeze normal refreshes, or my page would go stale forever.
  const { context, releaseOrdersQuery } = accountRaceHarness();
  const accountLoad = context.loadAccountData({ id: "member-1" }, { silent: true });
  releaseOrdersQuery();
  await accountLoad;

  assert.equal(context.state.orders.length, 1);
  assert.equal(context.state.orders[0].paymentStatus, "ready", "With no competing write the fresh snapshot must apply.");
});

test("a confirmation that lands before the queries are dispatched does not discard fresh data", async () => {
  // The mirror of the race above. The epoch is captured where the queries are issued,
  // so a confirmation that commits before that point is already reflected in what the
  // server returns and the fresh snapshot must be applied.
  const { context, releaseOrdersQuery } = accountRaceHarness();
  context.commitServerOrder({ id: "order-9", orderNo: "RB-RACE-0009", status: "paid", paymentStatus: "done" });

  const accountLoad = context.loadAccountData({ id: "member-1" }, { silent: true });
  releaseOrdersQuery();
  await accountLoad;

  assert.equal(context.state.orders.length, 1, "The fresh account snapshot must be applied.");
  assert.equal(context.state.orders[0].id, "order-1");
});

test("a superseded account load cannot publish another customer's data", async () => {
  // Customer A's refresh is delayed; A signs out and B signs in. A's response must
  // never land, or B is shown A's viewer, addresses and orders.
  const { context, releaseOrdersQuery } = accountRaceHarness();
  const staleLoad = context.loadAccountData({ id: "member-A" }, { silent: true });
  await new Promise((resolve) => setTimeout(resolve, 0));

  context.emptyAuthData();
  context.state.authUser = { id: "member-B" };

  releaseOrdersQuery();
  await staleLoad;

  assert.equal(context.state.viewer, null, "A superseded load must not publish a viewer.");
  assert.equal(context.state.orders.length, 0, "A superseded load must not publish orders.");
});
