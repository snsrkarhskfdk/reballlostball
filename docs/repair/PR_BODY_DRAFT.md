# PR: REBALL production-readiness repair

> PR #3은 MERGED 상태입니다. Supabase migration/Functions와 Vercel 최종 Preview·Production·alias smoke까지 완료했지만 Toss/CAPTCHA·내부 Edge secret 및 실제 Toss/DB 동시성 게이트가 남아 있어 판정은 `REVIEW`입니다.

## External execution status

- Deployed branch code head: `4a81481df1d774f46ce8c58cf4f33a49c3d56f2c`
- Main merge SHA: `4347c9c6db7520092c5c40a70f087ee466823faa`
- Remote branch/ref: `origin/fix/reball-production-readiness`
- PR URL/number: `https://github.com/snsrkarhskfdk/reballlostball/pull/3` (MERGED)
- Supabase project ref: `qbftalhhyfcndanrcwpy`
- Supabase migration/Functions result: versions `20260711055444`, `20260711055557` 성공; 12개 Functions `ACTIVE`/smoke 성공
- Vercel final Preview: `dpl_9V2WFwQCmA3ryPn56TFzouVUXPv1` (`READY`) — `https://reballlostball-7wrgzlgb2-thechangcnds-projects.vercel.app`
- Vercel Production: `dpl_2NixiY3VHhxyaZydowGif5oYqQsj` (`READY`) — `https://reballlostball-hhkw5erdb-thechangcnds-projects.vercel.app`
- Production aliases: `https://reballlostball.com`, `https://www.reballlostball.com`, `https://reballlostball.vercel.app`

기록된 Production ID는 애플리케이션 코드를 검증한 deployment다. 후속 보고서 전용 merge는 동일한 앱 산출물로 새 deployment ID를 만들 수 있다.

`승인됨 / 실행 중`은 성공 또는 운영 완료를 의미하지 않는다. 위 항목은 원격 증거를 확인한 뒤에만 실제 값으로 교체한다.

## Verdict

`REVIEW`

로컬 구현과 mock·정적·브라우저 검증 및 Supabase/Vercel 배포는 완료 범위까지 수행했지만, 실제 PostgreSQL RLS/동시성 및 Toss staging 통합 증거가 없고 Wave 5의 대형 `app.js`/`styles.css` 분리가 남아 있다. 배포 성공을 전체 운영 완료 또는 결제 연동 완료로 해석하지 않는다.

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
- GitHub branch push·PR #3 병합과 Supabase migration/Functions 배포는 원격 성공 확인
- Vercel 최종 Preview·Production·3개 alias 배포와 5-route smoke 성공
- Vercel과 중복되고 environment protection으로 계속 실패하던 GitHub Pages 자동 workflow는 파일을 보존한 채 `disabled_manually` 처리
- 실제 Toss 결제·live key 사용·webhook 등록·운영 DNS 변경은 미실행
- `app-current.js`, `index-current.html` 등 삭제 후보는 물리 삭제하지 않음
- 로컬 Supabase는 Docker engine pipe 부재로 실행하지 못했으며, 실제 DB 통합 검증은 원격 사후 증거가 기록될 때까지 미완료

## Test evidence

최신 결제 hardening을 포함한 전체 소스의 최종 QA 결과는 다음과 같다.

- lint PASS
- build PASS
- Edge Function check 12/12
- frontend 36/36
- backend 25/25
- Deno provider 14/14
- contracts 20/20
- E2E 24/24, 40.1초
- a11y 10/10, 19.9초

추가 무결성 검사도 통과했다.

- SQL parser 162 statements across 2 migrations
- `npm audit` 취약점 0
- server-secret scan 검출 0 (브라우저 공개용 Supabase publishable key 1건은 의도된 설정)
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

## External execution results

- HG-01: Supabase migration versions `20260711055444`, `20260711055557` 적용 성공
- HG-02: 12개 Edge Functions `ACTIVE`, smoke 성공; 내부 Edge secret 입력은 남음
- HG-10: branch push 성공, PR #3 MERGED, main merge SHA 확인
- HG-11: final Preview와 Production `READY`, 3개 alias 및 5-route smoke 성공

## Remaining external gates

### 운영 secret 및 Toss test key

- Supabase/Vercel 공개 설정과 아직 비어 있는 내부 Edge server secret 분리·입력
- Toss test client/secret key·MID의 매칭 및 안전한 입력
- `PAYMENT_RECONCILE_SECRET`, `PAYMENT_REFUND_DATA_KEY` 수명주기·rotation 정책
- 현재 Toss/CAPTCHA public config는 false이며 login/reconcile은 내부 secret 부재로 expected 503

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
- SMTP, redirect URL, Confirm email, Auth Leaked Password Protection 및 세션 정책 검증
- 운영 DNS와 확정 사업자·배송·환불 문구는 별도 승인 후 변경
