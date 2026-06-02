# AGENTS.md

이 작업 폴더는 REBALL LOSTBALL 홈/상품상세/Figma 컷시트 정리용 루트다. 새 채팅으로 이어 작업할 때 아래 내용을 먼저 읽고 현재 산출물의 출처를 혼동하지 않는다.

## 현재 작업 루트

- 현재 루트: `C:\Users\artis\Documents\리볼로스트볼`
- 로컬 정적 홈 시안: `index.html`, `app.js`, `styles.css`
- 정적 홈 자산: `assets\figma\*.png`
- 검증/스크린샷 산출물: `artifacts\`
- 옮겨온 Next.js 구현 폴더: `meodai-skill-color-expert-https-github\`
- 외부 원본 컴포넌트 이미지 폴더: `C:\리볼_로스트볼\상세 컴포넌트`
- 현재 기준 Figma 파일: `Reball Lostball 리디자인`
- Figma file key: `kk5ZQlHFzaMmgbwYufal7A`
- Figma 디자인 시스템 페이지: `02_디자인_시스템` (`16:2`)
- Figma 최종 컷시트 프레임: `RB/FinalAnswer/2026_06_02_Component_CutSheet` (`1266:2`)

## 폴더 역할

- `C:\Users\artis\Documents\리볼로스트볼`는 현재 대화에서 바로 실행하고 수정하는 얇은 작업 루트다.
- `meodai-skill-color-expert-https-github\`는 이전 대화에서 옮겨온 Next.js App Router 구현체와 문서/자산/QA 스크린샷이 들어 있다. 이름은 color-expert처럼 보이지만 실제로는 REBALL LOSTBALL 풀스택 작업물이 섞여 있으므로 단순 색상 스킬 폴더로 취급하지 않는다.
- `C:\리볼_로스트볼\상세 컴포넌트`는 사용자가 제공한 상세/홈 컴포넌트 이미지 원본 폴더다. Figma 컴포넌트 분해 작업에서 최우선 시각 기준으로 삼는다.

## 원본 이미지 기준

Figma 컷시트에서 컴포넌트를 분해할 때는 아래 두 파일을 1차 기준으로 삼는다.

- `C:\리볼_로스트볼\상세 컴포넌트\컴포넌트A.png`
  - 홈 컴포넌트 컷시트 원본.
  - 신뢰 혜택 카드, 등급 가이드, 상세 정보 카드, 4단계 주문 프로세스, 특징/혜택 카드, 하단 CTA, 다크/화이트 푸터의 기준 이미지다.
- `C:\리볼_로스트볼\상세 컴포넌트\컴포넌트B.png`
  - 실제 홈 화면 원본.
  - 헤더, 히어로, 베스트셀러 상품 카드, 등급 안내 와이드 카드, 15단계 검수 프로세스, 배송/주문 안내, 추천 세트, 최종 CTA, 푸터의 기준 이미지다.
- `붙여넣은 텍스트.txt`는 Figma 컷시트의 텍스트 추출본이다. 텍스트가 필요할 때 `-Encoding UTF8`로 읽는다.

## Figma 작업 규칙

- 기존 최종 컷시트 `1266:2`를 기준으로 보강한다.
- 중복 컴포넌트를 새로 만들지 않는다. 이미 있는 헤더, 히어로, 기본 상품 카드, 구매 패널, 상세 갤러리는 재사용 또는 참조 표기로 처리한다.
- 사용자가 “그대로 베껴오면서 컴포넌트 분류”를 요청한 경우, 임의 재해석보다 `컴포넌트A.png`, `컴포넌트B.png`의 실제 그래픽/이미지/배치 비율을 우선한다.
- 아이콘은 직접 벡터로 그리지 않는다. 원본 PNG에서 아이콘을 crop해 알맞은 크기로 이식한다.
- 골프공 이미지도 새로 그리지 않는다. 원본 PNG 또는 기존 `assets\reball-section-crops\...` 자산에서 crop/fit으로 사용한다.
- 겹치는 프레임, 중복 텍스트, 이전 저품질 임시 패널은 제거한다.
- 색상은 기존 RB 계열을 유지한다: Deep Fairway `#06140E`/`#0B3D2E`, Mint Soft `#EAF7F0`, Ivory `#F7F6EF`, White `#FFFFFF`, Line `#DCE5DD`, Gold CTA `#F2B544`.
- 색상 판단은 HSL보다 OKLCH/OKLAB 관점의 지각 일관성을 우선한다. 단, 기존 브랜드 토큰과 사용자가 제공한 캡처를 더 우선한다.

## 현재 Figma 컷시트 상태 메모

- 기존 컷시트에는 v1.0, v1.1 패널이 있고, 이전 새 채팅에서 만든 `RB/FinalAnswer/Home_Remaining_Extension_v1_2` (`1345:2`)는 원본 PNG를 충분히 반영하지 못해 품질이 낮다.
- v1.2를 계속 개선할 때는 수동 원형 glyph/텍스트 아이콘을 제거하고 PNG crop fill로 교체한다.
- 새로 정리한 crop 자산은 `artifacts\figma-crops\`에 저장하고, Figma에는 이미지 fill로 이식한다.
- 2026-06-02 보정 완료: `1345:2` 내부의 신뢰 카드, 상세 정보 카드, 15단계 프로세스, 배송 서비스 카드, 추천 세트, 푸터, 하단 CTA의 수동 glyph/딤플/수동 골프공 레이어를 제거하고 `컴포넌트A.png`, `컴포넌트B.png`에서 crop한 PNG fill로 교체했다.
- 현재 `1345:2` 검증 결과: 수동 placeholder 잔여물 0, PNG fill 누락 0, 패널 겹침 0.
- 최종 확인 스크린샷: `artifacts\figma-extension-v1_2-cleaned-graphics.png`, 이전 PNG 이식 확인본: `artifacts\figma-extension-v1_2-png-crop-final-3.png`, 하단 CTA 단독 확인: `artifacts\figma-panel-26-final.png`.
- 추가 보정: 서비스 아이콘, 추천세트 공/카트, 캐러셀 컨트롤, 특징/CTA 공은 원본 crop에서 가장자리 배경만 투명 처리한 `_clean.png` 자산을 사용한다. 원본 그래픽은 유지하고 사각 배경 겹침만 제거했다.
- crop 원본/contact sheet는 `artifacts\figma-crops\` 및 `artifacts\figma-crops-contact-final.png`를 참고한다.

## 개발/검증 메모

- 루트 정적 앱 명령:
  - `npm run lint`
  - `npm run build`
  - `npm run dev`
- 옮겨온 Next.js 앱 명령:
  - `cd meodai-skill-color-expert-https-github`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run test:e2e`
- 기존 사용자 변경사항은 되돌리지 않는다.
- Figma 작업 후에는 구조 검증을 한다: 패널 중복 0, 프레임 겹침 0, 텍스트 오버플로 0.

## 예약 명령 / 아직 실행하지 말 것

- 2026-06-02 사용자가 아래 작업을 예약 명령으로 남겼다. 지금 바로 실행하지 않는다.
- 실행 조건: 이 채팅의 작업뿐 아니라 같은 `리볼로스트볼` 프로젝트의 다른 채팅 작업까지 모두 끝났을 때만 실행한다. 다른 채팅에서 동일 프로젝트 작업이 진행 중이면 실행하지 않는다.
- 예약 명령의 기준 파일: `C:\Users\artis\.codex\attachments\12a85e42-9f94-409b-bf28-f17a0fc599c5\pasted-text.txt`
- 예약 작업:
  - 위 텍스트 파일은 상세 디자인 시스템이다.
  - 먼저 붙여넣은 텍스트 구역의 위계, 레이아웃, 아이콘, 색상, 프레임, 중앙 정렬, 이미지 FIT/중앙 배치, 글자 겹침 여부를 다시 정리하고 통일한다.
  - 통일 기준은 `REBALL LOSTBALL 최종 컴포넌트 컷시트`다.
  - 통일된 디자인 시스템을 기준으로 Figma `04_홈페이지`와 `05_상세페이지`에서 누락된 섹션을 새로 만들고, 모든 버튼/아이콘/컬러 값을 교체하거나 필요한 경우 새로 만든다.
  - 완료 전 검증: 글자 겹침 0, 프레임 밖으로 삐져나옴 0, 이미지 잘림 0, 아이콘 중앙 정렬, 버튼/컬러 위계 일관성.
