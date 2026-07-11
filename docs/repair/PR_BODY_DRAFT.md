# PR: REBALL production-readiness repair

> 초안입니다. GitHub commit/push와 Supabase/Vercel 배포는 사용자가 승인했으며 현재 실행 준비·진행 중입니다. 실제 commit, push, PR 및 배포 성공은 아직 기록하지 않았습니다.

## External execution status

- Commit SHA: `<PENDING_ROOT_FILL_AFTER_SUCCESS>`
- Remote branch/ref: `<PENDING_ROOT_FILL_AFTER_PUSH>`
- PR URL/number: `<PENDING_ROOT_FILL_IF_CREATED>`
- Supabase project ref: `<PENDING_ROOT_FILL_AFTER_ACCOUNT_VERIFICATION>`
- Supabase migration/Functions result: `<PENDING_ROOT_FILL_AFTER_REMOTE_VERIFICATION>`
- Vercel staged deployment URL: `<PENDING_ROOT_FILL_AFTER_DEPLOY>`
- Vercel production URL/alias: `<PENDING_ROOT_FILL_AFTER_PROMOTE_AND_SMOKE>`

`승인됨 / 실행 중`은 성공 또는 운영 완료를 의미하지 않는다. 위 항목은 원격 증거를 확인한 뒤에만 실제 값으로 교체한다.

## Verdict

`REVIEW`

로컬 구현과 mock·정적·브라우저 검증은 완료 범위까지 수행했지만, 실제 PostgreSQL RLS/동시성 및 Toss staging 통합 증거가 없고 Wave 5의 대형 `app.js`/`styles.css` 분리가 남아 있다. 외부 배포 승인만으로 이 초안을 운영 완료 또는 배포 완료로 해석하지 않는다.

## Summary

- exact DB variant만 구매 가능하도록 fallback 가상 재고·가격 제거
- PII 로컬 저장과 휴대폰 끝 4자리 비회원 비밀번호 제거
- Supabase session·역할·RLS 기반 관리자 접근으로 전환
- 서버 가격 재계산, 원자적 재고 예약/해제, 주문 snapshot·감사 이벤트 구현
- Toss Payments v2 adapter, 서버 승인·취소, 멱등성, 웹훅·가상계좌·reconciliation 구현
- 승인/취소 순서 역전 차단, 무진전 partial 거부, stale worker fencing, 8회 제한 `manual_review` 보강
- 입금 완료 가상계좌 환불계좌의 one-purpose ciphertext, provider 재시도 분류, webhook rate limit 적용
- 홈 구매 위계, 단일 `h1`, 네 가지 버튼 시스템, 키보드/반응형/접근성 보강
- 정적 SPA 단일 개발/빌드 엔트리와 자동 unit/integration/E2E/a11y 검사 추가
- 서버 API가 없는 관리자·고객 mutation은 UI/runtime에서 fail-closed

## Safety

- 기준 작업 폴더 전체 안전 복사 및 SHA-256 manifest 완료
- 로컬 전용 약 4GB 자산 보존; 대량 untracked 파일이 있으므로 `git add -A` 금지
- GitHub commit/push 및 Supabase/Vercel 배포는 승인되어 실행 중이나 성공 미확정
- 실제 Toss 결제·live key 사용·webhook 등록·운영 DNS 변경은 미실행
- `app-current.js`, `index-current.html` 등 삭제 후보는 물리 삭제하지 않음
- 로컬 Supabase는 Docker engine pipe 부재로 실행하지 못했으며, 실제 DB 통합 검증은 원격 사후 증거가 기록될 때까지 미완료

## Test evidence

최신 결제 hardening을 포함한 전체 소스의 최종 QA 결과는 다음과 같다.

- lint PASS
- build PASS
- Edge Function check 12/12
- frontend 35/35
- backend 25/25
- Deno provider 14/14
- contracts 20/20
- E2E 24/24
- a11y 10/10

추가 무결성 검사도 통과했다.

- SQL parser 159 statements
- `npm audit` 취약점 0
- secret scan 검출 0
- `git diff --check` PASS

위 결과는 로컬 자동 검증이며 실제 PostgreSQL RLS/동시성, 원격 migration 또는 Toss staging 실연동 통과를 의미하지 않는다.

## Reviewer test plan

- `npm run lint`
- `npm run build`
- `npm run check:edge`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:contracts`
- `npm run test:e2e`
- `npm run test:a11y`

## Reviewer focus

- migration의 `SECURITY DEFINER` 범위·`search_path`·EXECUTE revoke/grant
- 주문 생성/재고 예약 transaction의 동시성·멱등성
- 회원 소유권, 비회원 token hash, 관리자 역할별 RLS
- Toss 금액/orderId 대조와 `DONE`/가상계좌/중복 webhook 처리
- 활성 취소 중 승인/webhook 순서 역전, 무진전 partial, stale lease fencing
- provider 오류의 definitive/retryable 분류와 8회 초과 `manual_review` 운영 경계
- 가상계좌 환불 ciphertext의 redaction·삭제·`PAYMENT_REFUND_DATA_KEY` rotation
- webhook rate limit과 공식 inbound IP allowlist/WAF가 재전송을 막지 않는지
- 브라우저에 secret 또는 PII가 남지 않는지
- 홈 6단계 위계와 모바일/키보드 회귀
- `app.js`와 `styles.css`의 잔여 monolith 및 비활성 mutation 범위

## Approved and in progress

- HG-01: Supabase migration 배포 승인됨 / 실행 중 — 실제 적용·검증 결과 대기
- HG-02: Edge Functions 배포 승인됨 / 실행 중 — 운영 secret·원격 목록·smoke 결과 대기
- HG-10: GitHub commit/push 승인됨 / 실행 중 — commit SHA와 원격 ref 대기
- HG-11: Vercel 운영 배포 승인됨 / 실행 중 — team/project 연결, staged URL, promote 결과 대기

## Remaining external gates

### 운영 secret 및 Toss test key

- Supabase/Vercel 공개 설정과 Edge server secret 분리
- Toss test client/secret key·MID의 매칭 및 안전한 입력
- `PAYMENT_RECONCILE_SECRET`, `PAYMENT_REFUND_DATA_KEY` 수명주기·rotation 정책

### Toss webhook 및 실제 결제

- 외부 webhook 등록, 공식 inbound IP allowlist/WAF·ACL, 정상 재전송 검증
- reconciliation scheduler, 알람, `manual_review` 운영 절차
- test key·최소 금액 기반 실제 승인/취소/부분취소/가상계좌 입금·환불

### 실제 PostgreSQL/RLS·동시성

- 실제 JWT를 사용한 회원·비회원·관리자 역할별 RLS/RPC 검증
- 동시 주문·재고, 멱등성, 승인/취소/webhook 순서 역전의 실제 transaction 검증
- 적용 후 migration/schema 상태와 rollback·복구 검증

### CAPTCHA·Auth 및 운영 도메인

- Turnstile/hCaptcha provider, site/secret key, 허용 hostname 활성화
- SMTP, redirect URL, Confirm email 및 세션 정책 검증
- 운영 DNS와 확정 사업자·배송·환불 문구는 별도 승인 후 변경
