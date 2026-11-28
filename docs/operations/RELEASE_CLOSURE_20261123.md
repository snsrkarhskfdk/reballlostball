# Release closure checkpoint — 2026-11-23 KST

Existing candidate: PR #37, `repair/mr-dr01-harness-declare-scope`.
Inspected parent: `8f1d1d67bdc005e1040d290090efb522ae65d23d`.

## Scope and publication boundary

Continue the existing TEST checkout work. The November 7 execution record permits
updating this PR but prohibits deployment. This change updates the existing
candidate only. `vercel.json` retains automatic Git deployment disabled for this
branch. No merge, deployment, production write, real customer order, real charge,
provider agreement, account creation or separately billed model API call occurred.

## Confirmed defects repaired

1. **Payment response body failures after HTTP 200.** Previously, a timeout or
   truncated JSON body became `{}` and could clear the exact confirmation tuple
   and payment-return capability. Body timeout/parse failure now remains
   recoverable. A successful response must contain the same `orderNo`, integer
   `totalKrw`, and an accepted settlement status before recovery state is cleared.
   Waiting-for-deposit and fulfilled duplicate responses remain supported.
   Non-JSON 401/403/5xx responses retain status-based recovery semantics.
2. **Overlapping administrator reads.** Requests now follow successive newer
   requests, including replacements that themselves become stale. Pager application
   and returned data recheck the current token and visible tab after body parsing.
   Shared responses stay readable for all callers. Independent review found and
   verified an additional tab-switch-during-body-read regression.
3. **Administrator phrase search.** Server search text preserves the console's
   product/variant spacing and field order for each tab. Roles without order-PII
   permission retain the existing restricted search fields.

New regressions reproduced the defects before repair. Existing payment success
fixtures were updated to the actual backend `orderNo / totalKrw / status` contract;
no production response contract was weakened to satisfy a fixture.

## Local verification of the final source

Runtime: Node 22.23.5; Deno 2.9.6.

| Check | Result |
| --- | --- |
| Lint, build, release static smoke, legacy entrypoint guard | PASS |
| Edge function typecheck | PASS, all 17 entrypoints |
| SQL validation | PASS, 316 statements / 25 production migrations |
| Frontend tests | 240 / 240 PASS |
| Backend tests | 54 / 54 PASS |
| Deno provider-boundary tests | 17 / 17 PASS |
| Contract tests | 57 / 57 PASS |
| Final focused new regressions on Node 22 | 16 / 16 PASS |
| Independent review and focused regressions on Node 24 | REVIEW_PASS, 16 / 16 PASS |
| `git diff --check` | PASS |
| Local browser automation | BLOCKED before assertions: Chromium `socket() failed: Operation not permitted` |
| Local accessibility automation | NOT_RUN after the browser-launch failure |

The focused checks are a subset, not additional independent test cases to add to
the totals. The browser runner reported 74 failed launches; this is infrastructure
failure and does not establish 74 storefront assertion failures. The final source
must be evaluated by Full QA on the exact new PR head.

Prior Full QA #182 on parent `8f1d1d6` succeeded, including 74 E2E and 10 accessibility
cases plus Windows portability. The old 72-pass / 2-fail checkout fixture result
was already resolved. Do not present that old failure as remaining work or reuse
parent success as proof of this new patch.

## Current hosted state, independently inspected

| Surface | Current evidence |
| --- | --- |
| Production | READY deployment `dpl_6VBFnUd9GyFTCoxsGdJRCVymCXmV`, SHA `9f26f27a8b8833236618db9c0e72bdf415e7f161`, October 30 KST |
| Existing test deployment | READY `dpl_D2Lvz1sXBSVSCfuBFsYUKPwnh7Va`, SHA `41684cf8592aafc64ad6b9556aa1ba51e82b891f`, November 1 KST |
| Candidate | PR #37; newer than deployed TEST source |
| Main | `684d72c3fe7e00858495e193c4f83bbccf8ed61d`; not equal to production |
| Domain | Apex, www and project domain verified; not a remaining setup task |
| Vercel env inspection | Metadata-only request returned 403; current deployed secret values were not inspected |
| TEST backend | `aohziyemqxfhpbbqpicx`; recovered from initial hibernation/timeouts and responded successfully |
| TEST Auth | 0 users; no existing authenticated customer/admin test session established |
| Production migrations | Last observed `20260906204039 admin_ops_console_v3_advisor_cleanup` |
| TEST migrations | October 22 release replay present; latest `20261021230956 replay_20261021164650_explicit_data_api_grants` |

Production and TEST Edge versions differ. The production frontend, database and
Edge functions must be treated as a coordinated release; deploying the frontend
alone would not prove release completion. PR #36 is already included in #37;
production hotfix PR #40 remains open and needs reconciliation before promotion.

### Browser evidence from the existing TEST deployment

The page's DOM metadata identified the isolated TEST backend above. The actual
catalog loaded Titleist PRO V1 / A / 10 / white at 20,000 KRW with 9 sets available.
The Buy Now action reached the checkout form, displaying 20,000 + 3,500 shipping =
23,500 KRW. No recipient data was entered and no order/payment was submitted in
this session. This used deployed SHA `41684cf8`, not the repaired source.

### Read-only TEST payment inventory at 21:02:10 KST

| Aggregate | Result |
| --- | --- |
| Orders / payments | 7 / 7 |
| Orders by state | 6 payment_failed/expired; 1 payment_ready/ready |
| Payments by state | 6 expired; 1 ready |
| Non-null Toss payment keys | 0 |
| Approval timestamps / positive approved amounts | 0 / 0 |
| Cancellation timestamps / positive canceled amounts | 0 / 0 |
| Payment attempts / refunds | 0 / 0 |
| Reservations | 6 expired; 1 reserved, already past expires_at |
| Cron jobs | 2 total; 0 active |

Only counts and schema metadata were read. No payment keys, tokens, addresses or
private customer records were retrieved. Existing records were not rewritten or
deleted. The inactive TEST scheduler is not evidence of production scheduler
state. Existing unit/DB replay checks do not prove actual provider approval,
cancellation, automatic expiry or reconciliation.

## Necessary remaining completion gates

1. **Deploy the verified candidate to isolated TEST after explicit authorization.**
   Confirm Full QA on its exact SHA, TEST public/secret environment pairing,
   allowed callback origins, current Edge artifacts (including admin search), and
   the intended TEST database. Preserve production. The previous no-deploy
   instruction is why deployment is not performed in this checkpoint.
2. **Prove authenticated customer and administrator workflows.** Establish
   synthetic test accounts with legitimate signup/email/CAPTCHA steps and explicit
   test admin permissions. Verify login/logout, address persistence, own-order
   access, prohibited access and administrator order/search/shipping operations.
   Privileged database readback is not a substitute for browser authentication.
3. **Close the real Toss TEST round trip and recovery loop.** Complete provider
   consent/authorization, exact-order confirmation, order lookup, TEST cancellation,
   refund and inventory release. Verify repeated confirmation/webhook/cancel do not
   duplicate stock or money records. Prove reservation expiry and reconciliation
   with a controlled TEST schedule or authorized invocation and readback. The user
   previously reported no physical card; do not invent domestic test-card numbers
   or describe an opened payment window as successful approval.
4. **Promote a single reconciled release and hand over operations.** Once TEST
   gates pass, resolve the source/deployment difference, back up and rehearse the
   required migrations/Edge/frontend/environment/scheduler changes, validate live
   merchant readiness, obtain production authorization, then verify the controlled
   live checkout/cancel and documented rollback/owner handover. Production has not
   been authorized or changed by this checkpoint.

## Evidence links

- [Candidate PR #37](https://github.com/snsrkarhskfdk/reballlostball/pull/37)
- [Parent Full QA #182](https://github.com/snsrkarhskfdk/reballlostball/actions/runs/42345264781)
- [Existing TEST checkout](https://reballlostball-git-repair-mr-dr01-a7fa2f-thechangcnds-projects.vercel.app/#/checkout)
- [Production deployment](https://vercel.com/thechangcnds-projects/reballlostball/6VBFnUd9GyFTCoxsGdJRCVymCXmV)
- [Existing TEST deployment](https://vercel.com/thechangcnds-projects/reballlostball/D2Lvz1sXBSVSCfuBFsYUKPwnh7Va)
