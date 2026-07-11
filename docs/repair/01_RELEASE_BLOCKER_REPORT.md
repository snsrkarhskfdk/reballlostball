# 01 Release Blocker Report

## 판정

`WAVE 1 — REVIEW`

운영 차단 원인이었던 가상 variant, 브라우저 주문 원본, 로컬 관리자 신뢰, 인증 endpoint 무방비 상태는 코드에서 제거하거나 실패 폐쇄(fail-closed) 구조로 바꿨다. 운영 Supabase 프로젝트 `qbftalhhyfcndanrcwpy`(`Reballlostball`)에는 `20260711055444_production_commerce_security`와 `20260711055557_commerce_foreign_key_indexes` migration을 적용했고, 핵심 RPC/table 존재를 확인했다. 12개 Edge Function도 모두 `ACTIVE`, `verify_jwt=false` 상태이며 OPTIONS/CORS와 설정 누락 실패 폐쇄 smoke가 통과했다. 다만 Toss·CAPTCHA 및 일부 내부 secret이 아직 없어 실제 로그인·결제 실연동은 완료되지 않았으므로 `PASS` 또는 운영 완료로 판정하지 않는다.

## 구현 결과

### 1. 상품 variant와 재고

| 요구사항 | 구현 | 근거 |
|---|---|---|
| 가상 재고·가격 fallback 제거 | DB에서 온 exact variant만 주문 가능 목록에 포함한다. `stock: 99`, 무조건 `available: true`, 임의 가격 계산 경로를 주문 근거로 사용하지 않는다. | `src/frontend/catalog/variants.mjs`, `app.js` |
| 옵션 선택 제한 | ID, 활성 상태, 가격 양수, 재고 양수를 모두 만족하는 variant만 선택 가능하다. 존재하지 않는 모델·등급·구성·색상 조합은 `null`로 실패한다. | `isOrderableVariant()`, `findExactOrderableVariant()`, `isVariantOptionSelectable()` |
| 수량 상한 | 선택된 exact variant의 실제 재고보다 큰 수량을 거부한다. | `assertOrderableQuantity()` |
| 탐색용 상품 분리 | fallback 상품 정보는 화면 탐색에만 남고 `dbVariants`가 없으면 구매 가능 variant를 만들지 않는다. | `orderableVariants()` |
| 서버 기준 주문 연결 | 브라우저 주문 품목은 `variantId`, `quantity`만 서버로 보낸다. | `src/frontend/commerce/order-client.mjs`, `supabase/functions/create-order/index.ts` |

### 2. 주문과 개인정보

| 변경 | 결과 |
|---|---|
| 브라우저 주문 원본 제거 | `reball.ephemeralOrders`를 주문 원본으로 사용하던 경로를 제거했다. 주문 생성·조회는 Edge Function을 호출한다. |
| 민감한 legacy 저장값 정리 | 시작 시 주문, 관리자 자격증명, 관리자 고객, 가입 이메일 등 기존 민감 key를 `localStorage`에서 삭제한다. |
| 장바구니 최소화 | `sessionStorage`에는 `variantId`와 `quantity`만 저장한다. 이름, 휴대폰, 주소, 배송메모, 가격·총액은 저장하지 않는다. |
| 비회원 비밀번호 제거 | 휴대폰 마지막 네 자리로 주문 비밀번호를 만들던 로직을 제거했다. 서버가 발급한 고엔트로피 조회 토큰의 해시만 DB에 보관한다. |
| 비회원 조회 최소 상태 | 원문 조회 토큰은 현재 브라우저 세션에만 짧게 유지하고, 조회 요청 때 서버에서 해시해 비교한다. 일반 anon 주문 조회 정책은 만들지 않았다. |
| 배송지 처리 | 배송지는 주문 생성 요청에만 포함하고 DB의 RLS 보호 주문/배송 snapshot에 저장한다. 브라우저 영구 저장소에는 남기지 않는다. |

관련 파일:

- `src/frontend/core/storage.mjs`
- `src/frontend/commerce/order-client.mjs`
- `supabase/functions/create-order/index.ts`
- `supabase/functions/get-order/index.ts`
- `supabase/functions/guest-order-lookup/index.ts`
- `supabase/migrations/20260711055444_production_commerce_security.sql`
- `supabase/migrations/20260711055557_commerce_foreign_key_indexes.sql`

### 3. 관리자 접근과 최소 권한

- 관리자 화면을 그리기 전에 Supabase 세션을 확인하고 `user_roles`를 조회한다.
- `localStorage.reball.adminUser` 또는 `reball.adminCredentials`를 조작해도 관리자 shell을 표시하지 않는다.
- 허용 역할은 `owner_admin`, `inventory_manager`, `payments_manager`, `cs_manager` 네 가지다.
- 화면 탭은 `src/frontend/auth/admin-permissions.mjs`의 역할 매트릭스로 제한하고, DB 정책과 Edge Function에서도 역할을 다시 검사한다.
- 배송지 PII를 포함하는 `orders` 기본 테이블은 `payments_manager`가 직접 조회하지 못하게 했다. 이에 맞춰 해당 역할의 주문·반품 UI도 노출하지 않는다.
- `payments_manager`의 결제 취소 권한은 유지하되 취소 RPC 응답은 `private.payment_operation_payload()`를 사용한다. 이 payload에는 결제 상태·금액만 있고 배송 주소와 상품 목록은 없다.
- `admin-members`는 Edge gateway 설정만 신뢰하지 않고 handler 안에서 access token을 다시 검증한 뒤 `owner_admin` 또는 `cs_manager` 역할을 확인한다. 신형 Supabase Auth/API key와의 호환을 위해 gateway의 legacy JWT 검사는 끄되 이 자체 검증은 유지한다.
- 서버 저장 API가 아직 없는 관리자/마이페이지 변경 작업은 성공한 것처럼 로컬에 쓰지 않고 disabled 처리와 런타임 거부를 적용했다. 따라서 안전하지만 해당 운영 기능은 아직 사용 가능 상태가 아니다.
- 상품·주문·결제 신뢰 상태에 대한 anon/authenticated 직접 쓰기 권한을 회수하고 service-role RPC 경계로 이동했다.

### 4. 인증 남용 방어

| endpoint | 방어 |
|---|---|
| `signup-with-login-id` | IP와 로그인 ID/이메일 기준 DB rate limit, CAPTCHA 검증, 이메일 자동확인 우회 제거, 최소 auth metadata 사용 |
| `login-with-identifier` | 요청 rate limit과 별도 실패 누적 제한, CAPTCHA 검증, 성공 시 실패 제한 reset, 공통 오류 응답 |
| `auth-assist` | 시간당 제한, CAPTCHA 검증, 계정 존재·전체 로그인 ID를 과도하게 노출하지 않는 응답 |

공통 구현은 `supabase/functions/_shared/security.ts`와 `private.edge_rate_limits`/`consume_edge_rate_limit_v1()`에 있다. CAPTCHA는 Turnstile 또는 hCaptcha 공급자와 secret이 모두 설정되지 않으면 운영 기본 모드에서 실패 폐쇄한다. `AUTH_CAPTCHA_MODE=test`, mock 결제, HTTP success/fail URL은 `DENO_ENV`가 `development`/`dev`/`local`/`test` 중 하나로 명시된 경우에만 허용하며, 값이 없거나 `production`이면 실패 폐쇄한다. 비밀번호·access token·refresh token·조회 토큰을 보안 로그에 출력하지 않는다.

`supabase/functions/_shared/supabase.ts`는 Supabase가 자동 제공하는 신형 `sb_secret_*` API key를 `apikey` header로만 전송한다. JWT 형식의 legacy `service_role` key에만 `Authorization: Bearer`를 함께 사용해, 신형 opaque key를 JWT로 잘못 해석해 모든 RPC/Auth Admin 요청이 401로 실패하는 경로를 제거했다.

회원가입의 이름·휴대폰·주소는 `auth.users.raw_user_meta_data`에 넣지 않고 RLS 보호 `profiles`/`customer_addresses`에 서비스 RPC로 기록한다. migration에는 과거 auth metadata의 PII key를 제거하는 정리 구문도 포함되어 있다.

## 원격 Supabase 적용·smoke 결과

| 검사 | 결과 | 해석 |
|---|---|---|
| migration history | PASS | `20260711055444`, `20260711055557` 적용 성공 |
| 핵심 RPC/table 점검 | PASS | production commerce RPC와 신규 운영 table 존재 `true` |
| Edge Functions | PASS, 12/12 | 모두 `ACTIVE`, `verify_jwt=false` |
| OPTIONS/CORS smoke | PASS | 허용 origin preflight와 응답 header 정상 |
| 로그인 fail-closed smoke | EXPECTED 503 `SECURITY_CONFIG_MISSING` | 필수 내부 보안 secret 미설정 상태에서 인증 진행 차단 |
| reconciliation fail-closed smoke | EXPECTED 503 `RECONCILE_NOT_CONFIGURED` | scheduler secret 미설정 상태에서 작업 실행 차단 |

Database advisors에서 지적된 신규 foreign key 미인덱스 3개는 두 번째 migration으로 해소했다. 남은 Security Advisor WARN은 leaked password protection 비활성화이며 Auth 운영 설정에서 활성화가 필요하다. `private.edge_rate_limits`의 RLS policy 부재 INFO는 비공개 `private` schema와 service-role 전용 RPC로만 접근시키는 의도된 구조다.

## 실제 로컬 QA 결과

2026-07-11 최종 결제·취소·reconciliation 보강을 모두 반영한 작업트리에서 다시 실행한 결과다.

| 명령/검사 | 결과 | 검증 범위 |
|---|---|---|
| `npm run qa` | PASS, exit 0 | lint, build, Edge check, unit, contract, E2E, a11y 전체 순차 실행 |
| lint / build | PASS / PASS | 정적 검사와 배포 산출물 생성 |
| Edge Function Deno check | PASS, 12/12 | 배포 대상 Edge 함수 check |
| frontend unit | PASS, 36/36 | exact variant, 수량 제한, storage 최소화, 관리자 역할, CAPTCHA 클라이언트, 주문 payload, 소스 회귀 |
| backend Node | PASS, 25/25 | migration·Edge 불변조건, 권한 redaction, key header, 상태 단조성, 취소 경쟁과 fail-closed 구성 |
| Deno provider/실제 handler 사례 | PASS, 14/14 | mock, 상태 분류, retry, 민감정보 보호, 신형/legacy Supabase key header, Auth·주문 권한 handler |
| contract 전체 | PASS, 20/20 | frontend/backend 정적 계약 |
| E2E | PASS, 24/24 (40.1초) | 위조 local admin 차단, legacy 저장값 삭제, exact variant 제한을 포함한 브라우저 흐름 |
| a11y | PASS, 10/10 (19.9초) | 지정 핵심 경로의 serious/critical 검사 |
| SQL parser | PASS, 162 statements / 2 files | production commerce와 FK index migration parse |
| `npm audit` | 취약점 0 | 설치 의존성 audit |
| secret scan | 검출 0 | 저장소 대상 credential pattern 검사 |
| `git diff --check` | PASS | whitespace/error marker 검사 |

이 결과는 로컬 전체 QA와 원격 schema/function 배포 및 실패 폐쇄 smoke 증거다. 실제 Postgres 동시성/RLS 공격 matrix, 정상 이메일 로그인, CAPTCHA 공급자 응답, Toss 결제는 아직 실행하지 않았다.

## 남은 위험과 HUMAN_GATE

1. 적용된 두 migration의 백업/PITR 및 rollback 기준을 유지하고 실제 RLS·동시성 시나리오를 검증해야 한다.
2. Edge Function 내부 secret, SMTP/redirect URL, Supabase Auth의 이메일 확인 설정을 맞춰야 한다.
3. Turnstile 또는 hCaptcha 공급자를 선택하고 site/secret key, 허용 hostname을 입력한 뒤 성공·실패·우회 검사를 해야 한다.
4. leaked password protection을 활성화하고 기존 사용자 auth metadata 정리 후 세션 refresh/revoke 정책을 결정해야 한다.
5. 실제 DB에서 일반 회원, 네 관리자 역할, 비회원 토큰 변조를 각각 검증해야 한다.

HG-01 migration과 HG-02 함수 배포의 실행 증거는 확보했다. 남은 인증 운영 설정은 `docs/repair/HUMAN_GATES.md`의 HG-03~HG-04를 따른다.

## 결론

기준선의 P0 release blocker는 코드와 원격 배포 경계에서 차단됐고 회귀·smoke 증거도 추가됐다. 그러나 누락 secret, leaked password protection, 실제 인증/CAPTCHA와 RLS matrix 검증이 남아 있으므로 Wave 1 판정은 `REVIEW`다.
