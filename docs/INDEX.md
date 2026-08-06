# INDEX — 문서 지도

이 프로젝트의 문서를 찾아가는 단일 진입점. 세션 시작 시 `docs/SESSION-START.md`를 먼저 읽는다.

## 문서 목록

| 경로 | 역할 | 분류 | 언제 읽나 |
|---|---|---|---|
| `CLAUDE.md` | Claude 진입 문서. 5분 진입 순서, 하드 룰 6개, 검증 명령 | SSOT | Claude로 작업할 때 |
| `AGENTS.md` | Codex/OpenCode 진입 문서. 정찰·편집 위임 규약 | SSOT | 다른 에이전트가 작업할 때 |
| `docs/SESSION-START.md` | 세션 진입 캡슐. 문서 지도 | SSOT | 매 세션 시작 시 |
| `docs/ref/product/PRD.md` | 무엇을 왜. **목표(배치별 생산성)** · 기능 F1~F9 · 완료 판정 · 미확정 | SSOT | 범위가 헷갈릴 때 |
| `docs/ref/product/USER-REQUIREMENTS.md` | 사용자 요구정의서 — 페르소나 6 · UR 25 · SR 26 · 화면 14 | SSOT | **무엇을 만들지 정할 때 제일 먼저** |
| `docs/ref/product/FEATURE-SPEC.md` | 기능 F1~F9의 ID·우선순위·폴더·의존 관계 | SSOT | 무엇부터 만들지 정할 때 |
| `docs/ref/arch/ARCHITECTURE.md` | **역할 분담(우리=시각화)** · 확장성 경계 · 폴더 구조 · 좌표계 · UI 토큰 규약 | SSOT | 구조·폴더·공용 디자인을 바꿀 때 |
| `docs/ref/arch/STACK.md` | 확정 기술과 버전 · 그리퍼 · 함정 | SSOT | 라이브러리·부품을 고를 때 |
| `docs/ref/arch/DEPTH-CAM.md` | 손목 D435 — 장착 기하·화각 실측·Min-Z·유효 비율·USB | SSOT | 깊이가 안 나오거나 해상도를 고를 때 |
| `docs/ref/arch/AR-MARKER.md` | AR 마커 방식·번호·인쇄 규격·검출 실측(대비>크기) | SSOT | 마커를 인쇄하거나 검출이 안 될 때 |
| `docs/ref/contract/API-CONTRACT.md` | REST/WS 계약. 상태·명령·조종권·이동지점·**배치안·지표 요구 모양** | SSOT | 서버·프론트·AR가 맞출 때 |
| `docs/ref/contract/LAYOUT-METRICS-CONTRACT.md` | 배치안·생산성 지표 계약 — 관제화면이 편집하고 AR이 읽는다 | SSOT | 배치안 데이터·지표 모양을 맞출 때 |
| `docs/ref/contract/VISION-CONTRACT.md` | 비전 제안 계약 — `/proposal` 판정 3단·거부 사유·앵커 봉인 | SSOT | 비전이 로봇에 무엇을 제안할 수 있는지 정할 때 |
| `docs/ref/contract/PROGRAM-CONTRACT.md` | 프로그램 슬롯 계약 — 지점을 순서로 엮어 `draft→approve→step`, 한 단계씩 | SSOT | Program 화면·슬롯 실행을 짤 때 |
| `docs/ref/contract/TB-CONTRACT.md` | **터틀봇 관제 계약** — 상태·teleop·슬롯·맵·기록·미래 접점 5 | SSOT | 터틀봇 브리지·웹을 짤 때 |
| `docs/ref/arch/CODING-CONVENTIONS.md` | 단위·좌표계·안전·네이밍 규칙 | SSOT | 코드를 쓰기 전에 |
| `docs/ref/contract/SAFETY-RULES.md` | 안전 판정 조건 19개와 SDK 필드 매핑, fail-closed 원칙 | SSOT | **로봇에 명령 보내는 코드 쓰기 전** |
| `docs/ref/plan/MILESTONES.md` | **L1~L3(배치 실험)** + H0~V7(FR5 플랫폼) 단계와 완료 조건 | SSOT | 다음에 뭘 할지 정할 때 |
| `docs/ref/plan/FR5-IMPLEMENTATION-PLAN.md` | **FR5 상세 계획** — 5패널·실기 게이트·슬롯·기록·수천 회 시뮬레이션 | SSOT | FR5 구현·범위·순서를 정할 때 |
| `docs/ref/runbook/FR5-BRINGUP.md` | **FR5 브링업 절차** — 우분투 호스트에서 로봇 붙이는 5분 순서·증상별 조치 | SSOT | **로봇을 켜고 붙일 때 제일 먼저** |
| `docs/ref/runbook/AR-DEBUG.md` | AR 디버깅 — 화면 진단판 읽는 법 · 증상별 원인 · 자동화 한계 | SSOT | **AR이 안 될 때 제일 먼저** |
| `docs/ref/runbook/WORKCELL-MEASURE.md` | 작업셀 재기 — 상판·벽을 로봇 좌표계로 옮기는 일회성 실측 절차 | SSOT | 작업영역 게이트(조건 12)를 채울 때 · 작업대를 옮긴 뒤 |
| `docs/ref/arch/BUILD-VITE.md` | 앱(`AR`/`Dashboard`/`FR5`/`TurtleBot`)·`Shared` 경계 · 파일 귀속 · 게이트 경로 | SSOT | **폴더·빌드·의존성을 건드릴 때** |
| `docs/ref/contract/SHARED-CORE.md` | 배치안 모델 · 단위 · 설정 · datasource — **두 폴더의 합의점** | SSOT | **데이터 모양을 건드릴 때 제일 먼저** |
| `docs/ref/arch/CONSOLE-REACT.md` | 관제화면(React) 규약 — R3F 금지 · 목업 우선 · 상태 규약 | SSOT | React 화면을 짤 때 |
| `docs/status/PROJECT-STATUS.md` | 현재 상태 | 상태 | 세션 시작 시 |
| `docs/status/DECISION-LOG.md` | 결정 기록 | 상태 | "왜 이렇게 됐나" 할 때 |
| `docs/status/DECISION-LOG-CURRENT.md` | **최신 13건** 의 결정 원문 — 먼저 여기를 본다 | 상태 | 최근에 왜 그렇게 정했나 |
| `docs/status/GAP-MATRIX.md` | 스펙과 구현 사이 갭 감시판 | 상태 | 막힌 게 뭔지 볼 때 |
| `docs/evidence/2026-07-29/v3-feature-survey-limits.md` | v3 기능 조사의 **확인 범위와 한계** | 증거 | v3 기능을 옮기기 전에 |
| `docs/evidence/2026-07-30/sdk-state-fields.md` | SDK 상태 필드 150개 전수 — 비상정지·그리퍼·드리프트 확정 | 증거 | 안전 조건을 구현할 때 |
| `docs/evidence/2026-07-30/gripper-mount.md` | 그리퍼 장착값 실측 — 플랜지 간격 0.00mm 확인, 함정 4개 | 증거 | 그리퍼·URDF 확장을 건드릴 때 |
| `docs/evidence/2026-07-30/marker-detect.md` | 마커 검출 **합성 이미지** 실측 — 크기보다 대비, 워밍업 수십 프레임 | 증거 | 마커·인쇄를 다룰 때 (임계값은 아래 실기판이 정본) |
| `docs/evidence/2026-07-31/marker-live-phone.md` | 마커 검출 **폰 실기** — 24px 기준이 2배 비관적 · AR.js 기본 해상도가 병목 · 35mm 1.8m 100% | 증거 | **AR 인식률·마커 크기를 정할 때 제일 먼저** |
| `docs/evidence/2026-07-30/vite-gate.md` | Vite 관문 — 빌드 통과, JS gzip −26%, 죽은 파일 1개 | 증거 | 번들러·의존성을 바꾸기 전에 |
| `docs/evidence/2026-07-31/dashboard-l1-editor.md` | **L1 편집기 실렌더 5판 통합** — 문구·저장·되돌리기·좌표입력·배포본. 실렌더가 잡은 결함 12개 | 증거 | 화면 값 표시·편집·배포를 건드릴 때 |
| `docs/evidence/2026-07-31/tb-계약감사.md` | TB-CONTRACT 착수 전 감사 — 렌즈 5개 · 발견 21건 전건 반영 | 증거 | 터틀봇 계약의 근거가 필요할 때 |
| `docs/evidence/2026-07-31/tb-ui-reference.md` | TB 관제 UI 레퍼런스 목업 3장 — P1 의 시각 기준 | 증거 | 터틀봇 화면을 짤 때 |
| `docs/evidence/2026-07-31/tb-mock-verify.md` | TB 검증 4판(웹·브리지·사이클 mock + 우분투 실기) 61항목 — 결함 6·실주행 보류 | 증거 | 터틀봇 웹·브리지·실기를 고칠 때 |
| `docs/evidence/2026-07-31/fr5-live-readback.md` | **FR5 실기 readback** — 네트워크·펌웨어·6축·TCP, 명령 호출 0건 | 증거 | FR5 프로필·브리지·실기 연결을 다룰 때 |
| `docs/evidence/2026-07-31/ar-record.md` | **AR 화면 녹화** — 합성 레이어를 픽셀로 검증. 자동화 탭에서 rAF 가 안 도는 벽 | 증거 | AR 을 영상으로 남길 때 · 캔버스 합성을 건드릴 때 |
| `docs/evidence/2026-07-30/doc-weight.md` | 문서 적재 실태·임계값 출처·하네스 이식 판정 | 증거 | 문서가 무거워졌을 때 · 하네스를 더 가져올 때 |
| `docs/ref/unity/unity-bridge-protocol.md` | **유니티가 실기에서 검증한 값** — IP·포트·타임아웃·브링업 순서·함정 8개 | 참고 | **브리지 서버를 짤 때** |
| `docs/evidence/2026-07-30/ar-baseline.md` | **AR 이관 기준값 7개** — 뜯기 전 배포본에서 뽑았다 | 증거 | **이관 후 대조할 때** |
| `docs/ref/plan/SLICE-AR-DEMO.md` | AR 실증 슬라이스 계획 — 5단계·정합 오차 실측 | 조사 | AR 슬라이스 착수 시 |
| `docs/ref/rnd/AMR-TWIN-DIRECTION-2026-07-30.md` | **AMR 2대·트윈·ROI 방향 판단** — 실기↔AR 방향 · 마커 재고 · 에셋 · 관제 통합 | 조사 | **새 방향 착수 전** |
| `README.md` | 깃허브 첫 화면. 팀원용 진입 문서 | SSOT | 저장소를 처음 볼 때 |
| `docs/research/README.md` | 조사 산출물 3건과 승격된 곳 | 조사 | 조사 원본을 볼 때 |
| `docs/goals/GOAL-editor-copy.md` | 사다리 1/3 — 메인뷰 문구를 사실로·해요체로 | 계약 | **메인뷰 문구를 고칠 때** |
| `docs/goals/GOAL-editor-undo-save.md` | 사다리 2/3 — 되돌리기 한 단계 + 로컬 저장 | 계약 | 편집이 사라지는 갭을 닫을 때 |
| `docs/goals/GOAL-editor-coord-input.md` | 사다리 3/3 — 좌표 숫자 직접 입력 | 계약 | 격자 사이 값이 필요할 때 |
| `docs/goals/GOAL-live-gripper.md` | FR5 사다리 1/6 — 화면에서 그리퍼 개폐 | 계약 | **P3 착수 첫 칸** |
| `docs/goals/GOAL-teach-points.md` | FR5 사다리 2/6 — 자세를 지점으로 캡처·재로드 | 계약 | Teach 패널을 만들 때 |
| `docs/goals/GOAL-program-slots.md` | FR5 사다리 3/6 — 슬롯 승인·실행·복귀 | 계약 | Program 패널을 만들 때 |
| `docs/goals/GOAL-run-history.md` | FR5 사다리 4/6 — 실행 기록·되짚기 (경계만 확정) | 계약 | 착수 전 확장 · 비교는 관제화면 (D74) |
| `docs/goals/GOAL-servo-stream.md` | FR5 사다리 5/6 — 서보 스트리밍 (모방학습 선행) | 계약 | 정책·원격조종을 붙이기 전 |
| `docs/goals/GOAL-imitation-demo.md` | FR5 사다리 6/6 — 시연 학습·수행 (경계만 확정) | 계약 | 모방학습 착수 전 확장 |
| `docs/ref/README.md` | **ref 카테고리 표** — 새 SSOT 문서를 어느 폴더에 넣나 | SSOT | 문서를 새로 만들 때 |
| `docs/archive/ARCHIVE-INDEX.md` | 보관 문서 목록·이름 규칙 | 완료보존 | 옛 결정을 되짚을 때 |
| `docs/INDEX.md` | 문서 지도 | SSOT | 문서를 찾을 때 |

## 분류 기준

- **SSOT**: Single Source of Truth. 코드나 결정의 유일한 근거로 삼는다.
- **상태**: 현재 진행 상황과 막힌 지점을 기록한다.
- **증거**: 실렌더·검증 결과를 날짜별로 남긴다.
- **조사**: 사전 탐색 산출물. SSOT가 아니다. `docs/research/`
- **계약**: 골 브리프. **완료 판정 기준이 여기 있다.** 어느 에이전트가 실행해도 같은 증거로 판정한다. `docs/goals/`
- **완료보존**: 대체·폐기된 문서. 근거로 쓰지 않는다. `docs/archive/`

## 폴더 규약

**`docs/` 루트에는 `INDEX.md`와 `SESSION-START.md`만 둔다.** 나머지는 폴더로 간다.
`scripts/check/docs.sh`가 강제한다 — 루트에 다른 파일이 생기면 실패한다.

| 폴더 | 담는 것 | 분류 |
|---|---|---|
| `ref/` | 코드의 근거가 되는 문서. **루트에는 `README.md`만** — 카테고리 표가 거기 있다 | SSOT |
| `ref/product/` | 무엇을 왜 만드나 (PRD·요구정의·기능목록) | SSOT |
| `ref/contract/` | 두 쪽 이상이 맞출 모양 (API·TB·Shared·안전) | SSOT |
| `ref/arch/` | 구조·기술·코딩 규약 | SSOT |
| `ref/plan/` | 순서와 완료 조건 (마일스톤·구현계획·슬라이스) | SSOT |
| `ref/runbook/` | 현장 절차·증상별 조치 (브링업·AR 디버깅) | SSOT |
| `ref/rnd/` | 수렴 루프 같은 착수 전 판단 기록 | 조사 |
| `status/` | 현재 상태·결정·갭 | 상태 |
| `evidence/YYYY-MM-DD/` | 날짜 폴더 안의 검증 기록 | 증거 |
| `goals/` | 골 브리프 — 완료 판정 기준 (`GOAL-<slug>.md`) | 계약 |
| `research/` | 사전 조사 산출물 (팀 공유 HTML 등) | 조사 |
| `archive/` | 대체·폐기된 문서 | 완료보존 |

**완료된 문서는 지우지 않고 `archive/`로 옮긴다.** 이름에 사유와 날짜를 박고
`archive/ARCHIVE-INDEX.md`에 한 줄 올린다. 게이트가 이름 규칙과 등재를 검사한다.

`DECISION-LOG`는 archive로 옮기지 않는다 — 결정의 역사 자체가 정본이다.

## 새 문서 추가 규칙

1. `docs/INDEX.md`에 표로 등재한다.
2. SSOT 문서는 분류를 SSOT로 명시하고 상단에 "분류: SSOT"를 둔다.
3. Evidence는 `docs/evidence/YYYY-MM-DD/<주제>.md` — **날짜가 폴더**다.
   날짜를 파일명에 다시 붙이지 않는다. 게이트가 `evidence/` 루트의 파일을 실패로 잡는다.
4. **Unity 프로젝트에서 가져온 내용은 반드시 유니티 유래임을 명시한다** — 아래 참조.

## Unity 유래 문서 규약

FR5UNITY(Unity 프로젝트)에서 가져온 내용은 **웹 기준이 아니다.** 좌표계·단위·API가 다르다.
Unity의 Y-up 좌표와 C# API를 웹(three.js)에 그대로 적용하면 조용히 어긋난다.

- 위치는 **`docs/ref/unity/` 안에만** 둔다. `docs/ref/` 바로 아래에 두지 않는다.
- 파일명은 **`unity-` 로 시작**한다.
- 맨 위에 아래 배너를 그대로 넣는다. `scripts/check/docs.sh`가 배너 유무를 검사한다.

```markdown
> **출처: Unity 프로젝트 (FR5UNITY)** — 원본 `<원본 경로>`
> 이 문서는 **Unity 기준**이다. 웹(three.js)에 그대로 적용하지 마라 — 좌표계와 단위가 다르다.
> 웹 기준은 `docs/ref/arch/CODING-CONVENTIONS.md`가 이긴다.
```

- 전문 복사가 아니라 **발췌**한다. 원본이 정본이고 이쪽은 사본이다.
- 웹 기준 문서와 충돌하면 **웹 기준이 이긴다.** 사본을 근거로 웹 코드를 바꾸지 않는다.

## 자가검증

- INDEX.md에 등재된 문서 행 개수 = 60/60
- PROJECT-STATUS.md의 "다음 한 걸음" 항목 개수 = 5/5
- PROJECT-STATUS.md의 "블로커" 항목 개수 = 4/4 (**세는 단위는 불릿 행** — 해소된 2건의 취소선 행 포함)
