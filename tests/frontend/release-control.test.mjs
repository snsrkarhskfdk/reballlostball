import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validateBoard, validateReceipt } from "../../scripts/reball-release-control.mjs";

const CODE_SHA = "b2e17ad1351834028dfadd53f1dac7ad485bb883";
const OLD_SHA = "41684cf8592aafc64ad6b9556aa1ba51e82b891f";
const CONTROL_SHA = "c".repeat(40);
const NOW = "2026-11-24T00:00:00+09:00";
const SCRIPT = fileURLToPath(new URL("../../scripts/reball-release-control.mjs", import.meta.url));

function task(id, evidenceKind, status, requires = [], approval = null) {
  return { id, title: `Task ${id}`, evidence_kind: evidenceKind, status, requires, approval,
    acceptance: ["observed", "verified"], evidence: status === "VERIFIED" ? ["receipts/ci.json"] : [], blocked_reason: null };
}

function boardFixture() {
  return {
    schema_version: 1,
    repository: { full_name: "snsrkarhskfdk/reballlostball", branch: "repair/mr-dr01-harness-declare-scope", pr: 37 },
    code: { reviewed_sha: CODE_SHA, ci_url: "https://github.com/snsrkarhskfdk/reballlostball/actions/runs/45170818242" },
    environment: { expected_test_project_ref: "aohziyemqxfhpbbqpicx", production_project_ref: "qbftalhhyfcndanrcwpy",
      test_origin: "https://reball-test.example", production_origin: "https://reballlostball.com" },
    authorization: { test_deploy: "PENDING", test_account_setup: "PENDING", test_transactions: "PENDING",
      test_scheduler: "PENDING", production: "DENIED", records: [] },
    execution: { executor: "LOCAL_CODEX", browser: "ego-browser", space_id: 42, page_labels: ["reball-test-checkout"],
      run_id: "local-run-01", owner: "local-codex-primary", heartbeat_at: NOW, skill_observed: true },
    tasks: [task("R00", "ci", "VERIFIED"), task("R01", "connection", "READY", ["R00"]),
      task("R02", "test", "PENDING", ["R00"], "test_deploy"), task("R03", "test", "PENDING", ["R02"], "test_account_setup")],
  };
}

function approvalRecord(board, capability) {
  return { capability, status: "APPROVED", source: "User explicitly approved this capability in the current task.",
    approved_by: "USER", approved_at: NOW,
    scope: { project_ref: capability === "production" ? board.environment.production_project_ref : board.environment.expected_test_project_ref, code_sha: CODE_SHA } };
}

function approve(board, capability) {
  board.authorization[capability] = "APPROVED";
  board.authorization.records.push(approvalRecord(board, capability));
}

function receiptFixture(board, id = "R01") {
  const selected = board.tasks.find((entry) => entry.id === id);
  const kind = selected.evidence_kind;
  const ci = kind === "ci", production = kind === "production";
  return {
    schema_version: 1, task_id: id, run_id: ci ? "github-actions-45170818242" : "local-codex-run-20261124-01",
    status: "PASS", observed_at: NOW, executor: ci ? "GITHUB_ACTIONS" : "LOCAL_CODEX",
    code_sha: CODE_SHA, orchestration_sha: CONTROL_SHA,
    environment: { kind, origin: ci ? null : production ? board.environment.production_origin : board.environment.test_origin,
      supabase_project_ref: ci ? null : production ? board.environment.production_project_ref : board.environment.expected_test_project_ref,
      deployment_id: ci ? null : "dpl_observed_test_01", deployed_sha: ci ? null : kind === "connection" ? OLD_SHA : CODE_SHA },
    actions: [{ action_id: "read-identity", kind: "read", summary: "Read the actual environment identity.", outcome: "PASS" }],
    assertions: selected.acceptance.map((id) => ({ id, result: "PASS", evidence_refs: [`evidence/${id}.json`] })),
    artifacts: [{ path: "evidence/redacted.json", sha256: "d".repeat(64), redacted: true }], blocker: null,
  };
}

function rejects(errors, pattern) {
  assert.ok(errors.some((error) => pattern.test(error)), `Expected ${pattern}; got ${JSON.stringify(errors)}`);
}

test("board and receipt validation fail closed for missing schema and malformed containers", () => {
  for (const value of [null, {}, [], "", { schema_version: 1 }]) assert.ok(validateBoard(value).length);
  const board = boardFixture();
  for (const value of [null, {}, [], "", { schema_version: 1 }]) assert.ok(validateReceipt(value, board).length);
  assert.deepEqual(validateBoard(board), []);
  assert.deepEqual(validateReceipt(receiptFixture(board), board), []);
});

test("dependencies must be unique, known and acyclic", () => {
  const duplicate = boardFixture(); duplicate.tasks.push(structuredClone(duplicate.tasks[0]));
  rejects(validateBoard(duplicate), /duplicate task ID/);
  const unknown = boardFixture(); unknown.tasks[1].requires.push("MISSING");
  rejects(validateBoard(unknown), /unknown dependency/);
  const cycle = boardFixture(); cycle.tasks[0].requires = ["R03"];
  rejects(validateBoard(cycle), /dependency cycle/);
  const repeated = boardFixture(); repeated.tasks[1].requires.push("R00");
  rejects(validateBoard(repeated), /duplicate values/);
});

test("READY needs verified dependencies and VERIFIED needs evidence", () => {
  const board = boardFixture(); board.tasks[3].status = "READY";
  rejects(validateBoard(board), /dependency R02 must be VERIFIED/);
  board.tasks[3].status = "PENDING"; board.tasks[0].evidence = [];
  rejects(validateBoard(board), /evidence.*nonempty/);
});

test("single RUNNING task needs an owner, run ID, heartbeat and explicit scoped approval", () => {
  const board = boardFixture(); board.tasks[2].status = "RUNNING";
  Object.assign(board.execution, { run_id: null, owner: null, heartbeat_at: null });
  rejects(validateBoard(board), /RUNNING requires actual run_id/);
  rejects(validateBoard(board), /RUNNING lacks explicit APPROVED/);
  Object.assign(board.execution, { run_id: "local-run-01", owner: "local-codex-primary", heartbeat_at: NOW });
  approve(board, "test_deploy");
  assert.deepEqual(validateBoard(board), []);
  board.tasks[1].status = "RUNNING";
  rejects(validateBoard(board), /at most one task/);
});

test("WAITING_FOR_USER holds the single actor slot and blocks another runnable task", () => {
  const board = boardFixture();
  board.tasks[1].status = "WAITING_FOR_USER"; board.tasks[1].blocked_reason = "The user is completing the existing browser handoff.";
  board.tasks[2].status = "RUNNING"; approve(board, "test_deploy");
  rejects(validateBoard(board), /at most one task may be RUNNING or WAITING_FOR_USER/);
  board.tasks[2].status = "READY";
  assert.deepEqual(validateBoard(board), []);
  const directory = mkdtempSync(join(tmpdir(), "reball-release-handoff-"));
  try {
    const path = join(directory, "state.json"); writeFileSync(path, JSON.stringify(board));
    const result = spawnSync(process.execPath, [SCRIPT, "status", "--state", path], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /RUNNABLE \(declared state only\): none/);
    assert.match(result.stdout, /single-writer lock: R01 is WAITING_FOR_USER/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
  board.execution.owner = null;
  rejects(validateBoard(board), /WAITING_FOR_USER requires actual run_id, owner/);
});

test("ego Space IDs accept observed nonnegative integer or string identifiers", () => {
  for (const spaceId of [null, 0, "0", 42, "42"]) {
    const board = boardFixture(); board.execution.space_id = spaceId;
    assert.deepEqual(validateBoard(board), []);
  }
  for (const spaceId of [-1, "-1", 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, false, "", " ", {}, [], "space-observed-42"]) {
    const board = boardFixture(); board.execution.space_id = spaceId;
    rejects(validateBoard(board), /execution.space_id/);
  }
});

test("connection PASS needs observed Space, labels, owner and skill while an unconnected board remains valid", () => {
  const unconnected = boardFixture();
  Object.assign(unconnected.execution, { space_id: null, page_labels: [], owner: null, skill_observed: false, local_connection_verified: false });
  assert.deepEqual(validateBoard(unconnected), []);
  const errors = validateReceipt(receiptFixture(unconnected), unconnected);
  rejects(errors, /nonnegative ego Space ID/); rejects(errors, /browser page labels/);
  rejects(errors, /controller owner/); rejects(errors, /skill_observed:true/);
  const observed = boardFixture(); observed.execution.local_connection_verified = false;
  assert.deepEqual(validateReceipt(receiptFixture(observed), observed), []);
  observed.execution.space_id = 0;
  assert.deepEqual(validateReceipt(receiptFixture(observed), observed), []);
  observed.execution.space_id = "0";
  assert.deepEqual(validateReceipt(receiptFixture(observed), observed), []);
});

test("permission record alone never upgrades PENDING and a flag alone never grants approval", () => {
  const board = boardFixture();
  board.authorization.records.push(approvalRecord(board, "test_deploy"));
  assert.deepEqual(validateBoard(board), []);
  const receipt = receiptFixture(board, "R02"); receipt.actions[0].kind = "mutation";
  rejects(validateReceipt(receipt, board), /mutation requires matching APPROVED/);
  assert.equal(board.authorization.test_deploy, "PENDING");
  board.authorization.records = []; board.authorization.test_deploy = "APPROVED";
  rejects(validateBoard(board), /APPROVED requires a matching explicit USER record/);
});

test("approval is bound to the right capability, project, reviewed code and human source", () => {
  for (const change of [
    (record) => { record.capability = "test_transactions"; },
    (record) => { record.scope.project_ref = "qbftalhhyfcndanrcwpy"; },
    (record) => { record.scope.code_sha = OLD_SHA; },
    (record) => { record.approved_by = "AGENT"; },
    (record) => { record.source = ""; },
  ]) {
    const board = boardFixture(); approve(board, "test_deploy"); change(board.authorization.records[0]);
    assert.ok(validateBoard(board).length);
  }
});

test("deployment and production approval need an exact code SHA while scoped account approval may omit it", () => {
  for (const capability of ["test_deploy", "production"]) {
    const board = boardFixture(); approve(board, capability); board.authorization.records[0].scope.code_sha = null;
    rejects(validateBoard(board), /APPROVED requires a matching explicit USER record/);
  }
  const board = boardFixture(); approve(board, "test_account_setup"); board.authorization.records[0].scope.code_sha = null;
  assert.deepEqual(validateBoard(board), []);
});

test("hosted receipts reject a wrong host, production backend and changed origin spelling", () => {
  const board = boardFixture();
  for (const [key, value] of [["origin", "https://unrelated.example"], ["origin", `${board.environment.test_origin}/`],
    ["supabase_project_ref", board.environment.production_project_ref]]) {
    const receipt = receiptFixture(board); receipt.environment[key] = value;
    rejects(validateReceipt(receipt, board), key === "origin" ? /wrong target host/ : /wrong target project/);
  }
  const unsafeBoard = boardFixture(); unsafeBoard.environment.expected_test_project_ref = unsafeBoard.environment.production_project_ref;
  rejects(validateBoard(unsafeBoard), /wrong isolated TEST project/);
});

test("connection proof can report the old deployment but cannot become TEST behavior proof", () => {
  const board = boardFixture();
  assert.deepEqual(validateReceipt(receiptFixture(board), board), []);
  approve(board, "test_deploy");
  const wrongVersion = receiptFixture(board, "R02"); wrongVersion.environment.deployed_sha = OLD_SHA;
  rejects(validateReceipt(wrongVersion, board), /must equal receipt.code_sha/);
  const relabeled = receiptFixture(board); relabeled.environment.kind = "test";
  rejects(validateReceipt(relabeled, board), /must match task.evidence_kind/);
  const olderCode = receiptFixture(board, "R02"); olderCode.code_sha = OLD_SHA; olderCode.environment.deployed_sha = OLD_SHA;
  rejects(validateReceipt(olderCode, board), /board's reviewed code SHA/);
});

test("PASS requires all observed host identities and every acceptance criterion with evidence", () => {
  const board = boardFixture();
  for (const key of ["origin", "supabase_project_ref", "deployment_id", "deployed_sha"]) {
    const receipt = receiptFixture(board); receipt.environment[key] = null;
    rejects(validateReceipt(receipt, board), /actual hosted identity required/);
  }
  const omitted = receiptFixture(board); omitted.assertions.pop();
  rejects(validateReceipt(omitted, board), /acceptance verified needs PASS/);
  const emptyEvidence = receiptFixture(board); emptyEvidence.assertions[0].evidence_refs = [];
  rejects(validateReceipt(emptyEvidence, board), /evidence_refs.*nonempty|acceptance observed needs/);
});

test("PASS rejects failed or unexecuted assertions and actions, blockers and unverified dependencies", () => {
  const board = boardFixture();
  for (const outcome of ["FAIL", "DENIED", "NOT_RUN", "SKIPPED"]) {
    const receipt = receiptFixture(board); receipt.actions[0].outcome = outcome;
    rejects(validateReceipt(receipt, board), /cannot support PASS/);
  }
  for (const result of ["FAIL", "NOT_RUN"]) {
    const receipt = receiptFixture(board); receipt.assertions[0].result = result;
    rejects(validateReceipt(receipt, board), /all reported assertions must PASS/);
  }
  const blocked = receiptFixture(board); blocked.blocker = { owner: "USER", required_action: "sign in", resume_check: "observe session" };
  rejects(validateReceipt(blocked, board), /PASS must have null blocker/);
  board.tasks[1].status = "PENDING"; board.tasks[0].status = "PENDING";
  rejects(validateReceipt(receiptFixture(board), board), /dependency R00 must be VERIFIED before PASS/);
});

test("BLOCKED can record an unobserved connection without manufacturing a passing identity", () => {
  const board = boardFixture(), receipt = receiptFixture(board);
  receipt.status = "BLOCKED";
  for (const key of ["origin", "supabase_project_ref", "deployment_id", "deployed_sha"]) receipt.environment[key] = null;
  receipt.actions = [];
  receipt.assertions = receipt.assertions.map((assertion) => ({ ...assertion, result: "NOT_RUN", evidence_refs: [] }));
  receipt.artifacts = [];
  receipt.blocker = { owner: "USER", required_action: "Open the local Codex session.", resume_check: "Observe the existing ego Space." };
  assert.deepEqual(validateReceipt(receipt, board), []);
  receipt.environment.origin = "https://wrong.example";
  rejects(validateReceipt(receipt, board), /wrong target host/);
});

test("actual run identity, executor, timestamps and artifact redaction are mandatory", () => {
  const board = boardFixture();
  for (const [key, value] of [["run_id", "TODO"], ["observed_at", "2026-02-30T00:00:00Z"],
    ["executor", "GITHUB_ACTIONS"], ["code_sha", "b2e17ad"], ["orchestration_sha", ""]]) {
    const receipt = receiptFixture(board); receipt[key] = value;
    assert.ok(validateReceipt(receipt, board).length, key);
  }
  const raw = receiptFixture(board); raw.artifacts[0].redacted = false;
  rejects(validateReceipt(raw, board), /redacted:true required/);
  const hash = receiptFixture(board); hash.artifacts[0].sha256 = "short";
  rejects(validateReceipt(hash, board), /full SHA-256/);
});

test("CI evidence uses GitHub Actions and cannot claim a hosted deployment or remote mutation", () => {
  const board = boardFixture(), receipt = receiptFixture(board, "R00");
  assert.deepEqual(validateReceipt(receipt, board), []);
  receipt.executor = "LOCAL_CODEX";
  rejects(validateReceipt(receipt, board), /actual executor/);
  receipt.executor = "GITHUB_ACTIONS"; receipt.environment.deployed_sha = CODE_SHA;
  rejects(validateReceipt(receipt, board), /CI evidence must not claim/);
  receipt.environment.deployed_sha = null; receipt.actions[0].kind = "mutation";
  rejects(validateReceipt(receipt, board), /CI\/connection evidence cannot authorize mutations/);
});

test("only an explicit historical CI import can omit the later orchestration commit", () => {
  const board = boardFixture(), imported = receiptFixture(board, "R00");
  imported.source_kind = "HISTORICAL_CI_IMPORT"; imported.orchestration_sha = null;
  assert.deepEqual(validateReceipt(imported, board), []);
  delete imported.source_kind;
  rejects(validateReceipt(imported, board), /orchestration_sha.*full 40-character SHA/);
  const local = receiptFixture(board); local.source_kind = "HISTORICAL_CI_IMPORT"; local.orchestration_sha = null;
  rejects(validateReceipt(local, board), /HISTORICAL_CI_IMPORT is only valid for CI/);
  rejects(validateReceipt(local, board), /orchestration_sha.*full 40-character SHA/);
});

test("connection observations are read-only even if an unrelated TEST permission was approved", () => {
  const board = boardFixture(); approve(board, "test_deploy");
  const receipt = receiptFixture(board); receipt.actions[0].kind = "mutation";
  rejects(validateReceipt(receipt, board), /CI\/connection evidence cannot authorize mutations/);
  rejects(validateReceipt(receipt, board), /mutation requires matching APPROVED/);
});

test("TEST mutation validates only after its own explicit approval and never grants production", () => {
  const board = boardFixture(); approve(board, "test_deploy");
  const receipt = receiptFixture(board, "R02"); receipt.actions[0].kind = "mutation";
  assert.deepEqual(validateReceipt(receipt, board), []);
  board.tasks.push(task("R08", "production", "PENDING", ["R00"], "production"));
  const production = receiptFixture(board, "R08"); production.actions[0].kind = "mutation";
  rejects(validateReceipt(production, board), /production PASS requires its own explicit production approval/);
  approve(board, "production");
  assert.deepEqual(validateReceipt(production, board), []);
});

test("secret fields are rejected recursively without rejecting prose about safe handling", () => {
  const board = boardFixture();
  for (const key of ["password", "api_key", "access_token", "paymentKey", "paymentReturnToken"]) {
    const receipt = receiptFixture(board); receipt.extra = [{ nested: { [key]: "sensitive-value" } }];
    rejects(validateReceipt(receipt, board), /secret values must not be stored/);
  }
  const safe = receiptFixture(board);
  safe.actions[0].summary = "Checked password handling; paymentKey and paymentReturnToken are never stored in this record.";
  assert.deepEqual(validateReceipt(safe, board), []);
});

test("known credential formats embedded in prose are rejected without banning security vocabulary", () => {
  const board = boardFixture(), receipt = receiptFixture(board);
  receipt.actions[0].summary = "Synthetic secret-shaped fixture: TOSS_SECRET_KEY=live_sk_SYNTHETIC_DO_NOT_USE_123456789";
  rejects(validateReceipt(receipt, board), /credential-shaped value must be redacted/);
  receipt.actions[0].summary = "The password, api_key, access_token, paymentKey and paymentReturnToken fields were checked for redaction.";
  assert.deepEqual(validateReceipt(receipt, board), []);
});

test("credential-bearing URLs in query, hash and userinfo are rejected", () => {
  const board = boardFixture();
  for (const url of ["https://shop.example/payment?paymentKey=actual-value", "https://shop.example/#/return?paymentReturnToken=actual-value",
    "https://shop.example/?access_token=actual-value", "https://user:password@shop.example/"]) {
    const receipt = receiptFixture(board); receipt.assertions[0].evidence_refs = [url];
    rejects(validateReceipt(receipt, board), /secret-bearing URL/);
  }
});

test("CLI status identifies only runnable work and never mutates state or receipt files", () => {
  const directory = mkdtempSync(join(tmpdir(), "reball-release-control-"));
  try {
    const board = boardFixture(), receipt = receiptFixture(board);
    const statePath = join(directory, "state.json"), receiptPath = join(directory, "receipt.json");
    writeFileSync(statePath, JSON.stringify(board)); writeFileSync(receiptPath, JSON.stringify(receipt));
    const beforeState = readFileSync(statePath, "utf8"), beforeReceipt = readFileSync(receiptPath, "utf8");
    const status = spawnSync(process.execPath, [SCRIPT, "status", "--state", statePath], { encoding: "utf8" });
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, /RUNNABLE \(declared state only\): R01/);
    assert.match(status.stdout, /test_deploy is PENDING/);
    assert.match(status.stdout, /does not connect to local Codex\/ego-browser/);
    const valid = spawnSync(process.execPath, [SCRIPT, "receipt", receiptPath, "--state", statePath], { encoding: "utf8" });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(readFileSync(statePath, "utf8"), beforeState);
    assert.equal(readFileSync(receiptPath, "utf8"), beforeReceipt);
    receipt.environment.supabase_project_ref = board.environment.production_project_ref;
    writeFileSync(receiptPath, JSON.stringify(receipt));
    const rejected = spawnSync(process.execPath, [SCRIPT, "receipt", receiptPath, "--state", statePath], { encoding: "utf8" });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /wrong target project/);
    const unsupported = spawnSync(process.execPath, [SCRIPT, "deploy", "--state", statePath], { encoding: "utf8" });
    assert.equal(unsupported.status, 2);
    assert.equal(readFileSync(statePath, "utf8"), beforeState);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("CLI validate reads VERIFIED receipts and rejects missing, wrong-task or escaped evidence paths", () => {
  const directory = mkdtempSync(join(tmpdir(), "reball-release-evidence-"));
  try {
    const board = boardFixture(), statePath = join(directory, "state.json");
    const receiptPath = join(directory, "receipts", "ci.json");
    mkdirSync(join(directory, "receipts"));
    writeFileSync(statePath, JSON.stringify(board));
    const validate = () => spawnSync(process.execPath, [SCRIPT, "validate", "--state", statePath], { encoding: "utf8" });
    const missing = validate();
    assert.equal(missing.status, 1); assert.match(missing.stderr, /receipt file is missing/);
    writeFileSync(receiptPath, JSON.stringify(receiptFixture(board, "R01")));
    const wrongTask = validate();
    assert.equal(wrongTask.status, 1); assert.match(wrongTask.stderr, /receipt.task_id must match R00/);
    writeFileSync(receiptPath, JSON.stringify(receiptFixture(board, "R00")));
    const valid = validate();
    assert.equal(valid.status, 0, valid.stderr);
    board.tasks[0].evidence = ["../outside.json"];
    writeFileSync(statePath, JSON.stringify(board));
    const escaped = validate();
    assert.equal(escaped.status, 1); assert.match(escaped.stderr, /must stay inside the control directory/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
