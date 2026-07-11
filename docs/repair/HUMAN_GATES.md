# Human Gates

로컬 구현·정적 분석·mock·브라우저 검증은 완료 범위까지 수행했다. 사용자는 2026-07-11에 다음 외부 작업을 명시 승인했다.

- 현재 repair 브랜치의 GitHub commit 및 push
- 대상 확인 후 Supabase migration·Edge Functions 배포
- 대상 확인 후 Vercel 운영 배포

GitHub PR #3 병합, Supabase migration 및 12개 Edge Function 배포, Vercel 최종 Preview와 Production 배포 및 alias 연결까지 원격 증거가 확인됐다. Production UI/API smoke는 통과했지만 Toss/CAPTCHA 공개 설정과 내부 Edge secret, 실제 Toss 및 DB 동시성 검증은 남아 있다.

| Gate | 현재 상태 | 남은 입력·검증 | 완료 조건 / 현재 금지 |
|---|---|---|---|
| HG-01 Supabase migration | **원격 적용 성공** — `qbftalhhyfcndanrcwpy`, versions `20260711055444`, `20260711055557` | 실제 PostgreSQL/RLS·동시성 검증은 HG-13에서 계속 | migration 성공을 실제 경쟁 조건 통과로 확대 해석 금지 |
| HG-02 Edge Functions와 server secrets | **12개 Function ACTIVE / smoke 성공** — 내부 Edge secret 미완료 | 운영 secret 입력·검증과 실제 provider 호출 | secret 없이 Toss/Auth 운영 완료로 판정하거나 브라우저 환경에 server secret 기록 금지 |
| HG-03 Auth 이메일 확인 | 코드 안전화 완료, 실환경 미검증 | SMTP, redirect URL, Confirm email, 기존 세션 refresh/revoke, Auth Leaked Password Protection 활성화 | 이메일 확인 우회 및 유출 비밀번호 보호 미설정 상태의 운영 완료 표기 금지 |
| HG-04 CAPTCHA | 미승인·미설정 — 외부 게이트 유지 | Turnstile/hCaptcha 공급자 선택, site/secret key, 허용 hostname, Dashboard 활성화 | CAPTCHA 미설정 상태를 운영 완료로 판정 금지 |
| HG-05 Toss 테스트 자격증명 | 미입력 — 외부 게이트 유지 | 서로 매칭되는 test client key, secret key, MID와 보관 위치 | 키 없이 Toss 연동 완료 표기 및 live key 사용 금지 |
| HG-06 Toss webhook·네트워크 경계 | 미등록 — 외부 게이트 유지 | 외부 HTTPS URL, 이벤트 등록, 공식 inbound IP allowlist/WAF·ACL, 재전송 검증 | 관리자센터 등록·네트워크 경계 검증 전 webhook 운영 완료 표기 금지 |
| HG-07 Reconciliation·운영 큐 | worker 코드 준비, 운영 연결 미완료 | scheduler 주기, `PAYMENT_RECONCILE_SECRET`, 알람·담당자·manual-review 처리 절차 | 무감시 scheduler 운영 금지 |
| HG-08 환불계좌 암호화 key 수명주기 | 코드 준비, 운영 key 미입력 | 32자 이상 고엔트로피 `PAYMENT_REFUND_DATA_KEY`, 백업·접근권한·rotation 정책 | 임시·재생성 key로 운영 취소 활성화 금지 |
| HG-09 실제 결제수단 테스트 | 미승인·미실행 — 외부 게이트 유지 | Toss test key, 최소 금액, 결제수단, 환불 계좌, 테스트 책임자와 실제 실행 승인 | 카드·계좌이체·가상계좌·간편결제 실거래 및 live key 사용 금지 |
| HG-10 GitHub commit/push | **성공** — deployed code head `4a81481df1d774f46ce8c58cf4f33a49c3d56f2c`, PR #3 MERGED, main `4347c9c6db7520092c5c40a70f087ee466823faa` | 후속 운영 수정은 새 변경으로 추적 | 과거 commit을 현재 main head로 오인 금지 |
| HG-11 Vercel 운영 배포 | **성공** — Preview/Production READY 및 3개 alias 연결·smoke 통과 | Toss/CAPTCHA public config와 내부 Edge secret은 별도 게이트 | 배포 성공을 결제·인증 실연동 완료로 확대 표기 금지 |
| HG-12 운영 도메인·정책 | 변경 없음 | DNS 및 확정 사업자·배송·환불 문구 변경 승인 | 운영 DNS/정책 문구 변경 금지 |
| HG-13 실제 PostgreSQL/RLS·동시성 | 미실행 — 외부 통합 게이트 유지 | 연결된 실제 PostgreSQL에서 migration, 실제 JWT/RLS/RPC, 동시 주문·재고·승인/취소/webhook 경합 실행 | 로컬 parser·mock 결과를 실제 DB 통합 통과로 대체 금지 |

## 외부 실행 결과

아래 값은 루트 작업이 실제로 성공하고 원격 증거를 확인한 뒤에만 채운다.

- Git deployed code head: `4a81481df1d774f46ce8c58cf4f33a49c3d56f2c`
- Git main merge SHA: `4347c9c6db7520092c5c40a70f087ee466823faa`
- Git remote branch/ref: `origin/fix/reball-production-readiness`
- Pull request URL/number: `https://github.com/snsrkarhskfdk/reballlostball/pull/3` (MERGED)
- Supabase project ref: `qbftalhhyfcndanrcwpy`
- Supabase migration result: `20260711055444`, `20260711055557` 적용 성공
- Supabase Edge Functions result: 12개 `ACTIVE`, smoke 성공
- Vercel final Preview: `dpl_9V2WFwQCmA3ryPn56TFzouVUXPv1` — `https://reballlostball-7wrgzlgb2-thechangcnds-projects.vercel.app` (`READY`)
- Vercel Production: `dpl_2NixiY3VHhxyaZydowGif5oYqQsj` — `https://reballlostball-hhkw5erdb-thechangcnds-projects.vercel.app` (`READY`)
- Vercel production aliases: `https://reballlostball.com`, `https://www.reballlostball.com`, `https://reballlostball.vercel.app`

## 남은 외부 게이트 분리

### 1. 운영 secret 및 Toss test 자격증명

- Supabase/Vercel의 공개 환경변수와 Edge 전용 secret을 분리하고, 아직 비어 있는 내부 Edge secret을 입력·검증한다.
- `SUPABASE_SERVICE_ROLE_KEY`, `TOSS_PAYMENTS_SECRET_KEY`, `PAYMENT_RECONCILE_SECRET`, `PAYMENT_REFUND_DATA_KEY`는 Edge secret에만 둔다.
- 서로 매칭되는 Toss test client key·secret key·MID를 확보하고 live key와 혼용하지 않는다.
- 환불계좌 암호화 key는 재배포 때 임의 변경하지 않으며 rotation·복구 정책을 먼저 확정한다.

### 2. Toss webhook 및 실제 결제

- 공식 inbound IP allowlist/WAF·ACL, 이벤트 등록 URL, 정상 재전송을 staging에서 검증한다.
- scheduler 실패, 8회 재조정 초과 및 `payment_cancel_manual_review`를 알람·담당자 큐에 연결한다.
- 실제 결제·취소·부분취소·가상계좌 입금/환불은 HG-09의 별도 실행 승인 뒤 test key와 최소 금액으로 수행한다.

### 3. 실제 PostgreSQL/RLS·동시성

- 일반 회원·타 회원·비회원 변조 토큰과 네 관리자 역할로 RLS 및 RPC `EXECUTE` 경계를 실제 JWT로 검증한다.
- 동시 주문, 가격 변조, 품절, 중복 멱등키, 승인/취소/webhook 순서 역전 및 virtual-account 경합을 실제 transaction으로 실행한다.
- migration dry-run, enum/constraint 호환, rollback·복구 절차 및 적용 후 schema/migration 상태를 확인한다.

### 4. CAPTCHA 및 Auth 운영 설정

- Turnstile 또는 hCaptcha 공급자, site/secret key, 허용 hostname을 확정하고 운영 Dashboard에서 활성화한다.
- SMTP, redirect URL, Confirm email 정책과 기존 세션 refresh/revoke 정책을 실제 환경에서 검증한다.

## 확인된 환경 제한

`npx supabase status`는 2026-07-11에 Docker engine pipe를 찾지 못해 실패했다. 원격 migration과 Function smoke는 성공했지만 실제 JWT/RLS, 동시 재고 경쟁, 승인·취소·웹훅 경합 통합 테스트는 아직 증거에 포함되지 않는다.
