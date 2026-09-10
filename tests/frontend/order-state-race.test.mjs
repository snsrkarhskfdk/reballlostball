import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

// Runs the production loadAccountData + commitServerOrder against a deliberately
// reordered account query, so this fails if the epoch guard is removed.
function accountRaceHarness() {
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const source = app.slice(
    app.indexOf("async function loadAccountData("),
    app.indexOf("\nasync function syncSessionState("),
  );

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
    state: { orders: [], accountLoading: false, orderEpoch: 0 },
    parseRoute: () => "/",
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

  // The account query starts first and captures the pre-confirmation snapshot.
  const accountLoad = context.loadAccountData({ id: "member-1" }, { silent: true });

  // Confirmation commits while that query is still in flight.
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
