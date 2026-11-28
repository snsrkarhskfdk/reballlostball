import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
function production(start, end) {
  const from = app.indexOf(start), to = app.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return app.slice(from, to);
}

function harness(userId, rows) {
  let releaseProfile, releaseQueries;
  const profileGate = new Promise((resolve) => { releaseProfile = resolve; });
  const queryGate = new Promise((resolve) => { releaseQueries = resolve; });
  const requests = [];
  const state = { authUser: { id: userId }, orders: [], orderEpoch: 0 };
  const context = createContext({
    state, parseRoute: () => "/", renderMypage: () => {},
    document: { addEventListener: () => {} }, normalizeServerOrder: (order) => order,
    ensureProfileRecord: () => profileGate.then(() => ({ id: userId })),
    buildViewer: (user, profile) => ({ id: user.id, profileId: profile.id }),
    mapOrderRecord: (row) => row, mapAddressRecord: (row) => row,
    supabase: { from(name) {
      requests.push(name);
      const chain = {
        select: () => chain, order: () => chain,
        then: (ok, fail) => queryGate.then(() => ({
          data: name === "orders" ? rows : name === "addresses" ? [{ id: `address-${userId}` }] : [], error: null,
        })).then(ok, fail),
      };
      return chain;
    } },
  });
  runInContext([
    production("async function loadAccountData(", "async function syncSessionState("),
    production("function emptyAuthData(", "function buildViewer("),
  ].join("\n"), context);
  return { state, context, requests, releaseProfile, releaseQueries };
}

test("240 seeded auth/order combinations preserve identity and payment ordering", async (t) => {
  let seed = 0x42b0a1;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const counts = { same: 0, switched: 0, signedOut: 0, confirmedBeforeQuery: 0, confirmedAfterQuery: 0, noConfirmation: 0 };
  for (let scenario = 0; scenario < 240; scenario += 1) {
    const user = random() % 2 ? "A" : "B";
    const identity = (random() >>> 8) % 3;
    const confirmation = (random() >>> 12) % 3;
    const rows = [{ id: `order-${user}`, status: "payment_ready" }];
    if (confirmation === 1) rows.splice(0, 1, { id: `order-${user}`, status: "paid" }, { id: `fresh-${user}`, status: "paid" });
    const h = harness(user, rows);
    const loading = h.context.loadAccountData({ id: user }, { silent: true });
    assert.equal(h.requests.length, 0, "Profile await must precede query dispatch");
    if (confirmation === 1) h.context.commitServerOrder({ id: `order-${user}`, status: "paid" });
    h.releaseProfile();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.requests.length, 3, "Order/address/item queries actually dispatched");
    if (confirmation === 2) h.context.commitServerOrder({ id: `order-${user}`, status: "paid" });
    if (identity !== 0) {
      h.context.emptyAuthData();
      if (identity === 1) h.state.authUser = { id: user === "A" ? "B" : "A" };
    }
    h.releaseQueries();
    await loading;
    if (identity !== 0) {
      assert.equal(h.state.viewer, null, `Scenario ${scenario}: no stale viewer`);
      assert.deepEqual([...h.state.orders], [], `Scenario ${scenario}: no stale order`);
      assert.deepEqual([...h.state.addresses], [], `Scenario ${scenario}: no stale address`);
    } else {
      assert.equal(h.state.viewer.id, user);
      assert.equal(h.state.orders[0].status, confirmation === 0 ? "payment_ready" : "paid");
      assert.equal(h.state.orders.length, confirmation === 1 ? 2 : 1, "Fresh superset must survive pre-query confirmation");
    }
    counts[["same", "switched", "signedOut"][identity]] += 1;
    counts[["noConfirmation", "confirmedBeforeQuery", "confirmedAfterQuery"][confirmation]] += 1;
  }
  assert.ok(Object.values(counts).every((count) => count > 0));
  t.diagnostic(JSON.stringify({ seed: "0x42b0a1", combinations: 240, counts }));
});
