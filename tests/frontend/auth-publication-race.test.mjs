import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
function production(start, end) {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Production boundaries: ${start}`);
  return app.slice(from, to);
}

export function authHarness() {
  const profileRequests = [];
  const roleRequests = [];
  const effects = { renders: 0, toasts: [] };
  const state = {
    authUser: { id: "A", email: "a@example.test" }, authSession: null,
    authRoles: [], authRolesLoaded: false, viewer: { id: "A", name: "Alpha" },
    orders: [], addresses: [], paymentMethods: [],
  };
  function pending(queue, request) {
    return new Promise((resolve, reject) => queue.push({ ...request, resolve, reject }));
  }
  const context = createContext({
    state, console,
    FormData: class { constructor(form) { this.form = form; } get(key) { return this.form[key] ?? ""; } },
    stringOrEmpty: (value) => String(value ?? ""),
    boolFromYesNo: (value) => value === "Y", asYesNo: (value) => value ? "Y" : "N",
    showToast: (message) => effects.toasts.push(message), routeTo: () => {},
    renderMypage: () => { effects.renders += 1; },
    normalizeAuthError: (error) => error.message,
    ensureProfileRecord: (user, payload) => pending(profileRequests, { user, payload }),
    loadAccountData: async () => {},
    supabase: { from(table) {
      assert.equal(table, "user_roles");
      return { select(columns) {
        assert.equal(columns, "role");
        return { eq(column, userId) {
          assert.equal(column, "user_id");
          return pending(roleRequests, { userId });
        } };
      } };
    } },
  });
  runInContext([
    production("async function handleProfileSave(", "async function handleAddressCreate("),
    production("async function loadCurrentAuthRoles(", "function hasAdminCatalogRole("),
    production("function emptyAuthData(", "function buildViewer("),
    production("function buildViewer(", "function mapAddressRecord("),
    production("async function syncSessionState(", "async function initializeAuth("),
  ].join("\n"), context);
  return { context, state, effects, profileRequests, roleRequests };
}

const profileA = { id: "A", name: "Alpha private", email: "a@example.test", phone: "01011110000", login_id: "alpha" };
const formA = { name: profileA.name, email: profileA.email, phone: profileA.phone };

function switchToB(h) {
  h.context.emptyAuthData();
  h.state.authUser = { id: "B", email: "b@example.test" };
  h.state.viewer = { id: "B", name: "Beta", email: "b@example.test", phone: "01022220000" };
  h.state.authRolesLoaded = true;
}

test("NEW-01: pending A profile save cannot publish PII after B signs in", async () => {
  const h = authHarness();
  const saving = h.context.handleProfileSave(formA);
  assert.equal(h.profileRequests.length, 1, "A save reached the pending request");
  assert.equal(h.profileRequests[0].user.id, "A");
  switchToB(h);
  const expected = JSON.stringify(h.state.viewer);
  h.profileRequests[0].resolve(profileA);
  await saving;
  assert.equal(JSON.stringify(h.state.viewer), expected, "NEW-01 assertion reached: preserve B viewer after A completion");
  assert.equal(h.effects.renders, 0);
  assert.deepEqual(h.effects.toasts, []);
});

test("NEW-01: same-user save retains profile and success UX", async () => {
  const h = authHarness();
  const saving = h.context.handleProfileSave(formA);
  assert.equal(h.profileRequests.length, 1);
  h.profileRequests[0].resolve(profileA);
  await saving;
  assert.equal(h.state.viewer.id, "A");
  assert.equal(h.state.viewer.name, profileA.name);
  assert.equal(h.state.viewer.phone, profileA.phone);
  assert.equal(h.effects.renders, 1);
  assert.equal(h.effects.toasts.length, 1);
});

test("NEW-01: sign-out prevents profile publication and stale errors", async () => {
  for (const reject of [false, true]) {
    const h = authHarness();
    const saving = h.context.handleProfileSave(formA);
    assert.equal(h.profileRequests.length, 1);
    h.context.emptyAuthData();
    if (reject) h.profileRequests[0].reject(new Error("A private failure"));
    else h.profileRequests[0].resolve(profileA);
    await saving;
    assert.equal(h.state.viewer, null);
    assert.deepEqual(h.effects.toasts, []);
  }
});

test("NEW-02: pending A roles cannot publish or return privileges after B signs in", async () => {
  const h = authHarness();
  const loading = h.context.loadCurrentAuthRoles({ force: true });
  assert.equal(h.roleRequests.length, 1, "A role query reached the pending request");
  assert.equal(h.roleRequests[0].userId, "A");
  switchToB(h);
  h.roleRequests[0].resolve({ data: [{ role: "owner_admin" }], error: null });
  const result = await loading;
  assert.deepEqual([...h.state.authRoles], [], "NEW-02 assertion reached: no A privilege publication under B");
  assert.deepEqual([...result], [], "Stale callers cannot receive A roles either");
});

test("NEW-02: identity check rejects drift without a sign-out or newer query", async () => {
  const h = authHarness();
  const loading = h.context.loadCurrentAuthRoles({ force: true });
  h.state.authUser = { id: "B" };
  h.roleRequests[0].resolve({ data: [{ role: "owner_admin" }], error: null });
  assert.deepEqual([...await loading], []);
  assert.deepEqual([...h.state.authRoles], []);
});

test("NEW-02: sign-out invalidates roles even after the same identity returns", async () => {
  const h = authHarness();
  const loading = h.context.loadCurrentAuthRoles({ force: true });
  h.context.emptyAuthData();
  h.state.authUser = { id: "A" };
  h.roleRequests[0].resolve({ data: [{ role: "owner_admin" }], error: null });
  assert.deepEqual([...await loading], []);
  assert.equal(h.state.authRolesLoaded, false);
});

test("NEW-02: only newest same-user roles publish and normal cache still works", async () => {
  const h = authHarness();
  const older = h.context.loadCurrentAuthRoles({ force: true });
  const newer = h.context.loadCurrentAuthRoles({ force: true });
  h.roleRequests[1].resolve({ data: [{ role: "cs_manager" }, { role: "cs_manager" }, { role: " " }], error: null });
  assert.deepEqual([...await newer], ["cs_manager"]);
  h.roleRequests[0].resolve({ data: [{ role: "owner_admin" }], error: null });
  assert.deepEqual([...await older], []);
  assert.deepEqual([...h.state.authRoles], ["cs_manager"]);
  assert.deepEqual([...await h.context.loadCurrentAuthRoles()], ["cs_manager"]);
  assert.equal(h.roleRequests.length, 2);
});

test("NEW-02: direct session identity change clears cached roles before account loading", async () => {
  const h = authHarness();
  h.state.authRoles = ["owner_admin"];
  h.state.authRolesLoaded = true;
  const syncing = h.context.syncSessionState({ user: { id: "B" } });
  assert.deepEqual([...h.state.authRoles], []);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.roleRequests.length, 1);
  h.roleRequests[0].resolve({ data: [], error: null });
  await syncing;
});

test("NEW-02: current-user errors remain observable", async () => {
  const h = authHarness();
  const loading = h.context.loadCurrentAuthRoles({ force: true });
  h.roleRequests[0].resolve({ data: null, error: new Error("role query failed") });
  await assert.rejects(loading, /role query failed/);
  assert.equal(h.state.authRolesLoaded, false);
});

test("128 seeded async identity-switch schedules preserve profile and role ownership", async (t) => {
  let seed = 0x42a17e;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const counts = { same: 0, signedOut: 0, switched: 0, completions: 0 };
  for (let schedule = 0; schedule < 128; schedule += 1) {
    const h = authHarness();
    const saving = h.context.handleProfileSave(formA);
    const roles = h.context.loadCurrentAuthRoles({ force: true });
    assert.equal(h.profileRequests.length, 1);
    assert.equal(h.roleRequests.length, 1);
    const mode = random() % 3;
    if (mode === 0) counts.same += 1;
    if (mode === 1) { h.context.emptyAuthData(); counts.signedOut += 1; }
    if (mode === 2) { switchToB(h); counts.switched += 1; }
    const expectedViewer = JSON.stringify(h.state.viewer);
    const actions = [
      async () => { h.profileRequests[0].resolve(profileA); await saving; },
      async () => {
        h.roleRequests[0].resolve({ data: [{ role: "owner_admin" }], error: null });
        const result = await roles;
        if (mode !== 0) assert.deepEqual([...result], []);
      },
    ];
    if (mode === 2) {
      const bRoles = h.context.loadCurrentAuthRoles({ force: true });
      actions.push(async () => {
        h.roleRequests[1].resolve({ data: [{ role: "customer" }], error: null });
        await bRoles;
      });
    }
    for (let index = actions.length - 1; index > 0; index -= 1) {
      const other = random() % (index + 1);
      [actions[index], actions[other]] = [actions[other], actions[index]];
    }
    for (const action of actions) {
      await action();
      counts.completions += 1;
      if (mode !== 0) {
        assert.equal(JSON.stringify(h.state.viewer), expectedViewer, `Schedule ${schedule} profile ownership`);
        assert.ok(!h.state.authRoles.includes("owner_admin"), `Schedule ${schedule} role ownership`);
      }
    }
    if (mode === 0) {
      assert.equal(h.state.viewer.name, profileA.name);
      assert.deepEqual([...h.state.authRoles], ["owner_admin"]);
    }
  }
  assert.ok(counts.same > 0 && counts.signedOut > 0 && counts.switched > 0);
  t.diagnostic(JSON.stringify({ seed: "0x42a17e", schedules: 128, counts }));
});
