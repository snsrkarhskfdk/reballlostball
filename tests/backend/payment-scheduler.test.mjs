import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../../supabase/migrations/20260828060000_payment_reconcile_scheduler.sql", import.meta.url);
const edgePath = new URL("../../supabase/functions/reconcile-payments/index.ts", import.meta.url);

const [migration, edge] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(edgePath, "utf8"),
]);

test("payment reconciliation scheduler uses pg_net, pg_cron, and Vault without a plaintext secret", () => {
  assert.match(migration, /create extension if not exists pg_net/i);
  assert.match(migration, /vault\.create_secret\(/);
  assert.match(migration, /reball_payment_reconcile_scheduler/);
  assert.match(migration, /cron\.schedule\(/);
  assert.match(migration, /net\.http_post\(/);
  assert.match(migration, /x-reball-reconcile-secret/);
  assert.match(migration, /functions\/v1\/reconcile-payments/);
  assert.doesNotMatch(migration, /x-reball-reconcile-secret['"\s,:=]+[0-9a-f]{64,}/i);
});

test("scheduler secret digest RPC is service-role only", () => {
  assert.match(migration, /payment_reconcile_scheduler_secret_hash_v1/);
  assert.match(migration, /extensions\.digest\(decrypted_secret, 'sha256'\)/);
  assert.match(migration, /revoke all on function public\.payment_reconcile_scheduler_secret_hash_v1\(\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.payment_reconcile_scheduler_secret_hash_v1\(\) to service_role/i);
});

test("reconcile-payments accepts the Vault digest path with constant-time comparison", () => {
  assert.match(edge, /await rpc<string \| null>\("payment_reconcile_scheduler_secret_hash_v1", \{\}\)/);
  assert.match(edge, /const suppliedHash = await sha256Hex\(supplied\)/);
  assert.match(edge, /constantTimeEqual\(expectedHash, suppliedHash\)/);
  assert.match(edge, /await assertSchedulerSecret\(req\)/);
  assert.match(edge, /PAYMENT_RECONCILE_SECRET/);
});
