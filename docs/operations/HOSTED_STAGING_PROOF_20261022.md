# Hosted staging proof — 2026-10-22 KST

## Environment and isolation

The user authorized pausing SL자재 메시지센터 without deleting its data and restoring the existing Reball R42 DB Proof TEMP project. Final project states: SL inactive, Reball test active/healthy, Reball production active/healthy. No paid subscription or branch was purchased.

The completed restore contained an old, minimal R42 fixture, not a fresh commerce schema. Its five public tables and two private helper functions were preserved in `r42_archive_20261022`, with schema access revoked from PUBLIC, anon, authenticated and service_role. The archived fixture retains one order, one payment and nine proof rows. Nothing was deleted.

A clean public schema was created with schema USAGE for API roles. All 32 release-candidate migration source files were then executed against real hosted PostgreSQL 17.6 and the hosted Auth/Storage/cron/Vault infrastructure. This run does not use the local infrastructure doubles.

Several integration mutation requests expired before execution. The V2 and V3 console source files were partitioned at PostgreSQL parser statement boundaries, preserving every source byte and order, and applied as four parts each. History uses `replay_<source filename>` names, with `_part_001` through `_part_004` for those two files. Do not compare hosted version timestamps directly with repository filenames.

The historical reconciliation scheduler contains a production endpoint. Both scheduler source statements were followed by `cron.alter_job(..., active := false)` within the same migration transaction, before commit. Verified active cron jobs: **0**. This test project must not call production reconciliation.

## Executed database proof

`tests/db/data-api-grants/hosted-proof.sql` ran successfully through the database connector:

```json
{"passed_checks":57,"synthetic_transaction_rolled_back":true}
```

The script refuses to run without the preserved R42 marker schema or when Auth users already exist. It creates synthetic users, orders, inquiries, returns and POS rows inside a transaction, tests the actual role/RLS/RPC behavior, then rolls back all synthetic writes and test helper functions.

Covered: grant replay idempotency and unchanged RLS policies/flags; no anonymous target access; member ownership and anti-spoofing; store/CS/payments role visibility; service SELECT-only table access; denied direct mutations; actor-checked POS creation, inquiry reply and return resolution; three expected audit records.

Post-proof readback: **30 public tables, all RLS enabled; 0 Auth users; 0 new public orders; 0 active scheduled jobs.** The archived historical fixture is separate and retained.

## Hosted Edge deployment and HTTP checks

All 17 candidate Edge Functions were deployed to the test project only, with their existing application-level authentication. No production function was replaced.

Actual HTTP requests to staging returned:

| Request | Status | Code |
| --- | --- | --- |
| create-order OPTIONS, local allowed origin | 204 | valid CORS response |
| admin-console POST without session | 401 | AUTH_REQUIRED |
| admin-ops-extra POST without session | 401 | AUTH_REQUIRED |
| admin-members POST | 405 | METHOD_NOT_ALLOWED |
| create-order empty POST | 400 | IDEMPOTENCY_KEY_REQUIRED |
| get-order empty POST | 404 | ORDER_NOT_FOUND |
| prepare-payment empty POST | 404 | ORDER_NOT_FOUND |
| payment-confirm empty POST | 400 | INVALID_PAYMENT_CONFIRMATION |
| payment-cancel empty POST | 400 | INVALID_CANCELLATION |
| reconcile-payments without scheduler authorization | 403 | RECONCILE_DENIED |

These prove deployment/routing and selected failure boundaries. They do not prove authenticated checkout, email delivery, CAPTCHA verification or a Toss authorization/cancellation.

## Remaining launch work

Configure staging-only secrets and exact Preview origins/callback URLs through an authorized secret store/dashboard. Use actual Toss TEST credentials and real CAPTCHA credentials. Do not copy production secrets into Git or substitute fixture credentials in production.

Then perform real hosted signup/login/address and Toss TEST payment/cancellation/replay/inventory verification. Reconcile pending production migrations by definitions/names, verify backup/restore readiness, configure LIVE credentials and CAPTCHA, review actual merchant/fulfillment information, and deploy the verified candidate before a concrete user-authorized real purchase.

Production data, production schema, production Edge bundles and main remain unchanged by this checkpoint. The storefront is not yet declared ready for sales.
