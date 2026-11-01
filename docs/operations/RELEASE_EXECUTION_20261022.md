# Release execution — 2026-10-22 KST

The user authorized continuing through production launch and controlled real-payment validation. This supersedes the earlier instruction to stop at a candidate PR, while technical verification and missing credential/access prerequisites still apply. No real charge is authorized without a concrete product, amount, payment instrument and purchaser details.

PR #38 has been merged into PR #37's candidate branch (not main). The Data API grant repair and fresh-DB test are now part of the release candidate.

## Additional code repairs

- `prepare-payment` now validates the actual Toss client key returned by the Edge Function: only LIVE outside explicitly isolated dev/test runtimes. A valid Vercel key cannot conceal an Edge TEST key.
- hCaptcha remains supported in local/Preview configurations; the production Turnstile requirement remains enforced. Unsupported providers still fail.
- ORDER_ACCESS_DENIED is non-retryable in the current payment-return screen. It is not persisted as an order-wide terminal verdict, so signing into the rightful account does not inherit a different account's ownership failure.

Local verification: 228 frontend tests, 57 contract tests, 17 Deno tests (including the new actual-returned-key boundary), all 17 Edge Function typechecks, lint and build passed. The existing PostgreSQL grant proof remains unchanged (61 assertions). Remote full CI is required for this commit before integration into the release candidate.

## Required operational configuration

Configure through authenticated dashboards/approved secret stores; do not put secrets in Git or chat.

1. A non-production Supabase backend with synthetic data only, candidate schema/Edge bundles, exact Preview CORS and test payment URLs.
2. Preview public settings: staging SUPABASE_URL/publishable key, Toss TEST public key, real Turnstile sitekey/provider. Backend: explicit non-production runtime, corresponding TEST secret, CAPTCHA secret, origin/hostname allowlists, guest-token and encryption secrets.
3. Real hosted signup/verification/login/address path; TEST order/payment/cancellation/replay/inventory/audit verification. Local test doubles do not substitute for these.
4. Production backup and restore readiness, candidate-only pending migrations reconciled by name/definition (not blind timestamp replay), candidate Edge bundles, LIVE Toss credentials and exact production callback/webhook URLs.
5. Public merchant/shipping/returns/terms/privacy information must be reviewed against the merchant's actual business and fulfillment arrangements; no invented legal/merchant facts.
6. Stage the production build, inspect exact commit/config, then promote and verify public/auth/cart/order/admin routes. Production cannot use fixture CAPTCHA or sandbox keys.
7. A concrete controlled real purchase and cancellation/refund verification, followed by fulfillment/notification checks. Do not describe sales as completed without a real purchase/ledger receipt.

Vercel project `reballlostball`, team `thechangcnds-projects`; production domain `reballlostball.com`. Current tool access must be able to configure project environment variables before rollout. A project-env authorization failure cannot be fixed by committing keys or removing fail-closed checks. Request user-assisted account/configuration access only after completing independent code work.
