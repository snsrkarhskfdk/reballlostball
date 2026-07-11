# 04 UI Hierarchy Report

## 판정

`WAVE 4 — REVIEW`

홈을 여섯 단계 구매 흐름으로 재배치하고 페이지별 단일 `h1`, 공통 버튼 높이·반경·상태, 키보드 focus, reduced motion, 반응형 overflow 검사를 적용했다. 로컬 Playwright와 axe 검사는 desktop/mobile 모두 통과했고, axe에서 `color-contrast` 규칙을 제외하지 않았다. 다만 기존 대형 CSS의 호환 selector와 cascade 부채가 남아 있고 실제 스크린리더·실기기 수동 검수 및 운영 배포 결과는 이번 로컬 판정에 포함하지 않았다.

## 홈 구매 위계

`renderHome()`의 실제 렌더 순서는 다음과 같다.

| 단계 | 섹션 | 주요 행동 |
|---:|---|---|
| 1 | 대표 메시지와 대표 상품 | “실제 재고 상품 보기”로 상품 영역 이동 |
| 2 | 등급·검수 신뢰 | 등급 기준, 단계별 검수, 실재 재고 기준 설명 |
| 3 | 실제 재고 베스트 상품 | exact variant가 있는 상품 탐색·상세 이동 |
| 4 | 배송·교환·반품 | 출고 마감, 무료배송, 반품 비용, 고객센터 확인 |
| 5 | 매장·사업자 신뢰 | 확정 주소·대표·사업자번호·운영시간·반품주소 보존 |
| 6 | 최종 commerce CTA | 실제 재고 상품 영역으로 복귀 |

각 섹션에는 `data-home-stage="1"`부터 `"6"`까지 고정 marker가 있으며 자동·브라우저 테스트에서 순서를 확인한다. 인기/추천/베스트 콘텐츠는 3단계 안에서 상품과 “추천 세트 미리보기”로 묶었다. 실제 bundle variant가 없는 세트는 구매 버튼을 disabled 처리해 마케팅 카드가 가상 재고를 만들지 않는다.

홈의 대표 hero만 `h1`을 사용하고 단계 제목은 `h2`, 카드 제목은 `h3`로 정리했다. 상품상세, 장바구니, 체크아웃, 로그인, 회원가입, 비회원 주문조회, 관리자 등 E2E 대상 경로도 `main h1` 하나를 노출한다.

## 버튼 시스템

공통 토큰은 `styles.css`의 production-readiness layer에 있다.

| 토큰/variant | 값/용도 |
|---|---|
| `--button-height-sm` | `44px` — compact와 icon target |
| `--button-height-lg` | `52px` — 기본 commerce action |
| `--button-radius` | `10px` — 공통 반경 |
| Primary commerce | `.primary-btn`, 골드 구매 CTA 호환 `.gold-cart-btn` |
| Secondary | `.secondary-btn` |
| Tertiary/Ghost | `.ghost-btn` |
| Icon | `.icon-btn` 및 기존 icon button 호환 selector |

hover, `:focus-visible`, active, disabled/`aria-disabled`, `.is-loading`/`aria-busy` 상태를 공통 layer에서 정의했다. icon control은 최소 44×44로 맞추고 장바구니, 메뉴, 닫기, 수량, 갤러리, 캐러셀 dot에 접근 가능한 이름을 제공한다. 화면에 보이는 `WISH`, `ADD` 동작명은 한국어 “찜하기”, “장바구니 담기” 의미로 교체했다.

기존 화면을 전면 재작성하지 않기 위해 `.light-btn`, `.outline-light-btn`, 일부 관리자·갤러리 selector를 네 semantic 유형에 매핑하는 호환층을 유지했다. 따라서 시각적 동작은 통일했지만 legacy 클래스 자체를 모두 제거한 것은 아니며 Wave 5 리팩터링 잔여로 기록한다.

## 접근성·상호작용

- `index.html`에 `본문으로 바로가기` skip link와 `app.js`의 `main-content` target을 연결했다.
- 모든 주요 페이지에 하나의 page-level `h1`을 보장했다.
- dialog에 `role="dialog"`, `aria-modal`, label, Escape 닫기, focus 이동/복귀 로직을 연결했다.
- 토스트와 결제 결과는 live region으로 상태를 알린다.
- 수량 증가·감소, 현재 수량, 옵션/상태, 메뉴 토글에 label·expanded·disabled 상태를 제공한다.
- 프로모션 캐러셀은 자동 timer로 전체 DOM을 주기적으로 교체하지 않는다. 사용자가 dot을 선택할 때만 갱신하며 갱신 후 focus를 복구한다.
- intro/스크롤 animation에는 `prefers-reduced-motion` 분기와 CSS의 전역 duration 축소를 적용했다.
- Supabase CDN이 즉시 실패하거나 응답 없이 지연되어도 top-level module 평가가 빈 화면을 붙잡지 않도록, 정적 storefront를 먼저 렌더하고 온라인 기능은 fail-closed하도록 구성했다.

## 반응형·브라우저 검증

### 최종 전체 QA

2026-07-11 최종 결제·취소·reconciliation 보강과 최종 UI/접근성 수정을 포함한 작업트리에서 전체 로컬 QA가 통과했다.

| 포함 검사 | 결과 | 확인 내용 |
|---|---|---|
| frontend unit | PASS, 35/35 | 홈 구조 marker, 버튼 token/상태, 주문번호 escaping 경계, Toss SDK 로드 재시도 회귀 포함 |
| E2E | PASS, 24/24 | production entry, 실제 공개 설정이 주입된 CDN 실패·지연 복원, 체크아웃 우편번호, Toss 승인 성공·실패 URL scrub, 8개 경로 단일 h1, 홈 6단계, admin 위조 차단, storage 정리, exact variant, 키보드 CTA |
| viewport 검사 | PASS, 360/390/768/1024/1440 | document-level 가로 overflow 없음 |
| E2E 실행 시간 | 34.6초 | 24개 시나리오 전체 완료 |
| a11y | PASS, 10/10 (20.5초) | desktop/mobile 홈·상품상세·장바구니·로그인·관리자, axe serious/critical 위반 0, `color-contrast` 제외 0 |
| lint / build / Edge | PASS / PASS / PASS 12/12 | 전체 QA 선행 단계 |
| backend / Deno / contract | PASS 25/25 / PASS 14/14 / PASS 20/20 | UI와 함께 실행된 전체 코드 회귀 |

별도 검사는 SQL parser 159 statements, `npm audit` 취약점 0, secret scan 검출 0, `git diff --check` PASS다.

접근성 검사에서 `color-contrast` 규칙을 제외하지 않았다. 다만 자동 규칙 통과는 실제 보조기기와 모든 운영 상태의 수동 검수를 대체하지 않는다.

## 남은 REVIEW 항목

1. Pretendard와 실제 자산이 로드된 상태에서 360/390/768/1024/1440 시각 스크린샷을 최종 사람 검수한다.
2. NVDA 또는 VoiceOver로 상품 옵션→장바구니→체크아웃→결제 복귀 흐름을 수동 검증한다.
3. 긴 한국어 이름, 큰 글자/200% zoom, 느린 이미지·동영상, 모바일 주소창 변화에서 잘림과 focus를 확인한다.
4. `styles.css`와 대형 `base.css`의 후반 호환층·중복 cascade를 기능 단위 CSS로 추가 정리한다.
5. 서버 API가 없는 변경 작업은 의도적으로 disabled 상태다. UI가 보인다는 이유로 해당 기능을 운영 완료로 판단하면 안 된다.

## HUMAN_GATE

- 외부 Vercel Preview와 운영 배포는 만들지 않았다. 실제 도메인·CDN·폰트·영상 조건의 검수는 HG-11 배포 승인 뒤에 수행한다.
- 확정 사업자, 배송, 교환·환불 문구와 브랜드 방향은 변경하지 않았다. 변경이 필요하면 HG-12 별도 승인을 받는다.
- 위의 스크린리더·확대/긴 텍스트 수동 검수는 배포 승인과 별개로 로컬에서 먼저 완료할 수 있으며, HUMAN_GATE로 미루지 않는다.

## 보존 사항

- 기존 브랜드 색, 실제 이미지·영상, 사업자·배송·교환·반품 문구를 임의로 바꾸지 않았다.
- 대용량 자산을 삭제하거나 재인코딩하지 않았다.
- 골드 CTA는 대표 구매 행동에 집중시켰다.
- `app-current.js`, `index-current.html`은 실행 경로에서 제거했지만 승인 없이 물리 삭제하지 않았으며 `DELETION_CANDIDATES.md`에 남겼다.

## 결론

홈 hierarchy와 핵심 접근성·반응형 회귀, 색상 대비를 포함한 axe 자동 규칙은 로컬에서 통과했다. 실제 보조기기·최종 시각 QA와 CSS 구조 정리, 외부 운영 배포 검증이 남아 있어 Wave 4 판정은 `REVIEW`다.
