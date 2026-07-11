# Deletion Candidates

이 문서는 삭제 승인 목록이다. 이번 로컬 보수에서는 원본·자산·중복 파일을 물리 삭제하지 않는다.

| 후보 | 근거 | 선행 조건 | 이번 처리 |
|---|---|---|---|
| `app-current.js` | 개발용 복제본이며 배포 엔트리 `app.js`와 372개 삽입/64개 삭제 차이가 있음 | 필요한 차이를 `app.js`에 병합하고 모든 회귀 테스트 통과 | 삭제하지 않음, 개발 서버 참조 제거 |
| `index-current.html` | 개발 서버만 우선 로드해 배포 HTML과 메타/스크립트가 다름 | `index.html` 단일 엔트리 E2E 통과 | 삭제하지 않음, 개발 서버 참조 제거 |
| `renderHomeHero()` 및 대응 `.home-hero*` | 정의-only dead code 후보 | 호출 0 재확인, 새 홈과 시각 비교 | 즉시 삭제하지 않고 최종 diff에서 재검토 |
| 정의-only 렌더러 14개 | 정적 호출 분석상 미사용 | 동적 호출/문자열 참조 0 확인 | 보존 |
| `해안.html`, `해안_files/**` | Meshy.ai 저장 페이지로 쇼핑몰 런타임과 무관 | 사용자 원본 삭제 승인 | 원본 보존 |
| 빈 `asset/` | GitHub의 `assets/`와 다른 로컬 폴더 | 사용자 확인 | 보존 |
| ZIP 8개 | 제품 이미지 원본 묶음 | 사용자 원본 삭제 승인 | 보존 |
| Blender `.blend1`, `pre_*` | 3D 작업 백업 | 사용자 원본 삭제 승인 | 보존 |

## 확인된 dead-code 후보

- `heroFrameAsset`
- `setPendingSignupEmail`
- `setPendingSignupLoginId`
- `siteUrl`
- `selectedPrice`
- `renderHomeHero`
- `renderHomeProtectedSectionImage`
- `renderTrustItem`
- `renderGradeCard`
- `renderProcessStep`
- `renderMypageSummary`
- `renderPaymentCard`
- `renderCustomerSummaryItem`
- `renderCustomerInfoCard`
- `renderCustomerFactList`

## 삭제 승인 후 절차

1. 안전 복사본 및 Git 상태 확인.
2. 각 후보의 정적/동적 참조 검색.
3. 개별 파일/함수 단위 삭제.
4. lint, build, unit, integration, E2E, 접근성 재실행.
5. 배포 preview에서 visual regression 확인 후 병합.
