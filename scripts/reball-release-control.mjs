import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// This module validates declarations and prints status. It never writes state,
// opens a browser, contacts a service, grants permission, or executes a task.
const DEFAULT_STATE = fileURLToPath(new URL("../docs/operations/release-control/TASKS.json", import.meta.url));
const SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const CAPABILITIES = ["test_deploy", "test_account_setup", "test_transactions", "test_scheduler", "production"];
const TASK_STATUSES = new Set(["VERIFIED", "READY", "PENDING", "BLOCKED", "RUNNING", "WAITING_FOR_USER", "FAILED"]);
const KINDS = new Set(["ci", "connection", "test", "production"]);
const OUTCOMES = new Set(["PASS", "SUCCESS", "FAIL", "FAILED", "BLOCKED", "NOT_RUN", "DENIED", "ERROR", "SKIPPED"]);
const SECRET_FIELDS = new Set([
  "password", "passwd", "pwd", "secret", "clientsecret", "apisecret", "apikey",
  "accesstoken", "refreshtoken", "authorization", "servicerolekey", "privatekey",
  "paymentkey", "paymentreturntoken", "guestlookuptoken", "sessioncookie", "cookie",
]);
const SECRET_URL_FIELDS = new Set([...SECRET_FIELDS, "token", "auth", "code", "signature", "sig"]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;
const nullableText = (value) => value === null || text(value);
const normalKey = (key) => String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();
const spaceIdentifier = (value) => (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value)))
  && Number.isSafeInteger(Number(value)) && Number(value) > 0;

function isoTime(value) {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour < 24 && minute < 60 && second < 60;
}

function actualIdentifier(value) {
  return text(value) && !/^(?:TODO|TBD|UNKNOWN|PENDING|NOT_RUN|REPLACE(?:_.*)?|<.*>)$/i.test(value.trim());
}

function httpsOrigin(value) {
  if (!text(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.origin === value;
  } catch { return false; }
}

function secretErrors(value, path = "$", seen = new Set()) {
  const errors = [];
  if (value && typeof value === "object") {
    if (seen.has(value)) return [`${path}: cyclic object is not JSON data`];
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      const child = `${path}.${key}`;
      const authorizationBoard = normalKey(key) === "authorization" && object(entry);
      if (!authorizationBoard && SECRET_FIELDS.has(normalKey(key)) && entry !== null && entry !== "" && entry !== undefined) {
        errors.push(`${child}: secret values must not be stored in control data`);
      }
      errors.push(...secretErrors(entry, child, seen));
    }
    seen.delete(value);
  } else if (typeof value === "string") {
    // Match credential-shaped values or actual URLs, never prose such as
    // "do not store paymentKey" or "password authentication was checked".
    if (/(?:^|[^A-Za-z0-9_-])(?:sb_secret_[A-Za-z0-9_-]{8,}|(?:test|live)_g?sk_[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?=$|[^A-Za-z0-9_-])/.test(value)
        || /^Bearer\s+[A-Za-z0-9_.-]{24,}$/.test(value.trim())) {
      errors.push(`${path}: credential-shaped value must be redacted`);
    }
    for (const candidate of value.match(/https?:\/\/[^\s<>"']+/gi) || []) {
      try {
        const url = new URL(candidate);
        let sensitive = Boolean(url.username || url.password);
        const fragment = url.hash.slice(1);
        const fragmentQuery = fragment.includes("?") ? fragment.slice(fragment.indexOf("?") + 1) : fragment;
        for (const params of [url.searchParams, new URLSearchParams(fragmentQuery)]) {
          for (const [key, entry] of params) {
            if (entry && SECRET_URL_FIELDS.has(normalKey(key))) sensitive = true;
          }
        }
        if (sensitive) errors.push(`${path}: secret-bearing URL must be redacted`);
      } catch { /* Ordinary prose and non-URL strings are not rejected here. */ }
    }
  }
  return errors;
}

function stringArray(value, label, errors, { nonempty = false, unique = false } = {}) {
  if (!Array.isArray(value) || value.some((entry) => !text(entry)) || (nonempty && !value.length)) {
    errors.push(`${label}: expected ${nonempty ? "nonempty " : ""}string array`);
    return [];
  }
  if (unique && new Set(value).size !== value.length) errors.push(`${label}: duplicate values`);
  return value;
}

function projectFor(board, capability) {
  return capability === "production" ? board?.environment?.production_project_ref : board?.environment?.expected_test_project_ref;
}

function hasApproval(board, capability, codeSha = board?.code?.reviewed_sha) {
  if (!CAPABILITIES.includes(capability) || board?.authorization?.[capability] !== "APPROVED") return false;
  const exactCodeRequired = capability === "test_deploy" || capability === "production";
  return Array.isArray(board.authorization.records) && board.authorization.records.some((record) =>
    object(record) && record.capability === capability && record.status === "APPROVED"
    && record.approved_by === "USER" && text(record.source) && isoTime(record.approved_at)
    && object(record.scope) && record.scope.project_ref === projectFor(board, capability)
    && ((!exactCodeRequired && record.scope.code_sha === null)
      || (SHA.test(record.scope.code_sha || "") && record.scope.code_sha === codeSha && (!exactCodeRequired || codeSha === board?.code?.reviewed_sha)))
  );
}

export function validateBoard(board) {
  const errors = secretErrors(board);
  if (!object(board)) return [...errors, "board: expected an object"];
  if (board.schema_version !== 1) errors.push("schema_version: must be 1");
  if (!object(board.repository)) errors.push("repository: required object");
  else {
    if (!text(board.repository.full_name) || !/^[\w.-]+\/[\w.-]+$/.test(board.repository.full_name)) errors.push("repository.full_name: expected owner/repository");
    if (!text(board.repository.branch)) errors.push("repository.branch: required");
    if (!Number.isSafeInteger(board.repository.pr) || board.repository.pr < 1) errors.push("repository.pr: expected positive integer");
  }
  if (!object(board.code)) errors.push("code: required object");
  else {
    if (!SHA.test(board.code.reviewed_sha || "")) errors.push("code.reviewed_sha: expected full 40-character commit SHA");
    try {
      const url = new URL(board.code.ci_url);
      if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith(`/${board.repository?.full_name}/actions/runs/`)) throw new Error();
    } catch { errors.push("code.ci_url: expected this repository's HTTPS GitHub Actions run URL"); }
  }
  if (!object(board.environment)) errors.push("environment: required object");
  else {
    if (board.environment.expected_test_project_ref !== "aohziyemqxfhpbbqpicx") errors.push("environment.expected_test_project_ref: wrong isolated TEST project");
    if (board.environment.production_project_ref !== "qbftalhhyfcndanrcwpy") errors.push("environment.production_project_ref: wrong production project");
    if (!httpsOrigin(board.environment.test_origin)) errors.push("environment.test_origin: expected exact HTTPS origin without path/query");
    if (!httpsOrigin(board.environment.production_origin)) errors.push("environment.production_origin: expected exact HTTPS origin without path/query");
    if (board.environment.test_origin === board.environment.production_origin) errors.push("environment: TEST and production origins must differ");
  }
  if (!object(board.authorization)) errors.push("authorization: required object");
  else {
    for (const capability of CAPABILITIES) {
      if (!["PENDING", "APPROVED", "DENIED"].includes(board.authorization[capability])) errors.push(`authorization.${capability}: expected PENDING, APPROVED or DENIED`);
    }
    if (!Array.isArray(board.authorization.records)) errors.push("authorization.records: expected array");
    else for (const [index, record] of board.authorization.records.entries()) {
      const label = `authorization.records[${index}]`;
      if (!object(record)) { errors.push(`${label}: expected object`); continue; }
      if (!CAPABILITIES.includes(record.capability)) errors.push(`${label}.capability: unknown capability`);
      if (record.status !== "APPROVED" || record.approved_by !== "USER" || !text(record.source) || !isoTime(record.approved_at)) errors.push(`${label}: explicit USER approval, source and ISO approved_at are required`);
      if (!object(record.scope)) errors.push(`${label}.scope: required object`);
      else {
        if (record.scope.project_ref !== projectFor(board, record.capability)) errors.push(`${label}.scope.project_ref: wrong permission target`);
        if (record.scope.code_sha !== null && !SHA.test(record.scope.code_sha || "")) errors.push(`${label}.scope.code_sha: expected full SHA or null`);
      }
    }
    for (const capability of CAPABILITIES) {
      if (board.authorization[capability] === "APPROVED" && !hasApproval(board, capability)) errors.push(`authorization.${capability}: APPROVED requires a matching explicit USER record for this project/code`);
    }
  }
  if (!object(board.execution)) errors.push("execution: required object");
  else {
    if (board.execution.executor !== "LOCAL_CODEX") errors.push("execution.executor: must be LOCAL_CODEX");
    if (board.execution.browser !== "ego-browser") errors.push("execution.browser: must be ego-browser");
    const spaceId = board.execution.space_id;
    if (spaceId !== null && !spaceIdentifier(spaceId)) errors.push("execution.space_id: expected positive safe integer, numeric string or null");
    for (const key of ["run_id", "owner"]) if (!nullableText(board.execution[key])) errors.push(`execution.${key}: expected nonempty string or null`);
    stringArray(board.execution.page_labels, "execution.page_labels", errors, { unique: true });
    if (board.execution.heartbeat_at !== null && !isoTime(board.execution.heartbeat_at)) errors.push("execution.heartbeat_at: expected ISO timestamp or null");
  }
  if (!Array.isArray(board.tasks) || !board.tasks.length) return [...errors, "tasks: expected nonempty array"];
  const tasks = new Map();
  for (const [index, task] of board.tasks.entries()) {
    const label = `tasks[${index}]`;
    if (!object(task)) { errors.push(`${label}: expected object`); continue; }
    if (!text(task.id) || !/^[A-Za-z0-9_-]+$/.test(task.id)) errors.push(`${label}.id: invalid task ID`);
    else if (tasks.has(task.id)) errors.push(`${label}.id: duplicate task ID ${task.id}`);
    else tasks.set(task.id, task);
    if (!text(task.title)) errors.push(`${label}.title: required`);
    if (!TASK_STATUSES.has(task.status)) errors.push(`${label}.status: unsupported status`);
    if (!KINDS.has(task.evidence_kind)) errors.push(`${label}.evidence_kind: unsupported kind`);
    if (task.approval !== null && !CAPABILITIES.includes(task.approval)) errors.push(`${label}.approval: unknown approval capability`);
    if (task.evidence_kind === "production" && task.approval !== "production") errors.push(`${label}: production task requires its own production approval`);
    if (task.approval === "production" && task.evidence_kind !== "production") errors.push(`${label}: production approval cannot be used for another evidence kind`);
    if (["ci", "connection"].includes(task.evidence_kind) && task.approval !== null) errors.push(`${label}: CI and connection tasks are read-only`);
    stringArray(task.requires, `${label}.requires`, errors, { unique: true });
    stringArray(task.acceptance, `${label}.acceptance`, errors, { nonempty: true, unique: true });
    stringArray(task.evidence, `${label}.evidence`, errors, { nonempty: task.status === "VERIFIED" });
    if (!nullableText(task.blocked_reason)) errors.push(`${label}.blocked_reason: expected string or null`);
    if (["BLOCKED", "WAITING_FOR_USER", "FAILED"].includes(task.status) && !text(task.blocked_reason)) errors.push(`${label}.blocked_reason: required for this status`);
  }
  let active = 0;
  for (const task of tasks.values()) {
    for (const id of Array.isArray(task.requires) ? task.requires : []) {
      if (!tasks.has(id)) errors.push(`${task.id}.requires: unknown dependency ${id}`);
      else if (["READY", "RUNNING"].includes(task.status) && tasks.get(id).status !== "VERIFIED") errors.push(`${task.id}: dependency ${id} must be VERIFIED before ${task.status}`);
    }
    if (["RUNNING", "WAITING_FOR_USER"].includes(task.status)) {
      active++;
      if (!actualIdentifier(board.execution?.run_id) || !actualIdentifier(board.execution?.owner) || !isoTime(board.execution?.heartbeat_at)) errors.push(`${task.id}: ${task.status} requires actual run_id, owner and ISO heartbeat_at`);
      if (task.status === "RUNNING" && task.approval !== null && !hasApproval(board, task.approval)) errors.push(`${task.id}: RUNNING lacks explicit APPROVED ${task.approval} permission`);
    }
  }
  if (active > 1) errors.push("tasks: at most one task may be RUNNING or WAITING_FOR_USER");
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`tasks: dependency cycle at ${id}`); return; }
    if (visited.has(id) || !tasks.has(id)) return;
    visiting.add(id);
    for (const dependency of Array.isArray(tasks.get(id).requires) ? tasks.get(id).requires : []) visit(dependency);
    visiting.delete(id); visited.add(id);
  }
  for (const id of tasks.keys()) visit(id);
  return [...new Set(errors)];
}

export function validateReceipt(receipt, board) {
  const errors = [...validateBoard(board).map((error) => `board: ${error}`), ...secretErrors(receipt)];
  if (!object(receipt)) return [...errors, "receipt: expected object"];
  if (receipt.schema_version !== 1) errors.push("receipt.schema_version: must be 1");
  const task = Array.isArray(board?.tasks) ? board.tasks.find((entry) => object(entry) && entry.id === receipt.task_id) : null;
  if (!task) errors.push("receipt.task_id: unknown task");
  if (!["PASS", "FAIL", "BLOCKED"].includes(receipt.status)) errors.push("receipt.status: expected PASS, FAIL or BLOCKED");
  if (!actualIdentifier(receipt.run_id)) errors.push("receipt.run_id: actual execution run ID required");
  if (!isoTime(receipt.observed_at)) errors.push("receipt.observed_at: valid ISO timestamp required");
  const environment = object(receipt.environment) ? receipt.environment : {};
  if (!SHA.test(receipt.code_sha || "")) errors.push("receipt.code_sha: full 40-character SHA required");
  const historicalCiImport = environment.kind === "ci" && receipt.source_kind === "HISTORICAL_CI_IMPORT";
  if (!(historicalCiImport && receipt.orchestration_sha === null) && !SHA.test(receipt.orchestration_sha || "")) errors.push("receipt.orchestration_sha: full 40-character SHA required except an explicit historical CI import");
  if (receipt.source_kind === "HISTORICAL_CI_IMPORT" && environment.kind !== "ci") errors.push("receipt.source_kind: HISTORICAL_CI_IMPORT is only valid for CI evidence");
  if (!object(receipt.environment) || !KINDS.has(environment.kind)) errors.push("receipt.environment.kind: supported environment kind required");
  if (task && task.evidence_kind !== environment.kind) errors.push("receipt.environment.kind: must match task.evidence_kind");
  const expectedExecutor = environment.kind === "ci" ? "GITHUB_ACTIONS" : board?.execution?.executor;
  if (!text(expectedExecutor) || receipt.executor !== expectedExecutor) errors.push("receipt.executor: does not match the actual executor required for this evidence kind");
  for (const key of ["origin", "supabase_project_ref", "deployment_id", "deployed_sha"]) {
    if (!nullableText(environment[key])) errors.push(`receipt.environment.${key}: expected nonempty string or null`);
  }
  const hosted = ["connection", "test", "production"].includes(environment.kind);
  if (hosted) {
    const production = environment.kind === "production";
    const expectedOrigin = production ? board?.environment?.production_origin : board?.environment?.test_origin;
    const expectedProject = projectFor(board, production ? "production" : "test_deploy");
    if (environment.origin !== null && (environment.origin !== expectedOrigin || !httpsOrigin(environment.origin))) errors.push("receipt.environment.origin: wrong target host; must exactly match the board");
    if (environment.supabase_project_ref !== null && environment.supabase_project_ref !== expectedProject) errors.push("receipt.environment.supabase_project_ref: wrong target project");
    if (environment.deployed_sha !== null && !SHA.test(environment.deployed_sha || "")) errors.push("receipt.environment.deployed_sha: full SHA required when provided");
    if (receipt.status === "PASS") {
      for (const key of ["origin", "supabase_project_ref", "deployment_id", "deployed_sha"]) if (!actualIdentifier(environment[key])) errors.push(`receipt.environment.${key}: actual hosted identity required for PASS`);
    }
    if (["test", "production"].includes(environment.kind) && environment.deployed_sha !== null && environment.deployed_sha !== receipt.code_sha) errors.push("receipt.environment.deployed_sha: must equal receipt.code_sha for TEST/production proof");
  } else if (environment.kind === "ci") {
    for (const key of ["origin", "supabase_project_ref", "deployment_id", "deployed_sha"]) if (environment[key] !== null) errors.push(`receipt.environment.${key}: CI evidence must not claim a hosted deployment`);
  }
  if (receipt.status === "PASS" && ["ci", "test", "production"].includes(environment.kind) && receipt.code_sha !== board?.code?.reviewed_sha) errors.push("receipt.code_sha: PASS must refer to the board's reviewed code SHA");
  if (!Array.isArray(receipt.actions)) errors.push("receipt.actions: expected array");
  else {
    if (receipt.status === "PASS" && !receipt.actions.length) errors.push("receipt.actions: PASS requires an actual action record");
    const actionIds = new Set();
    for (const [index, action] of receipt.actions.entries()) {
      const label = `receipt.actions[${index}]`;
      if (!object(action)) { errors.push(`${label}: expected object`); continue; }
      if (!actualIdentifier(action.action_id) || actionIds.has(action.action_id)) errors.push(`${label}.action_id: required unique action ID`);
      actionIds.add(action.action_id);
      if (!["read", "mutation"].includes(action.kind)) errors.push(`${label}.kind: expected read or mutation`);
      if (!text(action.summary)) errors.push(`${label}.summary: required`);
      if (!OUTCOMES.has(action.outcome)) errors.push(`${label}.outcome: explicit outcome required`);
      if (receipt.status === "PASS" && !["PASS", "SUCCESS"].includes(action.outcome)) errors.push(`${label}: failed, denied or unexecuted action cannot support PASS`);
      if (action.kind === "mutation") {
        if (["ci", "connection"].includes(environment.kind)) errors.push(`${label}: CI/connection evidence cannot authorize mutations`);
        if (!task?.approval || !hasApproval(board, task.approval, receipt.code_sha)) errors.push(`${label}: mutation requires matching APPROVED permission and explicit USER record`);
      }
    }
  }
  const assertions = new Map();
  if (!Array.isArray(receipt.assertions)) errors.push("receipt.assertions: expected array");
  else for (const [index, assertion] of receipt.assertions.entries()) {
    const label = `receipt.assertions[${index}]`;
    if (!object(assertion)) { errors.push(`${label}: expected object`); continue; }
    if (!text(assertion.id) || assertions.has(assertion.id)) errors.push(`${label}.id: required unique assertion ID`);
    else assertions.set(assertion.id, assertion);
    if (!["PASS", "FAIL", "NOT_RUN"].includes(assertion.result)) errors.push(`${label}.result: expected PASS, FAIL or NOT_RUN`);
    stringArray(assertion.evidence_refs, `${label}.evidence_refs`, errors, { nonempty: assertion.result === "PASS" });
    if (receipt.status === "PASS" && assertion.result !== "PASS") errors.push(`${label}: all reported assertions must PASS for a PASS receipt`);
  }
  if (!Array.isArray(receipt.artifacts)) errors.push("receipt.artifacts: expected array");
  else for (const [index, artifact] of receipt.artifacts.entries()) {
    if (!object(artifact) || !text(artifact.path) || !SHA256.test(artifact.sha256 || "") || artifact.redacted !== true) errors.push(`receipt.artifacts[${index}]: path, full SHA-256 and redacted:true required`);
  }
  if (receipt.status === "PASS") {
    if (receipt.blocker !== null) errors.push("receipt.blocker: PASS must have null blocker");
    if (environment.kind === "connection") {
      if (!spaceIdentifier(board?.execution?.space_id)) errors.push("receipt: connection PASS requires an observed positive ego Space ID");
      if (!Array.isArray(board?.execution?.page_labels) || !board.execution.page_labels.length) errors.push("receipt: connection PASS requires recorded browser page labels");
      if (!actualIdentifier(board?.execution?.owner)) errors.push("receipt: connection PASS requires an actual local controller owner");
      if (board?.execution?.skill_observed !== true) errors.push("receipt: connection PASS requires skill_observed:true");
    }
    for (const criterion of Array.isArray(task?.acceptance) ? task.acceptance : []) {
      const assertion = assertions.get(criterion);
      if (!assertion || assertion.result !== "PASS" || !Array.isArray(assertion.evidence_refs) || !assertion.evidence_refs.length) errors.push(`receipt: acceptance ${criterion} needs PASS and nonempty evidence_refs`);
    }
    for (const id of Array.isArray(task?.requires) ? task.requires : []) {
      if (!board?.tasks?.some((entry) => entry?.id === id && entry.status === "VERIFIED")) errors.push(`receipt: dependency ${id} must be VERIFIED before PASS`);
    }
    if (task?.approval && !hasApproval(board, task.approval, receipt.code_sha)) errors.push(`receipt: PASS lacks explicit APPROVED ${task.approval} permission`);
    if (environment.kind === "production" && !hasApproval(board, "production", receipt.code_sha)) errors.push("receipt: production PASS requires its own explicit production approval");
  } else if (!object(receipt.blocker) || !["owner", "required_action", "resume_check"].every((key) => text(receipt.blocker[key]))) {
    errors.push("receipt.blocker: FAIL/BLOCKED needs owner, required_action and resume_check");
  }
  return [...new Set(errors)];
}

function blockersFor(task, board) {
  const reasons = [];
  for (const id of task.requires) if (board.tasks.find((entry) => entry.id === id)?.status !== "VERIFIED") reasons.push(`dependency ${id} is not VERIFIED`);
  if (task.approval !== null && !hasApproval(board, task.approval)) reasons.push(`${task.approval} is ${board.authorization[task.approval]} or lacks a matching explicit approval record`);
  if (task.blocked_reason) reasons.push(task.blocked_reason);
  const active = board.tasks.find((entry) => ["RUNNING", "WAITING_FOR_USER"].includes(entry.status) && entry.id !== task.id);
  if (active && task.status !== "VERIFIED") reasons.push(`single-writer lock: ${active.id} is ${active.status}`);
  return reasons;
}

function readJson(path) {
  let content;
  try { content = readFileSync(path, "utf8"); } catch { throw new Error(`Cannot read JSON file: ${path}`); }
  try { return JSON.parse(content); } catch { throw new Error(`Invalid JSON file: ${path}`); }
}

function validateVerifiedEvidence(board, statePath) {
  const errors = [];
  let controlDirectory;
  try { controlDirectory = realpathSync(dirname(statePath)); }
  catch { return ["verified evidence: cannot resolve the control directory"]; }
  const inside = (candidate) => {
    const child = relative(controlDirectory, candidate);
    return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
  };
  for (const task of board.tasks.filter((entry) => entry.status === "VERIFIED")) {
    for (const [index, reference] of task.evidence.entries()) {
      const label = `${task.id}.evidence[${index}]`;
      if (isAbsolute(reference) || /^[a-z][a-z0-9+.-]*:/i.test(reference) || !/\.json$/i.test(reference)) {
        errors.push(`${label}: expected a receipt JSON path relative to the control directory`);
        continue;
      }
      const path = resolve(controlDirectory, reference);
      if (!inside(path)) { errors.push(`${label}: path must stay inside the control directory`); continue; }
      let realPath;
      try { realPath = realpathSync(path); }
      catch { errors.push(`${label}: receipt file is missing or unreadable`); continue; }
      if (!inside(realPath)) { errors.push(`${label}: receipt resolves outside the control directory`); continue; }
      let receipt;
      try { receipt = readJson(realPath); }
      catch { errors.push(`${label}: receipt file is unreadable or invalid JSON`); continue; }
      if (receipt?.task_id !== task.id) errors.push(`${label}: receipt.task_id must match ${task.id}`);
      if (receipt?.status !== "PASS") errors.push(`${label}: VERIFIED evidence requires a PASS receipt`);
      errors.push(...validateReceipt(receipt, board).map((error) => `${label}: ${error}`));
    }
  }
  return errors;
}

function cli(args) {
  let statePath = DEFAULT_STATE;
  const positional = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--state") {
      if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error("--state requires a path");
      statePath = resolve(args[++index]);
    } else if (args[index].startsWith("--")) throw new Error("Unknown option; only --state is supported");
    else positional.push(args[index]);
  }
  const [command, receiptPath] = positional;
  if (!["status", "validate", "receipt"].includes(command) || positional.length !== (command === "receipt" ? 2 : 1)) {
    throw new Error("Usage: node scripts/reball-release-control.mjs status|validate [--state <path>] | receipt <path> [--state <path>]");
  }
  const board = readJson(statePath);
  const errors = command === "receipt" ? validateReceipt(readJson(resolve(receiptPath)), board) : validateBoard(board);
  if (command === "validate" && !errors.length) errors.push(...validateVerifiedEvidence(board, statePath));
  console.log("READ-ONLY: this command does not connect to local Codex/ego-browser, claim a local connection, or execute browser/deploy/account/payment/remote-write actions.");
  if (errors.length) {
    console.error("INVALID — no task is authorized by this result.");
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }
  if (command === "status") {
    console.log(`${board.repository.full_name} | ${board.repository.branch} | PR #${board.repository.pr}`);
    console.log(`Reviewed code: ${board.code.reviewed_sha}`);
    const runnable = board.tasks.filter((task) => task.status === "READY" && !blockersFor(task, board).length);
    console.log(`RUNNABLE (declared state only): ${runnable.length ? runnable.map((task) => task.id).join(", ") : "none"}`);
    for (const task of board.tasks) {
      const reasons = blockersFor(task, board);
      console.log(`${task.id} [${task.status}] ${task.title}`);
      for (const reason of reasons) console.log(`  blocked: ${reason}`);
      if (!["READY", "RUNNING", "VERIFIED"].includes(task.status) && !reasons.length) console.log("  blocked: task has not been explicitly marked READY");
    }
  } else console.log(command === "receipt" ? "VALID receipt declarations; evidence truth and artifact contents were not independently verified." : "VALID board declarations; approvals and evidence were not created or changed.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = cli(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}
