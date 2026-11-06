# Checkout execution checkpoint — 2026-11-07 KST

Task: `PRESENT-20261104-REBALL-TEST-CHECKOUT`. Existing PR #37, branch
`repair/mr-dr01-harness-declare-scope`, inspected parent
`41684cf8592aafc64ad6b9556aa1ba51e82b891f`.

## Execution receipt and remaining environment blocker

The November 4 owner request received only the Codex connector's “create an
environment for this repo” response. The PR head was still the November 1 commit;
the PR timeline supplied no cloud execution receipt. Code review completion is
not an implementation-task receipt. This session executed the code checks below
directly against that candidate; it did not start another cloud worker.

Opening `https://chatgpt.com/codex/cloud/settings/environments` in the available
browser redirected to ChatGPT sign-in. Therefore current cloud tasks, environment
existence, writable scope and entitlement/fallback controls could NOT be inspected
or configured. Do not infer that there are no active tasks, or re-trigger the
November 4 comment until the authenticated task list is checked.

After sign-in, the concrete recovery sequence is:

1. Search active/running/queued tasks for the exact task key, PR and branch. If
   found, resume that task and give it this checkpoint and the latest head; do not
   start a second implementation worker.
2. If no matching task exists, check whether a repository environment already
   exists before creating one. Use this repository and candidate branch, repository
   root as working directory, Node 22 as declared in package.json, `npm ci` plus
   `npx playwright install --with-deps chromium` as setup. No production secrets,
   customer data or service-role keys are needed for the mocked regression suite.
   Keep agent network access restricted; setup needs npm and Playwright's official
   download endpoints. Do not provision services or enable paid API fallback.
3. Resume only unfinished work: provider agreement/authorization/cancel and
   authenticated customer/admin checks. First read the latest branch and PR
   evidence so the form-retention fix is not implemented twice. Record the actual
   task URL/ID when execution starts. Environment settings above are prepared
   instructions, NOT evidence that an environment was saved.

## Reproduced defect and minimal change

`createOrder()` called `renderCheckout()` both when entering busy state and after
failure. That replaces the whole form with empty shipping inputs and resets the
selected payment method to card. It also destroys the original controls while a
request is pending. This is a confirmed storefront defect, separate from the
reported failure after accepting provider terms.

The controller now updates only the existing submit button's disabled/loading
state, label and `aria-busy`. The form and current values survive pending/error;
same-key retry, double-submit guard and identity-publication guards remain intact.
No address is newly persisted to storage. Auth-driven route redraw behavior is
outside this minimal fix.

Before fix: the new controller regression failed (8 pass / 1 fail), reporting
`Starting checkout must retain the customer's existing form controls`, `1 !== 0`.
An independent temporary JSDOM 26.1.0 probe executed the real checkout rendering
functions and `createOrder()` with controlled network responses. Old source failed
the live-form identity assertion; changed source passed live-form/address/method
retention, busy/error/unlock, duplicate submit, identical payload/key retry and
accepted-order routing. JSDOM used mocked requests, not a browser or provider.

`tests/e2e/checkout-transition.spec.mjs` adds the corresponding real-browser tests,
including product -> cart -> address -> order and invalid-address correction. It
intercepts remote requests and is included in `npm run test:e2e`.

## Checks executed in this session

| Check | Result |
| --- | --- |
| `npm run test:frontend` | 229 / 229 PASS |
| `node --test tests/frontend/order-publication-race.test.mjs` | 9 / 9 PASS after fix; new regression failed before fix |
| `npm run test:backend` | 49 / 49 PASS; includes source/SQL invariant checks, not live inventory proof |
| `npm run test:backend:deno` | 17 / 17 PASS; mocked HTTP/provider/database boundaries |
| `npm run test:contracts` | 57 / 57 PASS |
| `npm run lint`, `npm run build`, `npm run test:release` | PASS |
| `npm run check:sql` | 316 statements across 25 production migrations parsed |
| New Playwright test discovery | 2 tests found |
| Local Playwright execution | NOT_RUN: Chromium failed before test execution (`socket() failed: Operation not permitted`); official headless-shell download also returned invalid/truncated ZIPs |

The local runtime was Node 24.22.1. Node 22/browser CI status must be read from
checks on the new exact commit; do not reuse older PR success counts. The failed
Chromium launch is infrastructure failure, not a failed checkout assertion.

## Actual isolated hosted/browser evidence

Only Supabase `aohziyemqxfhpbbqpicx` was targeted. The stable existing Preview's
DOM metadata confirmed that isolated backend. The browser used the existing
deployed parent, NOT the newly fixed code; this session did not deploy it.

| Step | Evidence and limit |
| --- | --- |
| Product and cart | Actual hosted Titleist PRO V1 / A / 10 / white selected; cart amount 20,000 + 3,500 = 23,500 KRW |
| Address/order | Synthetic recipient/phone/address submitted through the actual checkout. Created `RB-4F56D704B15C4809989B1D82`, payment_ready/ready |
| Provider window | Actual Toss iframe opened from the payment button; visibly states `실제 결제가 안되는 테스트입니다` |
| Terms transition | KB selected. One required agreement checkbox, Next disabled before agreement. No agreement was accepted by the agent. The reported post-agreement stall is NOT_REPRODUCED, not fixed or disproved |
| TEST authorization/confirmation | NOT_RUN: provider agreement/user completion is still required; no paymentKey or approval timestamp |
| Provider cancellation/refund | NOT_RUN: no approved provider payment exists |
| Login and account address persistence | NOT_RUN against hosted Auth: isolated project has zero Auth users and no existing test credentials/session were available. No account was created or CAPTCHA bypassed |
| Administrator UI login | NOT_RUN: no authenticated test admin. Privileged DB readback below is not an admin-UI login test |
| Expiry/inventory restoration | REAL hosted event: creating the new order invoked the existing create-order cleanup. Previously overdue `RB-AE3828417B2546B3985E064E` received `inventory_expired` at 2026-11-06 23:32:03 UTC, releasedQty=1. Old reserved row became expired; the new order reserved one unit. Available stock was 9 before and 9 afterward, consistent with +1 release and -1 new reservation |
| Expiry repeat/unexpired guard | REAL calls of existing `expire_order_reservations_v1(25)` returned 0, then 0; current variant stock stayed 9. No timestamps/statuses were manually edited and no cron job was enabled |
| Payment replay/idempotency | Mocked Deno/frontend checks passed, including repeated confirmation/webhook behavior. Actual approved-provider replay remains NOT_RUN |

Readback after this run: 6 test orders, 5 expired reservations, 1 reserved;
auth users=0, payment_attempts=0, payment_refunds=0, non-null provider payment
keys=0, approval timestamps=0, active cron=0. The new unpaid synthetic order is
retained for continuation, reservation expires `2026-11-07T00:12:03.553419Z`;
with cron disabled, expiry needs a later checkout cleanup or an explicit authorized
expiry invocation. Prior test fixtures were not manually rewritten or deleted.

## Publication boundary

PR updates are permitted; deployments are not. `vercel.json` disables automatic
Git deployments only for this existing candidate branch using
`git.deploymentEnabled`. Other branch defaults are unchanged. Reference:
https://vercel.com/docs/project-configuration/git-configuration

No merge, production SQL/Edge change, production deployment, DNS/key rotation,
real customer order, real charge/refund or separately billed model API request was
performed. A configuration/preparation record is not a completed cloud task, and
an opened TEST window is not provider approval.
