# 02 Commerce Backend Report

## 판정

`WAVE 2 — REVIEW`

기존 주문·결제 테이블을 폐기하거나 중복 생성하지 않고 두 개의 timestamp migration과 Supabase Edge Functions로 서버 기준 commerce 경계를 구현했다. 운영 프로젝트 `qbftalhhyfcndanrcwpy`(`Reballlostball`)에 production commerce migration과 FK index 후속 migration을 적용했고 핵심 RPC/table 존재를 확인했다. 12개 함수도 모두 `ACTIVE`다. 그러나 실제 transaction 경쟁, 전체 JWT/RLS matrix, Toss/CAPTCHA secret을 사용한 정상 통합 흐름은 아직 실행하지 않았으므로 운영 안전성을 확정하지 않는다.

## 변경 범위

### Migration

- `supabase/migrations/20260711055444_production_commerce_security.sql`
- `supabase/migrations/20260711055557_commerce_foreign_key_indexes.sql`

기존 `brands`, `products`, `product_variants`, `orders`, `order_items`, `shipping_snapshots`, `payments`, `payment_attempts`, `payment_events`, `payment_refunds`, `user_roles` 구조를 보강한다. 새로 필요한 운영 구조만 추가했다.

| 구조 | 목적 |
|---|---|
| `commerce_settings` | 무료배송 기준, 배송비 등 서버 계산 설정 |
| `shipping_surcharge_zones` | 지역별 배송 추가비 계산 |
| `inventory_reservations` | 주문별 재고 예약·소비·해제 상태와 만료 시각 |
| `order_events` | 생성, 결제, 취소, 재고 복구 등 감사 이벤트 |
| `private.edge_rate_limits` | 인증·주문·결제 endpoint의 서버 rate limit |
| payment reconciliation lease | payment별 lease token/만료, 다음 실행 시각, 재시도 횟수, 마지막 오류 |
| cancellation attempt 보호 필드 | 취소 재시도 횟수, `manual_review`, 일회용 민감 요청 암호문 |

### Edge Functions

| 함수 | 역할 |
|---|---|
| `create-order` | 입력 검증, 회원 확인, 비회원 토큰 발급·해시, 주문 생성 RPC 호출 |
| `get-order` | 회원 자기 주문 또는 안전한 비회원 자격으로 주문 payload 조회 |
| `guest-order-lookup` | 일반 anon select 없이 주문번호+조회 토큰 해시로 조회 |
| `prepare-payment` | `payment_ready` 주문의 서버 확정 주문번호·금액·이름 반환 |
| `payment-confirm` | 결제 승인 claim/호출/finalize/fail |
| `payment-cancel` | 전액·부분 취소 claim/호출/finalize/fail |
| `payment-webhook` | 검증된 공급자 상태를 dedupe 후 적용 |
| `reconcile-payments` | 알 수 없거나 지연된 공급자 상태 재조회 |

공통 검증, HTTP 오류, 결제 adapter, Supabase service RPC는 `supabase/functions/_shared/**`로 분리했다.

Supabase service helper는 신형 opaque `sb_secret_*` key를 `apikey` header로만 보내고 legacy JWT `service_role` key에만 Bearer header를 사용한다. 따라서 신형 key를 JWT로 파싱해 RPC와 Auth Admin 호출이 거부되는 배포 호환 결함을 차단했다. `admin-members`는 gateway의 legacy JWT 검사 대신 handler 내부에서 실제 session과 `owner_admin`/`cs_manager` 역할을 다시 검증한다.

## 서버 기준 주문 생성

1. 브라우저는 품목별 `variantId`, `quantity`와 배송/결제 방식만 보낸다. 단가·할인·배송비·총액은 신뢰하지 않는다.
2. `create-order`가 입력 길이·형식·수량·origin·rate limit을 검사한다.
3. `create_order_v1()`이 variant 행을 `FOR UPDATE`로 잠근다.
4. 활성 상품/variant, 가격, 요청 재고를 DB 값으로 확인하고 할인·배송비·지역 추가비를 서버에서 계산한다.
5. `stock_qty >= qty` 조건으로 원자 감소시키고 0 미만 재고를 CHECK constraint로 막는다.
6. 같은 idempotency key와 같은 request hash는 기존 결과를 반환하고, 같은 key의 다른 payload는 거부한다.
7. 주문, 품목 snapshot, 배송 snapshot, 결제 row, 재고 예약, 주문 이벤트를 같은 DB transaction에서 기록한다.

## 상태와 재고 수명주기

지원 주문 상태에는 `draft`, `payment_ready`, `payment_auth_started`, `waiting_for_deposit`, `paid`, `payment_failed`, `cancel_requested`, `partially_canceled`, `canceled`, `refunded`, `shipping_ready`, `shipped`, `delivered`가 포함된다. `private.valid_order_transition()`이 허용 전이를 명시하고 RPC가 잘못된 전이를 거부한다.

- 생성: 재고를 `reserved`로 기록하고 결제 가능 만료 시각을 부여한다.
- 결제 승인 시작: 승인 결과가 불명확한 동안 lease를 연장해 단순 시간 만료로 재고를 풀지 않는다.
- `DONE`: 예약을 한 번만 `consumed`로 전환한다.
- 확정 실패·주문 만료·전액 취소: 한 번만 재고를 복구한다.
- 가상계좌 대기와 승인 중 상태: 공급자 reconciliation 없이 시간만으로 해제하지 않는다.
- 부분 취소: 누적 취소 금액과 refund ledger를 보존하며 남은 주문을 전액 취소로 오인하지 않는다.

## 취소·웹훅·reconciliation 경쟁조건

- 승인 finalize와 webhook 적용은 주문·payment·attempt를 잠근 뒤 활성 취소를 다시 검사한다. `started`, `in_progress`, `unknown` 취소가 있으면 늦은 `DONE`/`WAITING_FOR_DEPOSIT` 결과를 기록하되 주문 fulfillment는 `cancel_requested`에 유지한다.
- 가상계좌 입금 `DONE`이 먼저 반영된 뒤 늦은 confirmation 또는 webhook의 `WAITING_FOR_DEPOSIT`/`IN_PROGRESS`/`READY`가 도착해도 payment를 낮은 상태로 되돌리지 않는다. 부분취소·전액취소 상태도 이전 provider 상태로 역행하지 않는다.
- `manual_review` 취소도 blocking 상태로 취급한다. 자동 재시도가 끝났다는 이유로 주문을 `paid` 또는 배송 상태로 되돌리지 않는다.
- 취소가 먼저 확정되면 진행 중 confirm attempt를 `superseded_by_cancellation`으로 종결한다. 늦은 승인 실패나 webhook이 취소·부분취소·환불 상태를 낮은 상태로 덮지 않는다.
- 전액 잔액 취소 요청에 공급자가 `PARTIAL_CANCELED`를 반환하더라도 누적 취소액이 해당 attempt의 `canceledAmountBefore`보다 늘지 않은 무진전 결과는 성공으로 닫지 않는다. 주문을 `cancel_requested`에 남기고 reconciliation을 계속한다.
- 실제 누적 취소액이 기준값보다 늘어난 attempt만 `succeeded` 또는 `partially_succeeded`로 종결한다. 부분취소 뒤 추가 취소가 가능하며, 추가 취소가 확정 실패하면 payment의 `partial_canceled`를 주문 `partially_canceled`로 복원한다.
- 전액 취소 API의 `CANCELED` 응답보다 부분취소 webhook이 먼저 DB에 반영되어 현재 잔액이 줄어든 경우에도 전액 취소 finalize가 거절되지 않는다. finalizer는 변동된 현재 잔액이 아니라 claim 시점의 `canceledAmountBefore + cancelAmount` 스냅샷과 입력을 정확히 대조한 뒤 누적 결과를 확정한다.
- reconciliation claim은 `FOR UPDATE SKIP LOCKED`로 job을 임대하고 UUID lease token을 발급한다. 완료 RPC는 동일 payment ID와 token이 일치할 때만 schedule을 변경하며, 만료된 worker의 token이면 `stale reconciliation lease`로 거부한다.
- 취소 실패/수동검토 RPC도 attempt 행을 다시 잠그고 여전히 처리 가능한 상태인지 확인한다. 이미 다른 worker가 종결한 attempt에는 `stale`만 반환해 후발 worker가 상태를 되돌리지 못하게 한다.
- 불명확한 취소는 지수형 backoff로 최대 8회 재조정한다. 이후 `manual_review`와 `payment_cancel_manual_review` event를 만들고 fulfillment를 계속 차단한다. 실제 알람·담당자 큐 연결은 HG-07 운영 절차다.
- 입금 완료 가상계좌 취소에 필요한 환불 계좌는 평문 JSON/event에 넣지 않는다. Edge는 AES-GCM 암호문만 보관하고 HMAC fingerprint를 request hash 계산에 사용하며, 필요한 reconciliation worker만 복호화한다. provider safe payload에서는 계좌·예금주 필드를 redaction한다.
- webhook은 가상계좌 secret DB 조회와 provider 재조회보다 먼저 공통 DB limiter로 IP와 payment identity subject를 각각 제한한다. 현재 코드 한도는 subject 기준 분당 180회, 초과 시 5분 차단이며 운영 WAF/ACL은 HG-06에서 별도로 확정한다.
- mock 결제, CAPTCHA test mode, HTTP payment return URL은 `DENO_ENV`가 명시적인 비운영 값일 때만 허용한다. `DENO_ENV` 누락을 개발 환경으로 간주하지 않는다.
- provider adapter는 HTTP `408`/`425`/`429`/`5xx`와 알려진 처리 중·내부오류·중복 계열 code를 non-definitive로 분류해 idempotent reconciliation으로 보낸다. 영구 4xx와 `ABORTED`/`EXPIRED`만 definitive/terminal 실패로 닫는다.

## Snapshot과 조회

- `order_items`는 상품명, variant label, 단가, 수량, line total snapshot을 가진다.
- `shipping_snapshots`는 주문 시점 배송지와 배송메모를 분리 보관한다.
- `orders`/`payments`는 상품 가격이 바뀌어도 변하지 않는 소계, 할인, 배송비, 총액, 결제 상태를 가진다.
- `private.order_payload()`가 UI에 필요한 주문·품목·배송 snapshot을 일관된 payload로 조립한다.
- `private.payment_operation_payload()`는 취소 운영에 필요한 결제 상태와 금액만 반환하고 주소·상품 목록을 제외한다. `payments_manager` 취소 RPC는 이 redacted payload만 사용한다.
- 회원 주문은 `auth.uid()`와 연결하고 자기 주문만 조회한다.
- 비회원은 원문 토큰을 DB에 저장하지 않고 hash만 저장한다. orders에 anon SELECT 정책을 만들지 않았다.

## 권한과 감사

- 주문·결제·재고의 신뢰 상태는 anon/authenticated 직접 INSERT/UPDATE/DELETE를 회수했다.
- 공개 `SECURITY DEFINER` RPC는 PUBLIC/anon/authenticated 실행 권한을 먼저 revoke하고 service role에만 grant한다.
- 회원 자기 주문 정책과 관리자 역할별 정책을 분리했다.
- `payments_manager`는 배송 PII가 포함된 orders 기본 테이블과 full-order RPC를 사용하지 못하며, 취소 응답에서도 redacted payment payload만 받는다.
- 카탈로그 직접 쓰기도 회수해, 미구현 관리자 UI가 브라우저에서 신뢰 DB를 변경하지 못한다.
- 생성, 상태 변경, 재고 예약·소비·복구, 결제·취소 결과를 `order_events` 및 결제 event/attempt/refund ledger에 남긴다.

## 원격 Supabase 검증 결과

- migration `20260711055444 production_commerce_security`: 적용 성공
- migration `20260711055557 commerce_foreign_key_indexes`: 적용 성공
- 핵심 commerce RPC 및 신규 table: 존재 확인 `true`
- 12개 Edge Function: 모두 `ACTIVE`, `verify_jwt=false`
- OPTIONS/CORS 및 필수 설정 누락 fail-closed smoke: 성공
- 로그인: 내부 보안 secret 누락으로 예상된 `503 SECURITY_CONFIG_MISSING`
- reconciliation: scheduler secret 누락으로 예상된 `503 RECONCILE_NOT_CONFIGURED`

Database advisors가 처음 보고한 신규 foreign key 미인덱스 3개는 `20260711055557`에서 모두 보강했다. 남은 Security WARN은 Auth의 leaked password protection 비활성화다. `private.edge_rate_limits`의 no-policy INFO는 비공개 schema/service-role 전용 설계이므로 anon/authenticated 노출 정책을 추가하지 않는다.

## 실제 로컬 QA 결과

최종 경쟁조건 보강까지 포함한 작업트리에서 전체 QA를 다시 실행했다.

| 검사 | 결과 | 성격 |
|---|---|---|
| `npm run qa` | PASS, exit 0 | lint, build, Edge, unit, 전체 contract, E2E, a11y 순차 실행 |
| lint / build | PASS / PASS | 정적 검사와 배포 산출물 생성 |
| Edge Function Deno check | PASS, 12/12 | 배포 대상 Edge 함수 type/check |
| frontend unit | PASS, 36/36 | 최소 주문 payload, exact variant, 비회원 server lookup 포함 |
| backend Node | PASS, 25/25 | 재고·RLS·권한 redaction·key header·상태 역행·승인/취소/webhook 경쟁·manual review 불변조건 |
| Deno provider/handler 사례 | PASS, 14/14 | mock 흐름, 상태 disposition, provider 오류, 암호화, 신형/legacy Supabase key와 Auth·주문 handler 경계 |
| contract 전체 | PASS, 20/20 | frontend/backend migration·주문·RLS·결제·인증·env schema 계약 |
| E2E / a11y | PASS 24/24 (40.1초) / PASS 10/10 (19.9초) | 브라우저 회귀와 접근성 자동 검사 |
| SQL parser | PASS, 162 statements / 2 files | production commerce와 FK index migration 문법 parse |
| `npm audit` / secret scan | 취약점 0 / 검출 0 | 의존성과 credential pattern 검사 |
| `git diff --check` | PASS | 최종 diff whitespace/error marker 검사 |

확인된 정적 불변조건에는 row lock, 조건부 재고 감소, 1회 복구, 상태 전이, hash-only guest token, anon 주문 정책 부재, service-only RPC, 결제/웹훅 멱등화, blocking cancellation, stale lease fencing이 포함된다.

### 아직 검증하지 못한 항목

- 실제 Postgres 두 transaction을 동시에 실행한 재고 경쟁과 deadlock/lock timeout
- 적용된 migration 이후 기존 데이터의 실제 주문·결제 동작과 enum/constraint 장기 호환성
- 실제 JWT를 사용한 회원 자기 주문·타 회원 주문·네 관리자 역할 RLS
- hosted Supabase에서 신형 `sb_secret_*` header 처리와 `admin-members` handler 자체 session/role 검증
- Edge Function과 DB RPC를 함께 실행하는 정상/품절/가격변조/중복/실패복구 통합 시나리오
- 실제 transaction에서 승인·취소·webhook 순서를 뒤집은 경쟁과 lease 만료 후 stale worker 재현
- scheduler 장애, 8회 초과 `manual_review`, 운영자 해소 절차와 알람 전달
- 가상계좌 환불 암호문 key rotation 및 열린 manual-review attempt 복호화/재암호화
- 운영 데이터 규모에서 쿼리 계획과 인덱스 성능

따라서 “동시 주문에서 재고 음수 불가”는 DB 설계와 정적 검사로 방어했지만 실제 경쟁 테스트가 통과했다고 주장하지 않는다.

## HUMAN_GATE와 적용 후 주의사항

1. 프로젝트 `qbftalhhyfcndanrcwpy`(`Reballlostball`)의 적용된 두 migration과 백업/PITR 상태를 유지한다.
2. 기존 주문·결제 상태와 constraint 적용 결과를 실제 데이터로 검사한다.
3. 누락된 내부/외부 secret은 Edge Function에만 입력하고 브라우저 bundle에 없는지 다시 검사한다.
4. 정상 주문, 가격 변조, 없는/품절 variant, 동시 주문, 중복 생성, 만료/실패 재고 복구, RLS를 실행한다.
5. scheduler, 알람, `manual_review` 운영자 큐를 HG-07 절차에 맞춰 검증한다.
6. 환불정보 key 백업·접근권한·rotation과 열린 암호문 처리 절차를 HG-08에 맞춰 검증한다.
7. 실제 통합 결과 확인 뒤에만 결제·인증 트래픽 활성화와 운영 완료 판정을 요청한다.

DB migration과 함수 배포는 완료됐다. 남은 webhook/queue/암호화 secret 활성화와 실제 결제는 `docs/repair/HUMAN_GATES.md`의 HG-05~HG-09 범위에서 검증한다.

## 결론

commerce backend의 필요한 코드 경계와 방어 로직은 준비됐지만 실제 Supabase transaction/RLS 통합 증거가 없다. Wave 2는 `REVIEW`다.
