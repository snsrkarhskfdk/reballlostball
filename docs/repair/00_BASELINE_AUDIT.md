# 00 Baseline Audit

## 판정

`WAVE 0 — PASS WITH RECOVERY NOTE`

확정 작업 폴더에는 앱 소스가 없었고 991개, 4,013,943,553바이트의 원본 자산만 존재했다. 원본 전체 안전 복사본을 만든 뒤 GitHub `main`에서 로컬에 없던 220개 추적 파일만 복원했다. 같은 경로의 로컬 파일은 덮어쓰지 않았다.

## 작업 기준

- 확정 원본: `D:/Backup/리볼_로스트볼`
- 작업 전 안전 복사본: `D:/Backup/리볼_로스트볼_safety_20260711_005440`
- 안전 복사 검증: 원본/복사본 각 991개 파일, 각 4,013,943,553바이트 — 일치
- GitHub 비교 참조: `https://github.com/snsrkarhskfdk/reballlostball.git`
- GitHub 기준 HEAD: `748d7d20ec3c460d89e99e3d7c1cf40248b552c4`
- 작업 브랜치: `fix/reball-production-readiness`
- remote: `origin`
- 원본 manifest: `docs/repair/00_SOURCE_MANIFEST_SHA256.txt`
- manifest 범위: 복원 전 확정 원본 991개 + 복원된 통합 소스 222개
- manifest SHA-256: `832C5E49199515C5E1AB750DFBF4EA79C1575AF0B5D2676F4EEB192475093F49`

## 소스 복구 기록

| 분류 | 수량 | 처리 |
|---|---:|---|
| 로컬 전용 | 990 | 원본 유지, Git 일괄 추가 금지 |
| GitHub 전용 | 220 | 누락 앱 소스로 복원 |
| 공유 경로 | 1 | `package.json` |
| 서로 다른 공유 경로 | 1 | 양쪽 내용을 병합 대상으로 보존 |

복원 전에는 `index.html`, `app.js`, `styles.css`, `vercel.json`, `scripts/**`, `.github/workflows/**`, `supabase/**`, `assets/**`, `hero/**`가 모두 없었다. ZIP 8개도 조사했으나 앱 소스는 없었다. 전체 파일별 비교는 `00_LOCAL_VS_GITHUB_DIFF.md`에 기록했다.

## 복원된 핵심 파일 기준선

| 경로 | 크기(bytes) | 비고 |
|---|---:|---|
| `index.html` | 2,547 | 배포 엔트리, `app.js` 로드 |
| `index-current.html` | 1,044 | 중복 개발 엔트리, `app-current.js` 로드 |
| `app.js` | 367,261 | 8,381줄 |
| `app-current.js` | 351,876 | 8,073줄 |
| `styles.css` | 278,572 | 14,287줄 |
| `vercel.json` | 225 | `dist` 정적 배포 설정 |
| `supabase/migrations/0001_init.sql` | 15,504 | 초기 주문·결제·권한 테이블 |
| `supabase/migrations/0002_admin_and_customer_policies.sql` | 4,511 | 관리자/고객 정책 |
| `supabase/migrations/0003_indexes_and_policy_cleanup.sql` | 5,730 | 인덱스·정책 정리 |
| `supabase/migrations/0004_auth_profiles_and_mypage.sql` | 5,338 | 인증·마이페이지 |
| `supabase/migrations/0005_login_id_for_profiles.sql` | 3,779 | 로그인 ID |
| `supabase/migrations/0006_login_id_edge_function_cleanup.sql` | 3,678 | 로그인 ID 보강 |
| `supabase/migrations/0007_admin_catalog_write_access.sql` | 2,856 | 관리자 상품 권한 |

## Git 상태

- 복원 직후 HEAD: `748d7d2`
- 현재 브랜치: `fix/reball-production-readiness`
- 기존 로컬 `package.json`은 `dotenv`만 포함해 GitHub 실행 스크립트와 충돌했다.
- 약 4GB의 로컬 디자인·영상·Blender·사업자 자산은 untracked 상태로 보존하며 `git add -A`를 사용하지 않는다.
- `main` 병합, push, PR, Preview/운영 배포는 수행하지 않는다.

## 기준선 명령 결과

### 공식 npm 명령

| 명령 | 결과 | 원인 |
|---|---|---|
| `npm run lint` | FAIL (exit 1) | 로컬 `package.json`에 script 없음 |
| `npm run build` | FAIL (exit 1) | 로컬 `package.json`에 script 없음 |
| `npm run build:check` | FAIL (exit 1) | 로컬 `package.json`에 script 없음 |

### 복원된 검사 스크립트 직접 실행

| 명령 | 결과 |
|---|---|
| `node scripts/lint.mjs` | PASS |
| `node scripts/build-check.mjs` | PASS |
| `node scripts/build.mjs` | PASS, `dist` 생성 |

기존 검사는 함수명·문자열·자산 존재만 확인하여 보안·주문·접근성 결함을 검출하지 못했다. Wave 5에서 실제 unit/integration/E2E 검사로 교체한다.

## 로컬 브라우저 기준선

- 서버: `http://127.0.0.1:4173`
- 콘솔 warning/error: 관찰 시 0건
- 치명적 개발/배포 불일치: 개발 서버 `/`는 `index-current.html`을 우선하고 `app-current.js`를 로드하지만 배포는 `index.html`/`app.js`를 사용한다.
- 홈 `h1`: 6개 — 단일 `h1` 기준 실패
- 홈 가로 overflow: 1280×720에서 없음
- 모든 검사 경로에서 항상 dialog 역할 노드 1개가 DOM에 존재해 dialog 가시성/ARIA 확인이 필요하다.

| 경로 | 기준선 동작 | 문제 |
|---|---|---|
| 홈 `#/` | 렌더링 | `h1` 6개, 중복 섹션 |
| 상품 `#/product/titleist-pro-v1-v1x-lostball` | 재고 51세트 표시 | fallback variant가 주문 가능 상태를 생성할 수 있음 |
| 장바구니 `#/cart` | 빈 상태 렌더링 | 브라우저 저장 장바구니 의존 |
| 체크아웃 `#/checkout` | 빈 장바구니여도 배송/결제 폼 진입 | 서버 주문 준비 검증 없음 |
| 주문 `#/order/TEST-NOT-FOUND` | “주문을 찾을 수 없습니다” | 최상위 `h1` 없음 |
| 로그인 `#/login` | 폼 렌더링 | 최상위 `h1` 없음 |
| 회원가입 `#/signup` | 폼 렌더링 | 서버 함수가 이메일 확인 우회 |
| 비회원 조회 `#/login/order` | 주문자명·휴대폰·주문번호·비밀번호 요구 | 로컬 임시 주문/휴대폰 끝 4자리 비밀번호와 결합 |
| 마이페이지 `#/mypage` | 비로그인 시 로그인으로 이동 | 정상 |
| 관리자 `#/admin` | 로그인 폼 렌더링 | 로컬 자격증명 조작으로 우회 가능 |

## 재현 테스트 시나리오

1. `localStorage.reball.adminCredentials`와 `reball.adminUser`를 조작한 뒤 `#/admin` 접근 — 관리자 우회 가능.
2. 체크아웃 폼 제출 — 이름·휴대폰·주소·품목이 `reball.ephemeralOrders`에 저장되고 비회원 비밀번호가 휴대폰 마지막 4자리로 생성됨.
3. DB variant가 없는 상품/옵션 — fallback `stock: 99`, `available: true` 및 항상 참인 `isOptionSelectable()`로 구매 가능.
4. 클라이언트에서 주문 총액/상태 구성 — 서버 가격·재고 transaction 없이 주문 완료 화면 생성.
5. `signup-with-login-id` 반복 호출 — rate limit/CAPTCHA 없이 `email_confirm: true` 사용자 생성 가능.
6. `auth-assist` 반복 호출 — 계정 존재 여부와 로그인 ID가 과도하게 노출됨.
7. 홈 검사 — 최상위 `h1` 6개.
8. 개발 서버와 배포 빌드 비교 — 서로 다른 HTML/JS 엔트리 로드.

## Wave 0 결론

기준선 확보와 소스 복구는 완료했다. 앱은 실행되지만 RELEASE BLOCKER가 재현되므로 운영 후보가 아니다. 다음 Wave에서 package 실행 계약 복구, variant/PII/admin/auth 차단부터 수정한다.
