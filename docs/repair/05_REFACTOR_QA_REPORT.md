# 05 Refactor & QA Report

## 판정

`WAVE 5 — REVIEW`

운영 차단 결함을 담당하는 프런트엔드 로직을 기능 모듈로 분리하고, 개발·배포 엔트리를 `index.html`/`app.js`로 통일했으며, unit·contract·E2E·접근성·Edge·SQL 정적 검사를 자동화했다. 최신 결제 취소 경쟁·재시도·민감 환불정보·webhook 방어와 CDN/Toss SDK 실패 복원 보강까지 포함한 전체 로컬 QA를 2026-07-11에 통과했다.

그러나 `app.js`는 현재도 8,015줄이다. CSS는 엔트리와 5개 import module로 나뉘었지만 합계 14,669줄이고, `src/frontend/ui/base.css`만 11,122줄이다. 라우터·상태·화면 렌더러의 전면 모듈화와 CSS 중복/cascade 정리는 완료되지 않았다. 또한 Docker 엔진이 없어 실제 Supabase/Postgres의 migration·RLS·동시성 통합 테스트를 실행하지 못했고, Vercel·Supabase 운영 배포도 이 로컬 검증 단계에서는 수행하지 않았다. 따라서 Wave 5와 전체 결과를 `LOCAL FINAL CANDIDATE`로 올리지 않고 `REVIEW`로 남긴다.

## 구조 개선 결과

### 분리한 프런트엔드 경계

| 모듈 | 책임 |
|---|---|
| `src/frontend/catalog/variants.mjs` | DB에 실제 존재하는 활성 variant의 가격·재고·선택 가능 여부 검증 |
| `src/frontend/catalog/content.mjs` | 확정 사업자·배송 정책, 브랜드·상품·공지·FAQ 표시 콘텐츠 |
| `src/frontend/core/router.mjs` | hash route, 결제 return route/parameter 분리, `paymentKey` 제거 URL 치환 |
| `src/frontend/core/state.mjs` | 독립된 가변 collection을 생성하는 앱 상태 factory |
| `src/frontend/core/storage.mjs` | variant ID·수량만 저장하는 session cart, 비회원 조회 token의 session 보관, 과거 민감 localStorage 제거 |
| `src/frontend/core/url-safety.mjs` | 상품 slug와 저장형 asset URL의 허용 형식 검증 |
| `src/frontend/cart/model.mjs` | variant 식별자를 보존하는 cart item·합계·배송비 계산 |
| `src/frontend/checkout/view.mjs` | 체크아웃 field/method/policy 렌더러와 수령인·주소 검증 |
| `src/frontend/commerce/order-client.mjs` | 서버 주문 생성·조회·비회원 조회 계약과 안전한 주문 payload mapping |
| `src/frontend/payments/toss-client.mjs` | 결제 준비, Toss SDK 호출·timeout·실패 후 재시도, 서버 승인 요청 경계 |
| `src/frontend/auth/admin-permissions.mjs` | 관리자 역할별 UI 권한 매트릭스 |
| `src/frontend/auth/captcha-client.mjs` | Turnstile/hCaptcha 공개 설정, widget 수명주기, 설정 누락 시 실패 폐쇄 |
| `src/frontend/account/presentation.mjs` | 주문·결제·배송 상태와 계정 정보 표시 변환 |
| `src/frontend/admin/presentation.mjs` | 관리자 탭·차트·기본 프로필/배너 표시 변환 |
| `src/frontend/ui/components.mjs` | 공통 HTML escaping과 여러 줄 텍스트 렌더링 |

보안·주문·결제의 신뢰 경계와 라우터·상태·cart·checkout·account·admin 표시 로직의 일부가 `app.js`에서 위 모듈로 이동했다. 브라우저가 단가·총액·관리자 세션·가상 재고를 자체 확정하지 않도록 하는 것이 이번 분리의 우선순위였다. 서버 주문번호는 route/data attribute에 사용하기 전 `[A-Z0-9_-]{6,64}` 계약을 다시 검사한다.

### CSS import 구조

`styles.css`는 cascade 순서를 계약으로 갖는 entry로 유지하고 다음 5개 module을 순서대로 import한다.

1. `src/frontend/ui/base.css`
2. `src/frontend/ui/readability.css`
3. `src/frontend/ui/commerce-extensions.css`
4. `src/frontend/ui/product-polish.css`
5. `src/frontend/ui/mobile-product.css`

build check는 import 그래프의 누락 CSS와 상대 asset URL을 검사한다. build는 `src/frontend` 전체와 `public/fonts/pretendard` CSS 상대 경로를 함께 복사한다. 이 분리는 배포 import 누락을 막지만, 11,122줄 `base.css`의 중복 selector와 후반 override를 제거했다는 의미는 아니다.

### 단일 실행 경로와 설정

- 개발 서버와 build가 모두 `index.html`과 `app.js`를 사용한다.
- `app-current.js`, `index-current.html`은 더 이상 실행 엔트리로 사용하지 않지만 원본 보존 원칙에 따라 삭제하지 않았다.
- `scripts/public-config.mjs`가 공개 Supabase/Toss/CAPTCHA 설정을 meta에 주입하고 설정 쌍·URL·키 형식을 검사한다.
- `.env.example`은 공개값과 Edge Function 전용 secret을 분리하며 실제 값은 포함하지 않는다.
- 운영에서 `PUBLIC_CONFIG_REQUIRED=true`를 적용하면 공개 설정 누락도 build 단계에서 실패 폐쇄할 수 있다.
- `package.json`의 공식 명령을 lint, build, unit, integration, E2E, a11y, Edge 검사로 복구했다.
- Supabase SDK는 핀된 버전을 동적 로드하되 storefront를 먼저 렌더한다. CDN이 응답하지 않으면 2.5초 후 온라인 계정/거래 기능만 fail-closed하며, top-level await로 전체 화면이 비는 것을 막는다.

### 보존한 삭제 후보

- `app-current.js`, `index-current.html`
- `renderHomeHero()`를 포함한 정의 전용 렌더러 후보
- 사용자가 제공한 대용량 이미지·영상·ZIP·Blender 원본

동적 참조와 시각 회귀를 추가로 확인하기 전에는 삭제하지 않는다. 근거와 선행 조건은 `docs/repair/DELETION_CANDIDATES.md`에 기록했다.

### 최신 결제 hardening

- 승인 finalize, 취소 API, webhook의 순서가 뒤집혀도 활성 취소가 있으면 fulfillment를 `cancel_requested`에 유지한다.
- 공급자가 `PARTIAL_CANCELED`를 반환했지만 누적 취소액이 늘지 않은 무진전 partial은 완료로 기록하지 않고 차단 상태와 reconciliation을 유지한다.
- 취소 실패 처리, manual-review 전환, reconciliation 완료 RPC는 attempt 상태와 lease token을 잠근 뒤 확인해 늦게 도착한 worker가 최신 상태를 덮지 못하게 한다.
- 불명확 취소는 최대 8회까지만 provider에 같은 idempotency key로 재시도하고, 초과 또는 환불정보 복구 불가 시 `manual_review`와 감사 event로 전환한다.
- 입금 완료 가상계좌 취소의 환불 계좌는 `PAYMENT_REFUND_DATA_KEY`로 암호화한 one-purpose ciphertext만 attempt에 저장하며, 완료·확정 실패 때 제거한다.
- HTTP status와 Toss 오류 code를 함께 분류해 timeout, rate limit, 이미 처리 중인 멱등 요청 등 재시도 가능한 오류를 영구 실패로 확정하지 않는다.
- webhook은 payment key 기반 DB rate limit, 공급자 재조회, event lease/dedupe를 함께 사용한다.

## 자동화한 QA 범위

| 계층 | 파일/도구 | 주요 검증 |
|---|---|---|
| 프런트 unit | `tests/frontend/*.test.mjs` | exact variant, PII storage 제거, 역할 권한, CAPTCHA fail-closed, 안전 URL, 주문/결제 계약 |
| 백엔드 unit/invariant | `tests/backend/*.test.mjs` | 주문 계산, hash/redaction, migration lock·권한·상태 전이·멱등성·reconciliation 불변조건 |
| Deno provider | `tests/backend/payment-provider.deno.test.ts` | mock 승인·실패·가상계좌·전액/부분취소 |
| contract | `tests/contracts/*.test.mjs` | HTML/JS/SQL/Edge 간 복구 계약과 금지 회귀 |
| E2E | `tests/e2e/reball.spec.mjs` | 주요 route, 360/390/768/1024/1440 viewport, 결제 복귀, storage, h1, overflow |
| 접근성 | `tests/e2e/accessibility.spec.mjs` | desktop/mobile serious/critical axe 위반, `color-contrast` 포함, 키보드·문서 구조의 핵심 회귀 |
| Edge 정적 검사 | `scripts/check-edge-functions.mjs` | 12개 Edge Function의 Deno type/check |
| SQL 정적 검사 | `scripts/check-sql.mjs` | migration 159 statements parser 검증 |
| build 설정 | `scripts/build.mjs`, `scripts/build-check.mjs` | 단일 엔트리, JS/CSS import 그래프·font/asset 복사, 공개 설정 주입/검증 |

## 실제 테스트 증거

### 최종 전체 회귀 — 2026-07-11

최신 결제 hardening을 포함한 소스에서 실행했다.

| 검사 | 실제 결과 |
|---|---|
| `npm run qa` | PASS, exit 0 |
| lint | PASS |
| build | PASS |
| Edge Function Deno check | PASS, 12/12 |
| SQL parser | PASS, 159 statements |
| 프런트 unit | PASS, 35/35 |
| 백엔드 Node 검사 | PASS, 25/25 |
| Deno 결제 provider 사례 | PASS, 14/14 |
| contract | PASS, 20/20 |
| E2E | PASS, 24/24, 34.6초 |
| a11y | PASS, 10/10, 20.5초, `color-contrast` 제외 0 |

### 추가 무결성 검사 — 2026-07-11

| 검사 | 실제 결과 |
|---|---|
| `npm audit` | PASS, 취약점 0 |
| secret scan | PASS, 검출 0 |
| `git diff --check` | PASS |

위 결과는 최신 로컬 소스의 자동 회귀 증거다. 실제 Postgres 또는 Toss 실연동 통과를 의미하지 않는다.

## 로컬 브라우저 검수

홈, 상품상세, 로그인, 관리자 route를 직접 열어 다음을 확인했다.

- 콘솔·페이지 오류: 0
- 페이지별 최상위 `h1`: 1
- 가로 overflow: 0
- 깨진 이미지: 0
- 비로그인 관리자 shell 노출: 0
- 서버 mutation이 없는 관리자 catalog 동작: UI 비활성 및 runtime fail-closed
- 홈 핵심 구매 흐름: 여섯 단계로 읽힘

자동 E2E는 360, 390, 768, 1024, 1440 viewport를 포함했다. 실제 기기와 실제 스크린리더 수동 검수는 별도 운영 전 점검으로 남는다.

## 로컬 Supabase 검증 제한

`npx supabase status`는 로컬 Docker engine pipe를 찾지 못해 실패했다. Docker를 임의 설치·기동하거나 원격 프로젝트에 대신 적용하지 않았다. 그 결과 다음 항목은 코드·정적 불변조건까지만 검증됐다.

- migration을 실제 Postgres에 적용하는 과정과 기존 데이터 호환성
- 동시 주문 transaction의 row lock, deadlock, lock timeout
- 회원·비회원·관리자 역할별 실제 JWT/RLS matrix
- 승인·취소·webhook·reconciliation 동시 실행
- Edge Function과 DB RPC의 end-to-end 오류 복구

이 제한은 환경 의존성일 뿐 소스 구현이 없다는 뜻은 아니지만, 운영 안전을 확정할 수 없는 핵심 이유다.

## 남은 구조 부채와 기능 제한

1. 8,015줄 `app.js`에 남은 router, state, catalog, cart, checkout, account, admin, UI renderer를 더 작은 모듈로 이동해야 한다.
2. 합계 14,669줄 CSS, 특히 11,122줄 `base.css`의 중복 selector와 후반 cascade override를 정리하고 visual regression을 다시 수행해야 한다.
3. 버튼·필드·카드·모달·토스트의 공통 렌더러 전환은 부분적이다.
4. 별도 서버 API가 구현되지 않은 관리자/고객 mutation은 안전을 위해 비활성화했다. 오작동은 차단했지만 해당 운영 기능이 완성된 것은 아니다.
5. `app-current.js`, `index-current.html`과 정의 전용 렌더러는 삭제 승인 전까지 보존한다.
6. 실제 DB/RLS/동시성은 HG-01~HG-02, Toss 자격증명·webhook·scheduler·환불 암호화 key·실결제는 HG-05~HG-09 승인 후 staging에서 검증해야 한다.

## 결론

자동 QA와 핵심 신뢰 경계 분리는 의미 있게 강화됐고, 현재 로컬 소스의 주요 회귀 검사는 통과했다. 다만 대형 엔트리/CSS의 구조 개선이 미완료이고 실제 DB·결제 공급자 통합 및 Vercel·Supabase 운영 배포 증거가 없으므로 Wave 5는 `REVIEW`다.
