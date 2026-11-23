# 리볼로스트볼 최종 작업 — Codex 관리 정본

구성일: 2026-11-24 KST. 관리 구성 완료, 사용자 PC 실행은 아직 확인되지 않음.

## 담당과 연결

| 역할 | 담당 | 기록 위치 |
| --- | --- | --- |
| 실행 순서·중단·재개·코드 수정 | 사용자 PC의 **로컬 Codex 한 세션** | 이 저장소의 `TASKS.json` |
| 사이트 조작 | 같은 PC의 기존 **ego(lite) + `/ego-browser`** | 실제 Space ID와 Page label |
| 코드·결과 검토 | ChatGPT 또는 별도 독립 검토자 | PR #37, CI, 제출된 결과 영수증 |
| 최종 승인·개인 인증 | 사용자 | 실제 지시의 시각·범위·출처 |

관리 정본은 `snsrkarhskfdk/reballlostball`, 브랜치는
`repair/mr-dr01-harness-declare-scope`, PR은 **#37**이다. 다른 프로젝트용
브라우저 Space나 Claude 작업 큐를 합치지 않는다. 같은 일을 처리하는 두 번째
Work/Codex 실행자를 만들지 않는다. Work에서 이 작업을 검토하더라도 브라우저
실행과 관리파일 쓰기는 지정된 로컬 Codex가 맡는다.

이 파일은 브라우저 연결 프로그램이나 상시 실행 서버가 아니다. 현재 ChatGPT
세션에서 사용자 PC에 새 연결을 만든 것도 아니다. Codex가 로컬에서 연결을
확인하고, 결과를 PR의 같은 파일에 반영해야 ChatGPT가 읽고 검토를 이어갈 수 있다.
결과 파일이 아직 로컬에만 있으면 공유 완료라고 보고하지 않는다.

## 지금 바로 할 일

2026-11-24 초기 상태에서 `R00`은 b2e17ad 코드의 실제 CI 증거로 완료돼 있다.
**초기 다음 작업은 R01 하나다.** 이후 세션에서는 갱신된 TASKS를 우선하고
이미 검증된 작업을 처음부터 반복하지 않는다.
로컬 Codex에서 `CODEX_START_KO.txt`를 읽고 실행한다. 기존 ego 설치와 로그인은
재사용한다. 브라우저 설치·기본 브라우저 변경·온보딩을 처음부터 반복하지 않는다.

1. 실제 checkout의 origin, 브랜치, 작업 트리 변경, 최신 원격 head를 확인한다.
   사용자의 미커밋 변경을 덮어쓰거나 강제 reset하지 않는다. 현재 경로는
   `git rev-parse --show-toplevel`로 확인한다. 오래된 AGENTS의 C: 경로 또는
   이 문서를 만든 Linux 경로를 사용자 PC 경로로 복사하지 않는다. 별도 작업
   공간이 필요하면 기존 사용자 작업 위치를 쓰고, D:는 실제 존재할 때만 쓴다.
2. 같은 PC에서 설치된 ego-browser의 명령 경로를 확인하고 `ego-browser skill`을
   전부 읽는다. 출력의 끝표시까지 확인한다. 설치본이 지원하는 API만 사용한다.
   이 저장소는 버전이 다른 TaskSpace/Page API나 Playwright 호출을 고정하지 않는다.
3. 기존 리볼 작업의 Space ID가 기록돼 있으면 같은 ID와 Page label로 재개한다.
   아직 기록이 없으면 해당 작업의 기존 Space를 확인하고, 없을 때만
   `리볼로스트볼 최종 검증`이라는 전용 작업 Space를 만든다. 실제 반환된 ID와
   담당 세션을 기록한다. 다른 작업 Space를 이름만 비슷하다는 이유로 가져오지 않는다.
4. TASKS의 테스트 origin을 열고 현재 URL, 실제 backend 프로젝트, 배포 ID/SHA,
   화면의 로그인 상태를 읽는다. Space 분리는 로그인 분리의 증거가 아니다.
   현재 사이트가 이전 배포여도 R01 연결 확인은 가능하지만 최신 코드 검증으로
   처리하지 않는다. 새 주문, 계정, 결제, 권한, 스케줄은 이 단계에서 만들지 않는다.
5. R01 영수증을 작성하고 검사한다. 연결되지 않으면 정확한 명령 오류와 재개
   조건을 `BLOCKED`로 기록한다. Space ID, 연결 완료, 테스트 성공을 지어내지 않는다.

## 남은 작업과 끝내는 기준

세부 판정 항목은 TASKS의 `acceptance`가 정본이다.

| ID | 작업 | 핵심 완료 기준 |
| --- | --- | --- |
| R00 | 코드 기준 | b2e17ad에 대한 Full QA #183와 DB grants #10 성공 |
| R01 | 로컬 연결 | 설치 가이드·실제 Space·담당자·TEST 대상과 로그인 상태 확인 |
| R02 | TEST 배포 | 승인된 코드 SHA, 프런트와 Edge, TEST 설정, 운영 불변 확인 |
| R03 | 회원·관리자 | 실제 인증, 주소 유지, 본인 주문·타인 접근 차단, 관리자 검색·배송 |
| R04 | TEST 승인 | 실제 제공자 인증, 주문·금액 일치, 승인 기록, 복귀·새로고침·복구 |
| R05 | TEST 취소·재시도 | 취소·환불 상태 일치, 재고 한 번 복원, 중복 처리 무해성 |
| R06 | 만료·대사 | 소유 테스트 자료로 만료·미만료·반복실행 확인, 스케줄 최종 상태 기록 |
| R07 | 운영 반영 준비 | TEST 증거 독립 검토, 소스 정리, DB/Edge/설정 계획, 백업·복구·인계안 |
| R08 | 운영 반영·인계 | 별도 승인한 범위와 지출한도 내 반영·실결제 확인·운영자 인계 |

이미 완료된 도메인 설정이나 과거 72/2 브라우저 실패를 다시 작업으로 만들지 않는다.
PR #36의 내용을 중복 구현하지 않는다. 운영 핫픽스의 핵심 코드는 현재 후보에
들어 있으며, PR #40을 별도로 무조건 병합해야 한다고 단정하지 않는다.

## 관리 명령

Node 22에서 저장소 루트 기준으로 실행한다. 이 명령들은 **상태를 읽고 검사**한다.
브라우저·배포·결제·원격 쓰기를 실행하거나 승인 값을 변경하지 않는다.

```text
node scripts/reball-release-control.mjs status
node scripts/reball-release-control.mjs validate
node scripts/reball-release-control.mjs receipt docs/operations/release-control/receipts/R00_20261123.json
```

`validate`는 VERIFIED 작업이 가리키는 실제 영수증 파일도 열어 작업 ID와
구조를 검사한다. `RECEIPT.template.json`은 미완성 양식이다. 실제 값으로 채워
`receipts/`에 별도 저장한다. 양식 자체가 검사에서 통과하면 안 된다. 검증기는 필수 증거 누락,
순서·환경·승인 불일치를 찾아내며, 증거 링크의 내용이나 외부 시스템의 진실성을
자동 보증하지 않는다. 완료 검토자는 링크·파일을 실제로 열어 결과를 대조한다.

## 단일 실행자와 중단·재개

- 시작 전 최신 TASKS를 읽고 `RUNNING` 또는 `WAITING_FOR_USER` 작업 및
  `execution.owner/run_id`를 확인한다. 사용자에게 제어권을 넘긴 작업도 실행
  자리를 유지하므로 그동안 다른 브라우저 작업을 시작하지 않는다.
  다른 실행자가 있으면 동시에 시작하지 않는다. 기존 실행자가 살아 있는지 확인하고
  명시적으로 인수인계된 경우에만 같은 작업을 재개한다. heartbeat가 오래됐다는
  이유만으로 결제·배포를 다시 수행하지 않는다.
- 시작할 작업 한 개를 `RUNNING`으로, 실제 세션·run ID·현재 시각을 기록한다.
  브라우저 작업 전 공유 관리 상태에 소유권을 반영하고 원격 반영 성공을 확인한다.
  원격 접근이 안 되면 독립 실행자를 늘리지 말고 현재 세션 하나만 유지한다.
- 한 checkout의 상태 검사는 분산 잠금이 아니다. 여러 복제본에서 동시에 시작할 수
  있으므로 기존 브랜치에 최신 head를 기준으로 정상 fast-forward 반영하고, 충돌하면
  원격 상태를 다시 읽는다. force push와 소유권 강탈로 충돌을 해결하지 않는다.
- 작업마다 `run_id + task_id + action_id`를 기록한다. 주문·결제·취소의 민감한
  식별자는 기존 앱의 안전한 세션/서버에 둔다. 결과가 불명확한 동작은 같은 주문의
  현재 상태를 먼저 조회하고 기존 idempotency 규칙을 따른다. 새 주문으로 우회하지 않는다.
- 사용자 인증·CAPTCHA·약관 동의·개인 결제 인증이 필요하면 설치본에 문서화된
  handoff를 호출하고 `WAITING_FOR_USER`와 정확한 조치·재개 검사를 남긴다.
  사용자가 제어권을 가진 동안 자동으로 되찾지 않는다. 완료 통보 후 같은 Space에서
  화면·계정·환경을 다시 읽는다. 실제 카드가 없다는 기존 조건을 보존한다.
- 작업이 끝나면 영수증을 먼저 저장·검사하고 필요한 증거를 독립 검토한다.
  합격한 경우에만 `VERIFIED`와 증거 경로를 기록한다. 실패/차단을 성공으로 바꾸지 않는다.
  마지막에 Space의 문서화된 종료 API를 호출하고 실제로 필요한 결과 페이지를 유지한다.

## 승인과 환경

현재 사용자 요청은 실행 관리 구성을 만드는 것이다. 11/7의 **PR 수정 허용 /
배포 금지**는 TEST 배포에 대한 명시적 새 승인 전까지 유지한다. 10/22의 더 넓은
과거 허용을 최신 제한보다 우선하지 않는다. 이번 구성에서 승인 대기는 요청되지
않은 새 승인 절차를 강제하려는 뜻이 아니다. 실제 세션에 해당 행위·대상에 대한
유효한 승인이 이미 있으면 그 출처를 기록하고 다시 묻지 않는다.

승인 기록은 `authorization.records`에 다음 필드로 남긴다.

```text
capability, status=APPROVED, source, approved_by=USER, approved_at,
scope.project_ref, scope.code_sha
```

배포 승인은 해당 코드 SHA를 명시하고, 코드와 무관한 테스트 계정 설정 등은
실제 승인 범위가 그렇게 주어졌을 때만 `scope.code_sha:null`을 허용한다.
해당 최상위 상태와 근거 기록이 모두 일치해야 한다. 관리파일 편집이나 0건인
테이블을 읽은 것 자체는 승인이 아니다. 테스트 키라는 이유만으로 사용자 인증·
약관 동의 규칙을 건너뛰지 않는다. 별도 과금 API, 운영 배포, 운영 SQL·Edge 변경,
실고객 주문, 실결제·환불, 키 교체는 현재 승인 범위에 없다.

모든 변경 직전에 origin, deployment ID, deployed SHA, Supabase project ref,
화면 계정과 실제 연결을 다시 확인한다. TEST는 `aohziyemqxfhpbbqpicx`, 운영은
`qbftalhhyfcndanrcwpy`다. TEST 설정이 비어 운영 기본값으로 연결되면 중단한다.
새 TEST 배포로 URL이 바뀌면 실제 배포 결과와 허용 범위를 검증한 뒤 보드를 갱신한다.

`code_sha`는 검증할 애플리케이션 코드, `deployed_sha`는 실제 배포,
`orchestration_sha`는 실행자가 읽은 관리파일의 Git HEAD다. 관리 구성 전에 실행된
R00의 기존 CI 영수증만 `source_kind:HISTORICAL_CI_IMPORT`와
`orchestration_sha:null`로 해당없음을 표시한다. 로컬 실행 결과에는 실제 관리파일
HEAD가 필수다. 서로 같다고 가정하지 않는다. 현재 코드 기준은 b2e17ad이고 기존 TEST는 41684cf다. R01 연결 확인 외의
TEST 합격 영수증은 실제 배포와 검증 코드가 일치해야 한다. 코드가 바뀌면 새 코드
커밋의 CI를 확인하고 기준·승인을 갱신한 뒤 영향받는 검증을 다시 연다.

## 기록·공유·다음 세션

API 키, 비밀번호, 쿠키, 액세스 토큰, 결제키, 복귀/주문조회 capability,
개인 주소·전화번호를 Git이나 영수증에 넣지 않는다. 스크린샷은 민감정보를
가린 결과만 공유하고 `artifacts`에 경로·SHA256·`redacted:true`를 기록한다.
기존 테스트 주문 7건은 자동 삭제·초기화·일괄 취소 대상이 아니다.

영수증을 검증한 뒤 담당 Codex가 TASKS와 가린 증거를 기존 브랜치에 반영한다.
앱 코드가 변경됐다면 의미 있는 회귀와 새 정확한 커밋의 CI까지 확인한다.
`vercel.json`의 이 브랜치 자동배포 비활성 설정을 유지한다. 결과마다 새 PR이나
중복 관리 패킷을 만들지 않는다. 사용자에게 보낼 최소 결과는 아래와 같다.

```text
실제 모델 / 추론 설정 / run_id / Space ID
완료한 task_id와 결과 / code_sha / deployed_sha / orchestration_sha
영수증 경로 / 반영 commit / 관련 CI·배포 링크
남은 차단 사유 / 필요한 사용자 조치(있을 때만) / 다음 작업 한 개
```

ChatGPT에 위 결과 또는 반영된 커밋을 알려주면 같은 PR과 영수증에서 검토를
이어갈 수 있다. 관리파일이 있다고 백그라운드 상시 실행·자동 감시가 시작된 것은
아니다. 사용자 PC 세션이 종료되면 다음 Codex 세션이 이 상태를 읽고 재개한다.

## 근거

- [현재 코드 검증](https://github.com/snsrkarhskfdk/reballlostball/actions/runs/45170818242)
- [직전 출시 점검](../RELEASE_CLOSURE_20261123.md)
- [기존 실행·승인 경계](../CHECKOUT_EXECUTION_20261107.md)
- [ego(lite) Windows Codex](https://www.egolite.ai/document/ko/docs/windows/codex)
- [설치본 런타임 가이드 우선](https://www.egolite.ai/document/en/docs/windows/ego-browser)
- [Space 재개·계정 확인·handoff](https://www.egolite.ai/document/en/docs/windows/space)
- [Codex 실행환경과 권한](https://www.egolite.ai/document/en/docs/codex)
