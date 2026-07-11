# 03 Toss Payment Report

## 판정

`WAVE 3 — REVIEW`

Toss Payments 테스트 연동을 위한 브라우저/서버 adapter, 승인·취소·웹훅·가상계좌·reconciliation·멱등화 코드를 구현했고 mock provider 검사는 통과했다. 운영 Supabase 프로젝트 `qbftalhhyfcndanrcwpy`(`Reballlostball`)에는 두 migration과 12개 Edge Function을 배포했고, 함수는 모두 `ACTIVE`, `verify_jwt=false` 상태다. OPTIONS/CORS와 설정 누락 실패 폐쇄 smoke도 통과했다. 다만 Toss/CAPTCHA 및 일부 내부 secret이 없어 실제 테스트 결제·웹훅·정상 인증은 수행하지 않았으므로 결제 연동 완료로 판정하지 않는다.

## 공식 문서 기준

구현 시 Toss Payments의 [결제 흐름](https://docs.tosspayments.com/guides/v2/get-started/payment-flow), [API 인증과 멱등성](https://docs.tosspayments.com/reference/using-api/authorization), [웹훅](https://docs.tosspayments.com/guides/v2/webhook), [결제위젯 SDK v2](https://docs.tosspayments.com/sdk/v2/js) 문서를 기준으로 서버 승인과 비동기 상태를 분리했다.

## 환경변수와 secret 경계

`.env.example`에는 변수명만 있고 값은 모두 비어 있다.

| 위치 | 변수 | 노출 정책 |
|---|---|---|
| 브라우저 | `TOSS_CLIENT_KEY`/`TOSS_PAYMENTS_CLIENT_KEY`, `TOSS_SUCCESS_URL`, `TOSS_FAIL_URL` | build 시 meta에 주입 가능한 공개 설정 |
| Edge Function | `TOSS_SECRET_KEY`/`TOSS_PAYMENTS_SECRET_KEY`, `TOSS_MID`, `TOSS_PAYMENTS_API_URL` | 서버 secret, 브라우저 금지 |
| Webhook/reconcile | `TOSS_WEBHOOK_VERIFY_BY_API`, `PAYMENT_RECONCILE_SECRET` | 서버 전용 |
| 가상계좌 환불정보 | `PAYMENT_REFUND_DATA_KEY` | 32자 이상 고엔트로피 서버 전용 key, 수명주기 관리 필요 |
| 로컬 mock | `PAYMENT_PROVIDER`, `MOCK_PAYMENT_SCENARIO`, `DENO_ENV` | 명시적인 development/dev/local/test에서만 허용; 누락·production은 거부 |

`scripts/public-config.mjs`는 Supabase/Toss/CAPTCHA 공개 설정의 짝과 URL 형식을 build 전에 검사한다. 운영에서 `PUBLIC_CONFIG_REQUIRED=true`로 설정하면 누락된 공개 설정도 실패 폐쇄할 수 있다. 브라우저 소스에는 Toss secret 또는 service-role secret 이름·값을 넣지 않았다.

Supabase server 호출은 신형 `sb_secret_*` key를 `apikey` header로만 보내며, legacy JWT service-role key에만 Bearer header를 추가한다. opaque secret key를 Bearer JWT처럼 보내 RPC/Auth Admin이 401로 중단되는 경로를 제거했다. 결제 mock과 CAPTCHA test mode, HTTP success/fail URL은 `DENO_ENV`가 명시적인 비운영 값일 때만 열린다.

## 구현한 결제 흐름

### 1. 준비

- 브라우저는 `prepare-payment`에 `orderId`만 보낸다.
- 서버는 회원 또는 비회원 조회 토큰으로 주문 접근 권한을 확인한다.
- 주문이 `payment_ready`이고 만료되지 않았을 때만 서버 확정 `orderId`, `orderName`, `amount`, 결제창 공개 설정을 반환한다.
- 클라이언트가 보낸 금액과 주문명을 사용하지 않는다.

### 2. 브라우저 인증과 복귀

- `src/frontend/payments/toss-client.mjs`가 Toss SDK v2 결제창을 호출한다.
- 중복 클릭을 막기 위해 준비/처리 상태를 UI에 표시한다.
- success URL의 `paymentKey`, `orderId`, `amount`는 완료 표시가 아니라 `payment-confirm` 요청 입력으로만 사용한다.
- 서버 승인 응답 전에는 `paid`로 표시하지 않는다.
- 확인 후 URL에서 `paymentKey`를 제거하고 서버 주문 payload로 주문 화면을 그린다.

### 3. 서버 승인

1. origin, method, 입력 형식, 주문 접근, rate limit을 검사한다.
2. `claim_payment_confirmation_v1()`이 주문·결제·attempt를 잠그고 안정적인 idempotency key와 request hash를 확인한다.
3. DB 주문 총액과 callback 금액이 다르면 Toss 승인 호출 전에 거부한다.
4. server secret의 Basic 인증과 `Idempotency-Key`로 Toss `/v1/payments/confirm`을 호출한다.
5. 응답의 payment key, order ID, amount를 다시 대조한다.
6. `DONE`만 `paid`로, `WAITING_FOR_DEPOSIT`는 별도 대기 상태로 finalize한다.
7. provider 결과는 `DONE`/`WAITING_FOR_DEPOSIT` 성공, `ABORTED`/`EXPIRED` terminal failure, 그 외 nonterminal 상태는 reconciliation으로 분류한다.
8. HTTP `408`/`425`/`429`/`5xx`와 알려진 처리 중·내부오류·중복 계열 provider code는 non-definitive로 분류해 재시도한다. 그 밖의 영구 4xx만 definitive 실패로 종결한다.
9. 가상계좌 `DONE` webhook이 confirmation 응답보다 먼저 커밋된 경우, 뒤늦은 `WAITING_FOR_DEPOSIT` 응답은 attempt만 안전하게 회수하고 payment/order를 대기 상태로 낮추지 않는다.

### 4. 웹훅과 비동기 상태

- `PAYMENT_STATUS_CHANGED`, `DEPOSIT_CALLBACK`, `CANCEL_STATUS_CHANGED`만 처리한다.
- payment identity 기준 분당 180회, 5분 차단 window의 서버 rate limit을 적용한다. 공통 limiter가 요청 IP와 subject hash를 각각 소비하며, 가상계좌 secret 조회와 Toss provider 재조회보다 먼저 실행된다.
- 일반 결제 웹훅은 server secret으로 Toss payment를 다시 조회한 authoritative 객체를 사용한다.
- 가상계좌 callback은 주문에 저장한 secret hash를 검증한다.
- transmission ID 또는 안전한 payload fingerprint로 dedupe key를 만들고 DB에 event를 먼저 claim한다.
- 이미 처리된 event는 무해하게 반환하고, 다른 worker가 처리 중이면 503으로 재시도를 유도해 crash 후 lease 회수가 가능하게 한다.
- `WAITING_FOR_DEPOSIT`, `DONE`, `CANCELED`, `PARTIAL_CANCELED`, `ABORTED`, `EXPIRED` 등을 명시적으로 상태 전이한다.

### 5. 취소, 부분취소, 경쟁 복구

- 취소 요청도 안정적인 attempt key와 request hash로 claim한다.
- 원 결제금액, 기존 누적 취소금액, 이번 취소금액을 분리해 Toss 요청과 refund ledger에 기록한다.
- 전액 잔액 취소 endpoint에서 provider가 목표 누적액에 못 미치는 `PARTIAL_CANCELED`를 반환하면 성공으로 예약하지 않고 non-definitive reconciliation으로 보낸다.
- webhook의 누적 취소액이 attempt 시작 시점 `canceledAmountBefore`보다 늘지 않은 무진전 `PARTIAL_CANCELED`는 attempt를 닫지 않고 `cancel_requested` blocker를 유지한다.
- 실제 진전이 있는 부분취소만 `partially_succeeded`/`partially_canceled`로 남기고 누적 취소금액 이상으로 중복 반영하지 않는다.
- 웹훅이 API 응답보다 먼저 도착한 경우에도 이미 반영된 누적 취소 결과를 성공으로 회수한다.
- 부분취소 webhook이 전액 취소 API의 `CANCELED` 응답보다 먼저 반영돼 현재 잔액이 줄어도 full-cancel finalizer는 실패하지 않는다. claim에 저장한 최초 누적액과 요청 취소액의 합을 검증해 최종 누적 취소를 확정한다.
- 승인 finalize와 활성 취소가 경쟁하면 주문을 `cancel_requested`에 유지하고 2분 reconciliation을 예약한다. 원격 취소 성공 뒤 늦은 승인 finalize가 로컬 주문을 단순 `paid`로 덮지 않도록 했다.
- 취소 완료는 진행 중 confirm attempt를 `superseded_by_cancellation`으로 닫고, late confirm/webhook이 취소·환불 상태를 downgrade하지 못하게 한다.
- `reconcile-payments`는 UUID lease token으로 대상 payment를 claim하고 provider 상태를 재조회한다. 완료 때 token 일치를 강제해 lease가 만료된 stale worker를 차단한다. 호출 자체는 `PAYMENT_RECONCILE_SECRET`으로 보호한다.
- 불명확한 취소는 backoff로 최대 8회 재시도한 뒤 `manual_review`로 전환한다. 이 상태도 fulfillment blocker이며 자동 성공/실패로 간주하지 않는다.
- `payments_manager`가 취소를 수행할 때 응답에는 결제 상태·금액만 포함하고 배송 주소·상품 목록은 제외한다. 회원/CS/owner용 full-order 조회 권한을 우회하지 않는다.

### 6. 입금 완료 가상계좌 환불정보

- 은행 코드, 숫자 계좌번호, 예금주를 서버에서 정규화·검증한다. 입금 완료 또는 부분취소된 가상계좌 취소에는 환불 계좌가 없으면 실패 폐쇄한다.
- `PAYMENT_REFUND_DATA_KEY`로 AES-GCM 암호화한 값만 `payment_attempts.sensitive_request_ciphertext`에 보관한다.
- 같은 key의 HMAC-SHA256 fingerprint를 취소 request hash에 포함해 평문을 저장하지 않고도 같은 idempotency key의 계좌 변경을 감지한다.
- provider 요청 직전 또는 reconciliation 재시도 시에만 암호문을 복호화한다. 취소 확정 성공 또는 definitive 실패 시에는 더 이상 필요 없는 암호문을 제거한다. `manual_review`에 남은 암호문은 운영자가 해소할 때까지 key 수명주기 대상이다.
- provider safe payload는 `refundReceiveAccount`, `accountNumber`, `holderName` 등 민감 필드를 재귀적으로 redaction해 event, response, 로그에 평문 계좌가 남지 않게 한다.
- key 재생성/rotation은 열린 `unknown`·`manual_review` 취소를 복호화 불가능하게 만들 수 있으므로 HG-08의 백업·권한·rotation 절차가 필요하다.

## 원격 배포·smoke 결과

| 검사 | 결과 |
|---|---|
| Supabase migrations | `20260711055444`, `20260711055557` 적용 성공 |
| 결제 RPC/table | 핵심 객체 존재 확인 `true` |
| Edge Functions | 12/12 `ACTIVE`, 모두 `verify_jwt=false` |
| OPTIONS/CORS | PASS |
| 로그인 설정 누락 | EXPECTED 503 `SECURITY_CONFIG_MISSING` |
| reconciliation 설정 누락 | EXPECTED 503 `RECONCILE_NOT_CONFIGURED` |

이는 배포 구조와 실패 폐쇄 경계를 확인한 smoke다. Toss secret/client key/MID, CAPTCHA key, reconcile secret을 사용한 정상 provider 호출 증거는 아니다.

Database advisors의 신규 foreign key 미인덱스 3개는 후속 migration `20260711055557`로 해소했다. 남은 Security WARN은 leaked password protection 비활성화이며, `private.edge_rate_limits` no-policy INFO는 비공개 schema/service-role 전용 설계에 따른 의도된 결과다.

## 실제 로컬 QA 결과

최종 결제 경쟁조건 보강까지 포함한 작업트리에서 전체 QA를 다시 실행했다.

| 검사 | 결과 | 검증 범위 |
|---|---|---|
| `npm run qa` | PASS, exit 0 | lint, build, Edge, unit, 전체 contract, E2E, a11y 순차 실행 |
| lint / build | PASS / PASS | 최신 소스 정적 검사와 배포 산출물 생성 |
| Edge Function Deno check | PASS, 12/12 | 결제 포함 전체 Edge 함수 check |
| frontend unit | PASS, 36/36 | prepare/confirm 클라이언트와 주문 mapper 포함 |
| backend Node | PASS, 25/25 | 승인/취소/webhook 경합, 상태 단조성, webhook-first full cancel, 권한 redaction, fail-closed 구성 |
| Deno provider/handler 사례 | PASS, 14/14 | mock·상태 disposition·retry·AES-GCM/HMAC/redaction, 신형/legacy Supabase key와 실제 handler 경계 |
| contract 전체 | PASS, 20/20 | frontend/backend 결제 준비·승인, webhook 검증·dedupe, env schema 계약 |
| E2E | PASS, 24/24 (40.1초) | 결제 success query의 server confirm과 URL 정리 포함 |
| a11y | PASS, 10/10 (19.9초) | 지정 핵심 경로 자동 접근성 검사 |
| SQL parser | PASS, 162 statements / 2 files | 결제 RPC와 FK index migration parse |
| `npm audit` / secret scan | 취약점 0 / 검출 0 | 의존성과 credential pattern 검사 |
| `git diff --check` | PASS | 최종 diff whitespace/error marker 검사 |

결제 동작 검사는 mock 및 로컬 endpoint interception/정적 불변조건을 사용했고, 원격에서는 함수 활성·CORS·실패 폐쇄만 확인했다. Toss sandbox 서버 요청이나 실제 결제수단을 사용한 결과가 아니다.

## 미검증/REVIEW 항목

- 실제 Toss 테스트 client/secret key와 MID 조합
- 카드·계좌이체·가상계좌·간편결제별 SDK 파라미터 및 상점 활성 상태
- Toss 테스트 API에서 승인 성공·거절·timeout·중복 idempotency key
- 외부 HTTPS webhook 등록, 전송 ID, 지연·중복·재전송
- 가상계좌 발급→입금 callback→취소의 end-to-end 상태
- 실제 Postgres에서 승인/취소/webhook/reconcile 동시 실행 경쟁
- 스케줄러가 `reconcile-payments`를 secret과 함께 호출하는 운영 구성
- 8회 재시도 초과 `manual_review`의 알람·담당자 큐·해소 절차
- 환불 계좌 암호화 key의 백업·접근통제·rotation과 열린 암호문 처리
- 공식 inbound IP allowlist/WAF·ACL과 webhook rate limit을 함께 적용한 재전송 검증

## HUMAN_GATE

1. HG-02: 12개 함수 배포는 완료됐다. 누락된 server secret 입력과 정상 호출 검증을 완료한다.
2. HG-05: 매칭되는 Toss 테스트 client key, secret key, MID를 승인된 server secret에 입력한다. 저장소에는 넣지 않는다.
3. HG-06: staging 외부 HTTPS webhook, 공식 inbound IP allowlist/WAF·ACL, 이벤트 등록과 재전송 정책을 승인한다.
4. HG-07: `PAYMENT_RECONCILE_SECRET`, scheduler 주기, 알람, `manual_review` 담당자 절차를 확정한다.
5. HG-08: `PAYMENT_REFUND_DATA_KEY`의 생성·백업·접근권한·rotation 정책을 확정한다.
6. HG-09: 테스트 결제·취소·가상계좌 환불도 사용자 명시 승인 후 최소 금액/test key로만 수행한다. 라이브 key와 실제 결제는 계속 금지한다.

함수와 DB migration 배포는 완료했지만 Toss/CAPTCHA secret 입력, webhook 등록, scheduler 정상 호출, 실제 공급자 호출은 수행하지 않았다.

## 결론

결제 코드의 신뢰 경계와 실패 복구 경로는 구현·mock 검증됐지만 실제 Toss/Supabase 조합의 증거가 없다. Wave 3은 `REVIEW`다.
