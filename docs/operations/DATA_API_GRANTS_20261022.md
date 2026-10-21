# Explicit Data API grants — 2026-10-22 KST

## Scope and source

Supabase's [official announcement](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) applies the new-table opt-in to existing projects on 2026-10-30. Existing grants are retained. GRANT and RLS are separate checks; service_role's BYPASSRLS does not bypass table privileges.

This change is stacked on PR #37 at `f51167615a02c1d39d3c86be572f89a872619907`. PR #36 is still open at `1d3bce5ef55a95ca5128b2ffe7e39b81f0c09063`; #37 explicitly incorporates it and says not to merge #36 independently. Neither PR was changed, merged or deployed. All 31 existing migration files are byte-identical to #37. The eight September 9–14 candidate migrations are still absent from the production migration history by name; their rollout remains part of #37's existing release gate. Hosted migration timestamps also differ from repository timestamps, so do not run a blind production db push.

## Minimal additive patch

`20261021164650_explicit_data_api_grants.sql` was created with the Supabase CLI migration command (UTC filename, October 22 KST).

| Tables | authenticated addition | service_role addition | anon addition |
| --- | --- | --- | --- |
| customer_inquiries, return_requests | SELECT, INSERT | SELECT | none |
| pos_devices | SELECT | SELECT | none |
| brands, banners, benefit_policies, reviews, admin_audit_logs, store_profile, policy_versions | none | SELECT | none |

The seven additional service reads are used in `admin-console` and `admin-ops-extra`. Those handlers use REST `serviceSelect`, so a SECURITY DEFINER mutation RPC alone does not repair their read path. Mutations stay in the existing actor-authorized and audited RPCs. No direct service writes are added. Customer insert policies already reject administrative reply/resolution fields and enforce ownership. UUID defaults need no sequence privileges.

No policies, functions, RPC EXECUTE grants, default privileges or existing table grants are modified/revoked. In particular, this patch does **not** tighten legacy wide grants on already-created tables. No new anonymous access is introduced. Applying it repeatedly is safe. No rows are modified.

## Audit of the complete migration surface

The fresh replay contains 30 public tables, all with RLS enabled, plus `private.edge_rate_limits` with explicit service DML. The full post-patch table ACL matrix is in the proof log. Schema public usage is already explicitly granted in prior migrations. There are no application sequences/views needing grants. Existing profile UPDATE column grants remain unchanged; table-level matrices do not display them.

- Storefront reads for store_profile, brands, products, product_variants, banners and policy_versions are explicitly covered by 0001.
- Member profiles/addresses, order reads, snapshots, payments, refunds and user_roles reads are covered by 0001 and the July security migration. Trust-sensitive order/payment writes remain revoked from browser roles.
- July's commerce_settings, shipping_surcharge_zones, inventory_reservations and order_events explicitly grant service DML and authenticated SELECT subject to their RLS.
- Payment attempts/events remain service mediated. No policy's mere existence was interpreted as a reason to grant additional browser access.
- V3 customer_inquiries, return_requests and pos_devices lacked all explicit table grants. This patch repairs only their existing member/read contract and the Edge read paths.
- Legacy inventory_lots and benefit_applications have policies but no active direct Data API consumer in this candidate. They stay unexposed in a restrictive fresh DB; no speculative grants added. benefit_policies is read through the authorized Edge endpoint; its old public-read policy is not a reason to expose it to anon. Likewise anonymous review reads and browser admin audit reads are not enabled by this repair; the active admin endpoints use service reads.

Production was inspected **read-only** using ACLs, defaults, target policies, migration metadata and Security Advisor. No customer/order/payment rows or API keys were queried. No current outage is claimed. Existing permissions are preserved; no hosted settings were changed. Raw production metadata snapshots are deliberately excluded from GitHub; only the repository-derived/local-fixture evidence is committed.

## Reproducible validation

Use a disposable local PostgreSQL 17 database with pgcrypto available and a superuser bootstrap connection. The runner rejects remote hosts, non-`reball_grants_*` names and populated application databases. `pg` is pinned as a development dependency; no runtime application dependency changed.

```sh
# Create a NEW empty database, e.g. reball_grants_ci, on a local disposable cluster.
REBALL_GRANTS_TEST_URL=postgresql://postgres:LOCAL_PASSWORD@127.0.0.1:5432/reball_grants_ci npm run test:db:grants
```

The dedicated GitHub workflow provisions PostgreSQL 17.6 and Node 22. It runs SQL parsing and the database test on migration/harness changes. It does not use Supabase secrets or deployment credentials.

Local proof: PostgreSQL **17.6**, Node **24.19.0** (local runtime differs from the repository's required Node 22; CI uses Node 22). All **31 baseline migrations** replayed. Only the two `CREATE EXTENSION pg_cron/pg_net` statements were replaced by local infrastructure test doubles. The scheduler SQL bodies still replay against inert cron/Vault doubles. Auth uid/users and Storage policy targets are minimal local doubles; actual GoTrue authentication, Storage IO, scheduler workers and HTTP/PostgREST behavior are **not** tested here. Real PostgreSQL GRANT/RLS/SECURITY DEFINER behavior is exercised; pgcrypto is real. No scheduler command or external HTTP/payment call executes.

Results:

- Baseline restrictive DB reproduces missing privilege checks and an actual 42501 query failure before patching.
- **61 assertions PASS** after patch: minimal role matrix, RLS on every table, replay idempotency, exact policy/function/RPC/default preservation, own inquiry/return inserts, cross-member denial, admin-state spoof denial, anonymous read/write denial, store/CS/payments row visibility, direct write denial, service-only RPC, actor-role denials, POS creation, inquiry reply and return resolution plus three audit rows.
- The same patch replayed twice over simulated legacy broad target ACLs without altering those grants or RLS/RPC/default boundaries.
- All synthetic data rolled back. The disposable DB keeps only the migration schema and fixture-free grant state.
- Existing contract tests: **57/57 PASS**. SQL parser: **316 statements / 25 dated migrations PASS**. Repository lint: **PASS**.

Raw local fixture test logs are committed alongside this report; production metadata snapshots are excluded. Full frontend/browser/release QA is delegated to the existing PR CI, not represented by the database proof. This work does not clear #37's staging, credentials, backup/restore, rollout or real-payment approval gates.

## Rollout boundary

This PR supplies a reviewed candidate migration and regression protection. It does not apply SQL to production, push Edge bundles, merge #37, change real users/orders/payments, or authorize a real transaction. Integrate it with the approved candidate's staging replay first. Do not blindly revoke its grants to roll back a legacy installation: some of the same privileges existed before this patch. Restore from the captured ACL baseline if a separate authorized rollback is needed.

## Fresh database table ACL inventory

All rows have RLS enabled. DML below is table-level only; profile column grants are separate. A dash means no table grant.

| Table | anon | authenticated | service_role |
| --- | --- | --- | --- |
| addresses | — | DELETE,INSERT,SELECT,UPDATE | — |
| admin_audit_logs | — | — | SELECT |
| banners | SELECT | SELECT | SELECT |
| benefit_applications | — | — | — |
| benefit_policies | — | — | SELECT |
| brands | SELECT | SELECT | SELECT |
| commerce_settings | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
| customer_inquiries | — | INSERT,SELECT | SELECT |
| inventory_lots | — | — | — |
| inventory_reservations | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
| order_events | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
| order_item_snapshots | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
| order_items | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
| orders | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
| payment_attempts | — | — | DELETE,INSERT,SELECT,UPDATE |
| payment_events | — | — | DELETE,INSERT,SELECT,UPDATE |
| payment_refunds | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
| payment_snapshots | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
| payments | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
| policy_versions | SELECT | SELECT | SELECT |
| pos_devices | — | SELECT | SELECT |
| product_variants | SELECT | SELECT | DELETE,INSERT,SELECT,UPDATE |
| products | SELECT | SELECT | DELETE,INSERT,SELECT,UPDATE |
| profiles | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
| return_requests | — | INSERT,SELECT | SELECT |
| reviews | — | INSERT,SELECT,UPDATE | SELECT |
| shipping_snapshots | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
| shipping_surcharge_zones | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
| store_profile | SELECT | SELECT | SELECT |
| user_roles | — | SELECT | DELETE,INSERT,SELECT,UPDATE |
