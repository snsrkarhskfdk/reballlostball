# 리볼로스트볼 출시 후보 — 2026-10-13

기준은 PR #37 `935120a88cbd14495787ab32a2d302d260aa27cb`이다. PR #36
`1d3bce5ef55a95ca5128b2ffe7e39b81f0c09063`을 전부 포함하며 추가 커밋 16개가 있다.
두 PR을 별도로 병합할 필요가 없다. main은 `684d72c3fe7e00858495e193c4f83bbccf8ed61d`.
이 문서는 병합/배포/고객 DB 변경/실결제의 승인이 아니다.

## 코드 수정

- Windows 기본 clone에서 source 및 `.env.example`을 LF로 고정하고 CRLF도 테스트에서 수용한다.
- Windows Node 22 CI가 lint/build/static release/contracts/Edge typecheck를 실행한다.
- 운영 빌드에서 빈 Toss 공개 키 및 TEST 공개 키, Cloudflare dummy sitekey를 거부한다.
- 운영 Edge runtime에서 Toss TEST secret 및 Cloudflare dummy secret을 거부한다.
- 관리자 배송창의 계정 전환/창 닫기 후 지연 응답 및 오류를 억제하는 테스트를 추가한다.
  성공·실패·snapshot cache의 세 소유권 guard 삭제가 모두 테스트에 탐지된다.
- 쓰이지 않는 `CAPTCHA_SECRET_KEY`, `CAPTCHA_REQUIRED` 예시를 제거한다.
- 비회원 주문 복구 중 route가 다시 그려져 loading card가 교체되는 실제 경합을 수정한다.
  같은 주문/같은 capability에 한해 현재 card로 응답을 전달하고 route/token이 바뀌면 버린다.
  재현 unit test의 수정 전 RED/수정 후 GREEN과 브라우저에서 강제 card 교체를 검증한다.

## 기존 증빙 재사용

- Full QA #170: https://github.com/snsrkarhskfdk/reballlostball/actions/runs/35836296258
  `935120a`에서 2026-09-23 성공. Linux CI는 DR-01이나 Windows 검증을 대신하지 않는다.
- 2026-09-23 Phase2 final packet은 `935120a`의 PostgreSQL 17 DR-01 네 단계
  RED/GREEN 10/10/RED/GREEN 10/10을 기록하고, final 단계에서 증빙 digest 12/12를 재확인했다.
  이 실행은 해당 기록을 재사용한다. DR-01 harness와 모든 migration bytes를 변경하지 않았다.
- 기존 Preview 62개 파일 source binding 및 secret scan 기록도 같은 `935120a`에 한정한다.
  새 successor commit의 원격 CI/Preview 증빙은 별도로 확보해야 한다.

## 현재 운영 상태 — 읽기 전용 확인

- Vercel `prj_hK5HCUdtzjPApGwEpDlYuhwOTiUb`, team `team_XMWHguTR84XovoaZzbrryFth`.
- Preview `dpl_eQWxxeN7njihH9g8GG4Td8LFgcUh` READY, exact SHA `935120a`.
  root HTTP 200, unknown path HTTP 404, security headers 확인.
  HTML의 CAPTCHA provider/sitekey 및 Toss client key는 비어 있다.
- Vercel env metadata 조회는 403. 이 cloud workspace에는 별도 Vercel CLI 인증이 없다.
  프로젝트 설정은 Node 24지만 package engine은 22.x이다. 실제 build runtime은 로그 확인 필요.
- Supabase production `qbftalhhyfcndanrcwpy`는 ACTIVE_HEALTHY.
  `check-login-id` v1, `admin-orders-page` v1은 실제 ACTIVE.
  production migration 기록은 `admin_ops_console_v3_advisor_cleanup`까지이며 9월 9~14일
  후보 migration 8개는 기록에 없다. 이미 수동 적용됐다고 가정하지 말고 function/index 정의와 대조한다.
- 배포된 payment-confirm v5/shared sources는 후보와 다르다. 함수 전체 deployment inventory를
  exact source로 다시 바인딩해야 한다. 존재/ACTIVE만으로 최신 또는 안전하다고 판정하지 않는다.
- staging은 발견되지 않았다. `Reball R42 DB Proof TEMP`는 INACTIVE.

## 순서가 있는 실제 출시 조건

1. 후보의 Linux Full QA + Windows portability CI가 모두 성공해야 한다.
2. 별도 non-production Supabase를 확보하고 production schema/extension 환경을 복제한다.
   Production 데이터를 복사하지 말고 synthetic member/order만 사용한다.
3. 현재 production migration version은 저장소 파일의 timestamp와 일부 다르므로 이름과
   정의를 기준으로 아래 8개 pending migration을 확정한다. staging에서 적용·restore를 검증한다.
   - 20260909061000_admin_order_notes_per_order.sql
   - 20260909210500_admin_latest_payment_per_order.sql
   - 20260909211500_orders_pagination_indexes.sql
   - 20260911000000_edge_rate_limit_insert_race.sql
   - 20260911001000_guest_token_rotation_settled_states.sql
   - 20260911002000_payment_cancel_null_authorization.sql
   - 20260911003000_finalize_confirmation_after_fulfilment.sql
   - 20260914000000_payment_cancel_refund_account_null.sql
4. staging Edge Functions를 후보 source로 배포한다. 기능별 bundle에 shared files도 포함한다.
   Vercel Preview에는 staging SUPABASE_URL + 공개 key + Toss TEST client key를 지정한다.
   빈 Preview Supabase 설정은 production 기본값을 사용하므로 실제 auth/order 테스트를 시작하면 안 된다.
5. Cloudflare Turnstile 실제 widget 생성 및 hostname 설정. Vercel에는 공개 provider/sitekey만,
   Supabase에는 `AUTH_CAPTCHA_MODE=enforced`, provider, secret, expected hostnames를 설정한다.
   `ALLOWED_ORIGINS`에는 정확한 Preview origin만 추가한다. 임의 `*.vercel.app` 허용 금지.
   production secret 또는 customer DB의 설정 변경은 별도 승인을 받는다.
6. 후보 Preview에 storefront/cart/checkout/legal/admin/404 smoke, 실제 Turnstile,
   synthetic 회원 가입→인증→로그인→주소 read/write, Toss TEST 결제 및 취소·재시도 검증을 수행한다.
   sandbox도 staging DB를 사용한다. 성공 화면만으로 승인 여부를 추론하지 않는다.
   order/payment/inventory/event ledger 및 idempotency를 확인한다.
7. production 복원점·롤백 절차와 실제 LIVE 키를 준비하고 exact candidate/DB/Edge/env 목록으로
   병합·배포 승인을 받는다. main push는 Vercel production을 자동 실행할 수 있다.
8. 승인 후 DB/Edge/build을 일관된 버전으로 반영하고 controlled real payment는 별도 승인을 받는다.
   www redirect, canonical, robots/sitemap, auth, 주문 조회 및 결제 ledger를 다시 확인한다.

비밀 키를 Git/문서/채팅에 기록하지 않는다. Full QA/기존 DR-01 증빙은 실제 Turnstile,
현재 production deployment alignment, staging restore 또는 실제 결제 검증을 대신하지 않는다.
