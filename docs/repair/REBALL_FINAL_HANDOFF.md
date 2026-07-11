# REBALL Final Handoff

## 1. 최종 판정

`REVIEW`

로컬 `fix/reball-production-readiness` 브랜치에서 RELEASE BLOCKER, 서버 주문 경계, Toss 결제 adapter, UI 위계, 자동 QA를 구현했다. 취소 경쟁·재시도·민감 환불정보·webhook hardening까지 포함한 최신 전체 `npm run qa`를 2026-07-11에 exit 0으로 완료했다.

다만 다음 세 가지가 `LOCAL FINAL CANDIDATE` 판정을 막는다.

1. Docker 엔진 부재로 migration, 실제 RLS, 동시 주문, 결제 경쟁을 Postgres에서 실행하지 못했다.
2. Toss 테스트 key/MID, 외부 webhook, scheduler를 사용하는 staging end-to-end 검증을 하지 않았다.
3. `app.js`와 `styles.css`의 전면 구조 개선 및 서버 API가 없는 mutation 기능의 운영 완성이 남아 있다.

현재 결과는 “구현 코드와 로컬 mock/정적/브라우저 검증이 준비된 검토본”이다. 운영 확정본, 배포 완료, 결제 연동 완료로 표현하지 않는다.

## 2. Wave별 판정

| Wave | 판정 | 근거 |
|---|---|---|
| Wave 0 — 기준선/복구 | `PASS WITH RECOVERY NOTE` | 991개·4,013,943,553바이트 원본 안전 복사 일치, GitHub 누락 소스 복원, SHA-256 manifest 작성 |
| Wave 1 — Release Blocker | `REVIEW` | 가상 variant·PII localStorage·로컬 관리자 신뢰·인증 남용 경계를 제거/실패 폐쇄했으나 실제 Auth/CAPTCHA/RLS 미검증 |
| Wave 2 — Commerce Backend | `REVIEW` | 서버 가격·배송비, row lock 재고, snapshot, idempotency, 조회/RLS, 감사 로직 구현; 실제 Postgres 동시성/RLS 미검증 |
| Wave 3 — Toss Payments | `REVIEW` | Supabase migration과 12개 Function ACTIVE/smoke 성공; 승인·취소 경쟁, partial, stale fencing, manual-review, 암호화·재시도·rate limit 구현; 실제 Toss 및 DB 동시성 미검증 |
| Wave 4 — UI/Hierarchy | `REVIEW` | 여섯 단계 홈, 단일 h1, 버튼·focus·reduced motion·반응형 회귀 통과; 실제 기기/스크린리더와 CSS 정리 미완료 |
| Wave 5 — Refactor/QA | `REVIEW` | 핵심 로직 모듈화와 최신 전체 QA 통과; `app.js` 8,015줄·CSS 합계 14,669줄(`base.css` 11,122줄 포함)로 전면 분리 미완료 |

## 3. 수정 파일 목록

대용량 로컬 원본 자산은 수정 대상으로 일괄 추가하지 않았다. 아래는 repair 작업의 코드·설정·검사·문서 범위다.

### 앱과 build

- `.gitignore`
- `.env.example`
- `index.html`
- `app.js`
- `styles.css`
- `package.json`
- `package-lock.json`
- `playwright.config.mjs`
- `scripts/build.mjs`
- `scripts/build-check.mjs`
- `scripts/dev-server.mjs`
- `scripts/lint.mjs`
- `scripts/public-config.mjs`
- `scripts/check-edge-functions.mjs`
- `scripts/generate-source-manifest.mjs`
- `scripts/generate-source-diff-report.mjs`

### 프런트엔드 모듈

- `src/frontend/auth/admin-permissions.mjs`
- `src/frontend/auth/captcha-client.mjs`
- `src/frontend/catalog/variants.mjs`
- `src/frontend/commerce/order-client.mjs`
- `src/frontend/core/storage.mjs`
- `src/frontend/core/url-safety.mjs`
- `src/frontend/payments/toss-client.mjs`

### Supabase

- `supabase/config.toml`
- `supabase/migrations/20260710173448_production_commerce_security.sql`
- `supabase/functions/_shared/core.ts`
- `supabase/functions/_shared/http.ts`
- `supabase/functions/_shared/payments.ts`
- `supabase/functions/_shared/security.ts`
- `supabase/functions/_shared/supabase.ts`
- `supabase/functions/admin-members/index.ts`
- `supabase/functions/auth-assist/index.ts`
- `supabase/functions/create-order/index.ts`
- `supabase/functions/get-order/index.ts`
- `supabase/functions/guest-order-lookup/index.ts`
- `supabase/functions/login-with-identifier/index.ts`
- `supabase/functions/payment-cancel/index.ts`
- `supabase/functions/payment-confirm/index.ts`
- `supabase/functions/payment-webhook/index.ts`
- `supabase/functions/prepare-payment/index.ts`
- `supabase/functions/reconcile-payments/index.ts`
- `supabase/functions/signup-with-login-id/index.ts`

### 테스트

- `tests/frontend/*.test.mjs`
- `tests/backend/*.test.mjs`
- `tests/contracts/*.test.mjs`
- `tests/e2e/reball.spec.mjs`
- `tests/e2e/accessibility.spec.mjs`

### 보고서

- `docs/repair/00_BASELINE_AUDIT.md`
- `docs/repair/00_SOURCE_MANIFEST_SHA256.txt`
- `docs/repair/00_LOCAL_VS_GITHUB_DIFF.md`
- `docs/repair/01_RELEASE_BLOCKER_REPORT.md`
- `docs/repair/02_COMMERCE_BACKEND_REPORT.md`
- `docs/repair/03_TOSS_PAYMENT_REPORT.md`
- `docs/repair/04_UI_HIERARCHY_REPORT.md`
- `docs/repair/05_REFACTOR_QA_REPORT.md`
- `docs/repair/HUMAN_GATES.md`
- `docs/repair/DELETION_CANDIDATES.md`
- `docs/repair/PR_BODY_DRAFT.md`
- `docs/repair/REBALL_FINAL_HANDOFF.md`

## 4. 핵심 설계 변경

### 신뢰 경계

- DB에 존재하는 활성 variant만 선택 가능하며 임의 `stock: 99` fallback을 제거했다.
- cart에는 variant ID와 수량만 저장하고 서버가 가격·할인·배송비·총액을 다시 계산한다.
- 이름·전화·주소·주문 원본과 관리자 자격을 `localStorage`에 보관하지 않는다.
- 비회원 조회 token은 브라우저 session에만 두고 DB에는 hash만 저장한다.
- 관리자 접근은 Supabase session, 서버 역할, RLS를 기준으로 한다.
- 구현되지 않은 신뢰 상태 mutation은 UI와 runtime 양쪽에서 실패 폐쇄한다.

### 주문과 재고

- `create_order_v1()`이 variant 행을 잠그고 재고를 조건부 감소한다.
- 주문·품목·배송 snapshot, 재고 예약, 주문 event를 같은 transaction에서 기록한다.
- 상태 전이 함수를 통해 잘못된 주문 상태 변경을 거부한다.
- 결제 실패·만료·전액 취소 때 한 번만 재고를 복구하고 `DONE` 때 한 번만 소비한다.
- 회원 소유권과 비회원 token hash 조회를 분리하며 anon 주문 전체 조회는 허용하지 않는다.

### 결제

- success URL은 완료 증거가 아니라 서버 승인 입력일 뿐이다.
- 승인 전에 DB 주문번호·금액을 대조하고 공급자 응답도 다시 대조한다.
- 안정적인 idempotency key와 attempt/event ledger로 중복 승인·webhook을 흡수한다.
- `WAITING_FOR_DEPOSIT`를 `paid`와 분리한다.
- 승인·취소·webhook 경쟁과 불명확한 timeout은 lease 기반 reconciliation으로 회수한다.
- 활성 취소 중 늦은 승인 finalize가 주문을 `paid`로 덮지 않고 `cancel_requested`를 유지한다.
- 부분취소는 누적 금액과 refund ledger로 전액취소와 구분하며, 취소액이 늘지 않은 무진전 partial은 완료 처리하지 않는다.
- attempt 상태와 reconciliation lease token을 이용한 stale worker fencing으로 늦은 실패·완료 RPC가 최신 상태를 덮지 못하게 한다.
- 불명확한 취소는 같은 idempotency key로 최대 8회 재조정한 뒤 `manual_review` 감사 event와 운영 큐로 보낸다.
- 입금 완료 가상계좌 취소의 환불계좌는 `PAYMENT_REFUND_DATA_KEY`로 AES-GCM 암호화한 ciphertext로만 일시 보관하고 정상·확정 실패 뒤 제거한다.
- HTTP status와 Toss 오류 code를 함께 분류해 timeout, rate limit, 처리 중인 멱등 요청을 영구 실패로 잘못 확정하지 않는다.
- webhook은 payment key 기반 DB rate limit, 공급자 재조회, event lease/dedupe를 함께 적용한다.

### 인증·보안·UI

- 회원가입 이메일 확인 우회를 제거하고 PII를 Auth metadata 대신 RLS 보호 profile/address에 저장한다.
- 로그인·가입·계정 도움 endpoint에 rate limit, CAPTCHA hook, 공통 오류 응답을 적용한다.
- stored asset URL과 slug를 검증해 저장형 XSS 입력을 차단한다.
- 홈은 여섯 단계 구매 흐름, 페이지별 단일 `h1`, 공통 버튼 상태, focus-visible, reduced motion을 사용한다.

## 5. DB migration과 적용 전 주의사항

### Migration 목록

이번 repair가 추가한 운영 migration은 하나다.

- `supabase/migrations/20260710173448_production_commerce_security.sql`

이 migration은 기존 commerce 테이블을 보강하고 `commerce_settings`, `shipping_surcharge_zones`, `inventory_reservations`, `order_events`, private rate limit 구조, 암호화된 취소 attempt, finite reconciliation/`manual_review`, 주문/결제/취소/webhook RPC, RLS·grant/revoke·constraint·index를 추가 또는 변경한다.

### 적용 전 필수 확인

1. 대상 프로젝트의 기존 migration history와 `20260710173448` 충돌 여부를 확인한다.
2. staging DB의 schema와 데이터를 백업하고 복구 시간을 실제로 확인한다.
3. 기존 주문·결제·refund 상태가 새 CHECK/상태 전이 조건에 모두 들어오는지 조회한다.
4. `SECURITY DEFINER` 함수의 `search_path`, PUBLIC/anon/authenticated revoke, service role grant를 리뷰한다.
5. 기존 `auth.users.raw_user_meta_data`에서 PII 키를 제거하는 영향과 기존 session refresh/revoke 정책을 정한다.
6. 실데이터 복제본에서 migration dry-run 후 정상 주문, 품절, 가격 변조, 중복, 만료, 취소, RLS를 실행한다.
7. 두 transaction을 동시에 실행해 재고 음수, lock timeout, deadlock, 중복 재고 복구가 없는지 확인한다.
8. 승인·취소·webhook 순서 역전, 무진전 partial, stale worker, 8회 초과 manual-review, 가상계좌 환불 암호문 수명주기를 실제 transaction으로 검증한다.

Docker 엔진 부재로 위 실제 DB 검증은 현재 로컬에서 수행되지 않았다.

## 6. Edge Functions와 환경변수

### 함수 목록

| 함수 | 역할 | 주요 환경변수 |
|---|---|---|
| `signup-with-login-id` | 가입 및 profile/address 완성 | Supabase URL/공개키/secret, origin, rate limit, CAPTCHA |
| `login-with-identifier` | identifier 로그인 | Supabase URL/공개키/secret, origin, rate limit, CAPTCHA |
| `auth-assist` | 공통 계정 도움/메일 안내 | Supabase URL/공개키/secret, origin, rate limit, CAPTCHA |
| `admin-members` | 서버 역할 기반 회원 조회 | Supabase URL/공개키/secret |
| `create-order` | 서버 주문 생성 | Supabase URL/secret, origin, guest token secret, provider, success/fail URL |
| `get-order` | 회원/비회원 주문 조회 | Supabase URL/secret, origin |
| `guest-order-lookup` | hash token 비회원 조회 | Supabase URL/secret, origin, rate limit |
| `prepare-payment` | 서버 확정 결제창 payload | Supabase URL/secret, Toss client key, success/fail URL |
| `payment-confirm` | Toss 승인·finalize | Supabase URL/secret, Toss secret/API URL |
| `payment-cancel` | 전액/부분취소 | Supabase URL/secret, Toss secret/API URL, refund data key |
| `payment-webhook` | 공급자 상태 조회·dedupe·적용 | Supabase URL/secret, Toss secret/API URL |
| `reconcile-payments` | 지연/불명확 결제 재조회 | Supabase URL/secret, Toss secret/API URL, reconcile secret, refund data key |

### 공개 build 설정

- `PUBLIC_CONFIG_REQUIRED=true` — 운영 build에서 누락 설정 실패 폐쇄
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` 또는 `SUPABASE_ANON_KEY`
- `TOSS_CLIENT_KEY` 또는 `TOSS_PAYMENTS_CLIENT_KEY`
- `APP_ORIGIN`
- `ALLOWED_ORIGINS`
- `TOSS_SUCCESS_URL`
- `TOSS_FAIL_URL`
- `AUTH_CAPTCHA_PROVIDER`
- `AUTH_CAPTCHA_SITE_KEY`

### Edge Function secret

- `SUPABASE_SECRET_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY`
- `TOSS_SECRET_KEY` 또는 `TOSS_PAYMENTS_SECRET_KEY`
- `TOSS_MID` 또는 `TOSS_PAYMENTS_MID`
- `TOSS_PAYMENTS_API_URL`
- `PAYMENT_RECONCILE_SECRET`
- `PAYMENT_REFUND_DATA_KEY`
- `GUEST_ORDER_TOKEN_SECRET` 또는 `GUEST_ORDER_TOKEN_PEPPER`
- `AUTH_RATE_LIMIT_PEPPER` 또는 `AUTH_RATE_LIMIT_SALT`
- `AUTH_CAPTCHA_SECRET_KEY`
- `AUTH_CAPTCHA_EXPECTED_HOSTNAMES`
- `DENO_ENV=production`
- `PAYMENT_PROVIDER=toss_payments`

alias는 둘 다 중복 설정하지 말고 배포 환경에서 한 이름을 표준으로 선택한다. `ALLOW_MOCK_PAYMENTS`와 `MOCK_PAYMENT_SCENARIO`는 운영에 설정하지 않는다. 실제 secret 값은 저장소·브라우저·보고서에 기록하지 않는다.

## 7. 테스트 명령과 실제 결과

### 공식 명령

```powershell
npm ci
npm run lint
npm run build
npm run check:edge
npm run test:frontend
npm run test:backend
npm run test:backend:deno
npm run test:contracts
npm run test:e2e
npm run test:a11y
npm run qa
```

### 최종 기록 — 2026-07-11

| 검사 | 결과 |
|---|---|
| `npm run qa` | PASS, exit 0 |
| lint | PASS |
| build | PASS |
| Edge Function Deno check | 12/12 |
| 프런트 unit | 36/36 |
| 백엔드 Node | 25/25 |
| Deno provider | 14/14 |
| contract 전체 | 20/20 |
| E2E | 24/24, 40.1초 |
| a11y | 10/10, 19.9초 |
| SQL parser | 162 statements across 2 migrations |
| `npm audit` | 취약점 0 |
| secret scan | 검출 0 |
| `git diff --check` | PASS |

로컬 브라우저에서 홈·상품·로그인·관리자를 확인했고 오류 0, 최상위 `h1` 1, overflow 0, 깨진 이미지 0, 비로그인 admin shell 0을 기록했다. 로컬 Supabase 상태 확인은 Docker engine pipe 부재로 실패했다.

## 8. 남은 HUMAN_GATE

`docs/repair/HUMAN_GATES.md`의 현재 번호를 그대로 따른다.

| Gate | 남은 승인/검증 |
|---|---|
| HG-01 Supabase migration | **성공** — `qbftalhhyfcndanrcwpy`, versions `20260711055444`, `20260711055557` |
| HG-02 Edge Functions와 server secrets | **12개 ACTIVE / smoke 성공** — 내부 Edge secret 입력·실연동은 남음 |
| HG-03 Auth 이메일 확인 | SMTP, redirect URL, Confirm email, 기존 session refresh/revoke 결정 |
| HG-04 CAPTCHA | 공급자, site/secret key, hostname, Dashboard 활성화 |
| HG-05 Toss 테스트 자격증명 | 매칭 test client key, secret key, MID 입력 및 외부 호출 승인 |
| HG-06 Toss webhook·네트워크 경계 | 외부 HTTPS 등록, 이벤트, 공식 inbound IP allowlist/WAF·ACL 승인 |
| HG-07 Reconciliation·운영 큐 | scheduler 주기, reconcile secret, 알람·담당자·manual-review 절차 승인 |
| HG-08 환불계좌 암호화 key 수명주기 | `PAYMENT_REFUND_DATA_KEY` 생성·백업·접근·rotation 정책 승인 |
| HG-09 실제 결제수단 테스트 | 금액·수단·환불계좌·책임자를 정한 test-key 실거래 승인 |
| HG-10 GitHub | **성공** — commit `74b24a611d0af14043613ad41d21a0f277c34a58`, branch push, Draft PR #3 |
| HG-11 외부 배포 | **Preview READY / 재배포 중** — public config 수정 재push·redeploy 및 Production `PENDING` |
| HG-12 운영 도메인·정책 | DNS와 사업자·배송·환불 문구 변경 승인 |

## 9. 승인되어 실행 중인 외부 작업의 정확한 순서

다음 순서는 사용자 승인을 받아 실행 중이며, 각 원격 결과는 검증 전까지 `PENDING`이다. `<STAGING_PROJECT_REF>`와 secret 파일은 승인된 실제 값으로 치환하고, secret 파일은 저장소 밖에 둔다.

1. 현재 로컬 branch와 diff를 다시 고정하고 대용량 untracked 원본이 staging 대상에 포함되지 않았는지 확인한다.
2. `npm ci`와 `npm run qa`를 다시 실행해 최신 hardening을 포함한 최종 소스 전체 회귀를 고정한다. 실패 시 HG-01 이후로 진행하지 않는다.
3. Supabase Dashboard 백업/PITR 상태를 확인하고 staging schema/data snapshot을 만든다.
4. `npx supabase link --project-ref <STAGING_PROJECT_REF>` 후 `npx supabase migration list`로 history를 대조한다.
5. `npx supabase db push --linked --dry-run` 결과를 리뷰한다.
6. 기존 데이터의 상태·constraint 사전 조회와 migration SQL 보안 리뷰를 완료한다.
7. 승인된 staging에만 `npx supabase db push --linked`를 실행한다.
8. migration 후 schema, RPC execute grant, RLS policy, 기존 row count를 검증한다.
9. 저장소 밖 `.env.staging`을 사용해 `npx supabase secrets set --env-file <ABSOLUTE_PATH_TO_ENV_STAGING> --project-ref <STAGING_PROJECT_REF>`를 실행한다.
10. 12개 Edge Function을 staging에 배포한다: `signup-with-login-id`, `login-with-identifier`, `auth-assist`, `admin-members`, `create-order`, `get-order`, `guest-order-lookup`, `prepare-payment`, `payment-confirm`, `payment-webhook`, `payment-cancel`, `reconcile-payments`.
11. Auth 이메일 확인, SMTP, redirect URL, rate limit, CAPTCHA와 trusted proxy/IP 전달을 staging에서 확인한다.
12. DB 정상/품절/가격변조/중복/동시 주문/재고 복구와 회원·비회원·네 관리자 역할 RLS matrix를 실행한다.
13. Toss 테스트 key/MID를 사용해 카드 승인·거절·timeout·중복 승인·부분/전액취소·가상계좌를 실행한다.
14. `https://<STAGING_PROJECT_REF>.supabase.co/functions/v1/payment-webhook`을 Toss 테스트 MID에 등록하고 중복·지연·재전송을 검증한다.
15. HG-06 승인 범위의 공식 inbound IP allowlist/WAF·ACL을 적용하고, HG-07 승인 범위에서 scheduler가 `https://<STAGING_PROJECT_REF>.supabase.co/functions/v1/reconcile-payments`를 주기 호출하도록 설정해 `x-reball-reconcile-secret` header를 전달한다. 8회 초과와 `payment_cancel_manual_review`를 알람/담당자 큐에 연결한다.
16. staging 공개 설정으로 frontend build 후 Vercel Preview를 생성하고 실제 origin/CORS/success/fail URL, 모바일, 키보드, 이미지, 콘솔을 검수한다.
17. 위 증거를 보고서에 반영한 뒤에만 운영 migration, key 회전, webhook, scheduler, 운영 배포를 별도 승인받아 같은 순서로 반복한다.
18. 운영 smoke test와 payment reconciliation queue가 비어 있음을 확인한 뒤 트래픽을 연다.

GitHub 작업을 승인받은 경우에도 `git add -A`를 사용하지 않는다. repair 파일만 명시적으로 stage하고 diff·secret scan 후 push/PR한다.

## 10. Rollback 방법

### DB

- migration 직전의 staging/운영 snapshot 또는 PITR 지점을 필수로 확보한다.
- 이 repair에는 자동 down migration을 제공하지 않는다. 이상 발생 시 임의 `DROP`으로 되돌리지 말고 트래픽을 차단한 뒤 snapshot/PITR restore 또는 검토된 forward-fix migration을 사용한다.
- restore 전 결제 승인·취소·webhook 처리 중인 주문을 목록화하고 공급자 상태와 대조한다. DB만 과거로 돌려 공급자 결제를 잃지 않는다.

### Edge Functions와 frontend

- 새 scheduler와 webhook을 먼저 중지한다.
- 이전 검증 Edge Function 버전을 재배포하거나 Supabase의 직전 배포 버전으로 복원한다.
- Vercel은 직전 검증 deployment를 promote하고 새 deployment의 트래픽을 제거한다.
- secret 유출 또는 잘못된 대상 배포가 원인이면 Supabase service key, Toss key, reconcile secret을 즉시 회전한다.

### 결제 상태

- rollback 전에 due reconciliation과 `cancel_requested` 주문을 공급자 조회로 확정한다.
- webhook을 제거하기 전 수신 backlog와 중복 event가 모두 처리됐는지 확인한다.
- guest token secret이나 pepper 회전은 기존 비회원 조회 token을 무효화할 수 있으므로 고객 안내·전환 계획 없이 즉시 회전하지 않는다.
- `PAYMENT_REFUND_DATA_KEY`를 먼저 폐기하거나 바꾸면 열린 가상계좌 취소 ciphertext를 복호화할 수 없다. `unknown`/`manual_review`를 해소하거나 승인된 재암호화 절차를 완료한 뒤 회전한다.

## 11. GitHub push·PR·Preview 준비 상태

| 항목 | 상태 |
|---|---|
| 로컬 branch | `fix/reball-production-readiness` |
| 기준 HEAD | `748d7d2` |
| origin | `https://github.com/snsrkarhskfdk/reballlostball.git` |
| commit SHA | `74b24a611d0af14043613ad41d21a0f277c34a58` |
| push | `origin/fix/reball-production-readiness` 성공 |
| 실제 PR | `https://github.com/snsrkarhskfdk/reballlostball/pull/3` (Draft) |
| PR 본문 | `docs/repair/PR_BODY_DRAFT.md` 준비 |
| Supabase migration/Functions | versions `20260711055444`, `20260711055557` 성공; 12개 `ACTIVE`/smoke 성공 |
| Vercel Preview/staged URL | `dpl_AmmYY6SU8AkRfss6AceuaQ25PRPT` READY — `https://reballlostball-muyv3j83q-thechangcnds-projects.vercel.app` |
| Vercel 운영 URL/alias | `<PENDING_ROOT_FILL_AFTER_PROMOTE_AND_SMOKE>` |
| 실제 결제 | 미실행 |

작업 루트에는 약 4GB의 로컬 전용 자산이 untracked 상태로 보존돼 있다. 승인 후 commit을 만들 때는 파일 목록을 명시하고 `git status`, staged diff, secret scan을 확인한다.

## 12. 운영 배포 전 체크리스트

- [x] 2026-07-11 최신 로컬 `npm run qa` exit 0 증거 기록
- [ ] staging migration dry-run/적용과 기존 데이터 호환성 확인
- [ ] 동시 재고, lock timeout, 실패 복구, 중복 주문 실제 DB 통과
- [ ] 회원·비회원·역할별 JWT/RLS matrix 통과
- [ ] service role/Toss/CAPTCHA/reconcile secret이 브라우저 bundle과 Git diff에 없음
- [ ] Auth SMTP, redirect URL, email confirmation, rate limit, CAPTCHA 활성화
- [ ] trusted proxy/IP forwarding과 webhook IP 정책 검토
- [ ] Toss 테스트 승인·거절·timeout·중복·전액/부분취소 통과
- [ ] 가상계좌 발급·입금·만료·취소 상태 통과
- [ ] webhook 중복·지연·재전송과 reconciliation scheduler 통과
- [ ] 무진전 partial, stale worker fencing, 8회 초과 `manual_review` 알람/담당자 처리 통과
- [ ] 가상계좌 환불 ciphertext 생성·복호화·redaction·완료 후 제거 및 key rotation 복구 절차 통과
- [ ] 공개 origin/CORS/success/fail URL이 staging/운영 도메인과 일치
- [ ] 관리자/고객의 비활성 mutation 범위를 운영팀이 수용하거나 서버 API 완성
- [ ] 실제 기기와 스크린리더 수동 QA
- [ ] 대용량 untracked 자산 제외, 명시적 stage, secret scan, 리뷰 승인
- [ ] rollback snapshot/PITR와 직전 frontend/Edge 버전 확인
- [x] GitHub commit/push와 Supabase/Vercel 배포 명시 승인
- [x] 원격 commit/ref, Draft PR, migration/Functions 및 첫 Preview READY 증거 기록
- [ ] public config 수정 재push·Preview 재배포·smoke
- [ ] Vercel Production deployment URL/alias 성공 증거 기록
- [ ] 실제 결제 별도 승인

## 현재 외부 실행 상태

- 로컬 `fix/reball-production-readiness` 브랜치
- 내부 Edge secret, CAPTCHA, Toss test key, Auth Leaked Password Protection 미완료
- Supabase migration 2개 성공, 12개 Functions `ACTIVE`/smoke 성공
- GitHub commit/push 성공, Draft PR #3 생성
- Vercel Preview READY이나 public config 수정 재push·재배포 중
- Vercel Production — `<PENDING_ROOT_FILL_AFTER_PROMOTE_AND_SMOKE>`
- 실제 결제 미실행

다음 행동은 승인된 원격 실행 결과를 검증해 자리표시자를 실제 증거로 교체하고, 남은 운영 secret·CAPTCHA·Toss webhook·실결제 및 실제 PostgreSQL/RLS 동시성 게이트를 완료하는 것이다.
