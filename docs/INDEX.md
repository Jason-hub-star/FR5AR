# INDEX — 문서 지도

이 프로젝트의 문서를 찾아가는 단일 진입점. 세션 시작 시 `docs/SESSION-START.md`를 먼저 읽는다.

## 문서 목록

| 경로 | 역할 | 분류 | 언제 읽나 |
|---|---|---|---|
| `CLAUDE.md` | Claude 진입 문서. 5분 진입 순서, 하드 룰 6개, 검증 명령 | SSOT | Claude로 작업할 때 |
| `AGENTS.md` | Codex/OpenCode 진입 문서. 정찰·편집 위임 규약 | SSOT | 다른 에이전트가 작업할 때 |
| `docs/SESSION-START.md` | 세션 진입 캡슐. 문서 지도 | SSOT | 매 세션 시작 시 |
| `docs/ref/PRD.md` | 무엇을 왜. **목표(배치별 생산성)** · 기능 F1~F9 · 완료 판정 · 미확정 | SSOT | 범위가 헷갈릴 때 |
| `docs/ref/USER-REQUIREMENTS.md` | 사용자 요구정의서 — 페르소나 6 · UR 25 · SR 26 · 화면 14 | SSOT | **무엇을 만들지 정할 때 제일 먼저** |
| `docs/ref/FEATURE-SPEC.md` | 기능 F1~F9의 ID·우선순위·폴더·의존 관계 | SSOT | 무엇부터 만들지 정할 때 |
| `docs/ref/ARCHITECTURE.md` | **역할 분담(우리=시각화)** · 확장성 경계 · 폴더 구조 · 좌표계 · UI 토큰 규약 | SSOT | 구조·폴더·공용 디자인을 바꿀 때 |
| `docs/ref/STACK.md` | 확정 기술과 버전, AR 마커 방식 근거, 그리퍼, 함정 | SSOT | 라이브러리를 고를 때 |
| `docs/ref/API-CONTRACT.md` | REST/WS 계약. 상태·명령·조종권·이동지점·**배치안·지표 요구 모양** | SSOT | 서버·프론트·AR가 맞출 때 |
| `docs/ref/TB-CONTRACT.md` | **터틀봇 관제 계약** — 상태·teleop·슬롯·맵·기록·미래 접점 5 | SSOT | 터틀봇 브리지·웹을 짤 때 |
| `docs/ref/CODING-CONVENTIONS.md` | 단위·좌표계·안전·네이밍 규칙 | SSOT | 코드를 쓰기 전에 |
| `docs/ref/SAFETY-RULES.md` | 안전 판정 조건 19개와 SDK 필드 매핑, fail-closed 원칙 | SSOT | **로봇에 명령 보내는 코드 쓰기 전** |
| `docs/ref/MILESTONES.md` | **L1~L3(배치 실험)** + H0~V7(FR5 플랫폼) 단계와 완료 조건 | SSOT | 다음에 뭘 할지 정할 때 |
| `docs/ref/FR5-IMPLEMENTATION-PLAN.md` | **FR5 상세 계획** — 5패널·실기 게이트·슬롯·기록·수천 회 시뮬레이션 | SSOT | FR5 구현·범위·순서를 정할 때 |
| `docs/ref/AR-DEBUG.md` | AR 디버깅 — 화면 진단판 읽는 법 · 증상별 원인 · 자동화 한계 | SSOT | **AR이 안 될 때 제일 먼저** |
| `docs/ref/BUILD-VITE.md` | 앱(`AR`/`Dashboard`/`FR5`/`TurtleBot`)·`Shared` 경계 · 파일 귀속 · 게이트 경로 | SSOT | **폴더·빌드·의존성을 건드릴 때** |
| `docs/ref/SHARED-CORE.md` | 배치안 모델 · 단위 · 설정 · datasource — **두 폴더의 합의점** | SSOT | **데이터 모양을 건드릴 때 제일 먼저** |
| `docs/ref/CONSOLE-REACT.md` | 관제화면(React) 규약 — R3F 금지 · 목업 우선 · 상태 규약 | SSOT | React 화면을 짤 때 |
| `docs/status/PROJECT-STATUS.md` | 현재 상태 | 상태 | 세션 시작 시 |
| `docs/status/DECISION-LOG.md` | 결정 기록 | 상태 | "왜 이렇게 됐나" 할 때 |
| `docs/status/DECISION-LOG-CURRENT.md` | **최신 13건** 의 결정 원문 — 먼저 여기를 본다 | 상태 | 최근에 왜 그렇게 정했나 |
| `docs/status/GAP-MATRIX.md` | 스펙과 구현 사이 갭 감시판 | 상태 | 막힌 게 뭔지 볼 때 |
| `docs/evidence/2026-07-29/urdf-web-render.md` | 실렌더 검증 기록 | 증거 | 주장의 근거가 필요할 때 |
| `docs/evidence/2026-07-29/v3-feature-survey-limits.md` | v3 기능 조사의 **확인 범위와 한계** | 증거 | v3 기능을 옮기기 전에 |
| `docs/evidence/2026-07-30/sdk-state-fields.md` | SDK 상태 필드 150개 전수 — 비상정지·그리퍼·드리프트 확정 | 증거 | 안전 조건을 구현할 때 |
| `docs/evidence/2026-07-30/gripper-mount.md` | 그리퍼 장착값 실측 — 플랜지 간격 0.00mm 확인, 함정 4개 | 증거 | 그리퍼·URDF 확장을 건드릴 때 |
| `docs/evidence/2026-07-30/marker-detect.md` | 마커 검출 **합성 이미지** 실측 — 크기보다 대비, 워밍업 수십 프레임 | 증거 | 마커·인쇄를 다룰 때 (임계값은 아래 실기판이 정본) |
| `docs/evidence/2026-07-31/marker-live-phone.md` | 마커 검출 **폰 실기** — 24px 기준이 2배 비관적 · AR.js 기본 해상도가 병목 · 35mm 1.8m 100% | 증거 | **AR 인식률·마커 크기를 정할 때 제일 먼저** |
| `docs/evidence/2026-07-30/vite-gate.md` | Vite 관문 — 빌드 통과, JS gzip −26%, 죽은 파일 1개 | 증거 | 번들러·의존성을 바꾸기 전에 |
| `docs/evidence/2026-07-31/dashboard-copy.md` | 메인뷰 문구 교체 실렌더 — **코드 게이트가 통과시킨 결함 2개를 실렌더가 잡았다** | 증거 | 화면 문구·레이아웃을 바꿀 때 |
| `docs/evidence/2026-07-31/dashboard-save-undo.md` | 편집 저장·되돌리기 왕복 실렌더 9항목 — 저장 갭을 닫은 근거 | 증거 | 편집 저장·되돌리기를 건드릴 때 |
| `docs/evidence/2026-07-31/dashboard-coord-input.md` | 좌표 직접 입력 실렌더 11항목 — **"보여줄 값의 정본이 어디인가"가 낳은 결함 3개** | 증거 | 화면에 값을 표시·편집하게 만들 때 |
| `docs/evidence/2026-07-31/dashboard-deploy.md` | 관제화면 배포 — **배포본을 실제로 클릭해서야 나온 결함 3개** (조사·클릭 스냅·미리보기 잔류) | 증거 | 배포하기 전 · 입력 상호작용을 건드릴 때 |
| `docs/evidence/2026-07-31/tb-계약감사.md` | TB-CONTRACT 착수 전 감사 — 렌즈 5개 · 발견 21건 전건 반영 | 증거 | 터틀봇 계약의 근거가 필요할 때 |
| `docs/evidence/2026-07-31/tb-ui-reference.md` | TB 관제 UI 레퍼런스 목업 3장 — P1 의 시각 기준 | 증거 | 터틀봇 화면을 짤 때 |
| `docs/evidence/2026-07-31/tb-mock-verify.md` | TB 검증 4판(웹·브리지·사이클 mock + 우분투 실기) 61항목 — 결함 6·실주행 보류 | 증거 | 터틀봇 웹·브리지·실기를 고칠 때 |
| `docs/evidence/2026-07-31/fr5-live-readback.md` | **FR5 실기 readback** — 네트워크·펌웨어·6축·TCP, 명령 호출 0건 | 증거 | FR5 프로필·브리지·실기 연결을 다룰 때 |
| `docs/evidence/2026-07-31/ar-record.md` | **AR 화면 녹화** — 합성 레이어를 픽셀로 검증. 자동화 탭에서 rAF 가 안 도는 벽 | 증거 | AR 을 영상으로 남길 때 · 캔버스 합성을 건드릴 때 |
| `docs/evidence/2026-07-30/doc-weight.md` | 문서 적재 실태·임계값 출처·하네스 이식 판정 | 증거 | 문서가 무거워졌을 때 · 하네스를 더 가져올 때 |
| `docs/ref/unity/unity-bridge-protocol.md` | **유니티가 실기에서 검증한 값** — IP·포트·타임아웃·브링업 순서·함정 8개 | 참고 | **브리지 서버를 짤 때** |
| `docs/evidence/2026-07-30/ar-baseline.md` | **AR 이관 기준값 7개** — 뜯기 전 배포본에서 뽑았다 | 증거 | **이관 후 대조할 때** |
| `docs/ref/SLICE-AR-DEMO.md` | AR 실증 슬라이스 계획 — 5단계·정합 오차 실측 | 조사 | AR 슬라이스 착수 시 |
| `docs/ref/rnd/V3-PORT-CONVERGE-LOOP-2026-07-29.md` | v3 이식 계획 수렴 루프 — 크럭스와 킬-실험 | 조사 | 착수 전 판단이 필요할 때 |
| `docs/ref/rnd/NEXT-REFACTOR-2026-07-30.md` | 구조 개편 선택지 — 프레임워크·폴더·이름 | 조사 | **다음 세션 착수 시** |
| `docs/ref/rnd/MIGRATION-CONVERGE-LOOP-2026-07-30.md` | 이관 계획 수렴 루프 — 크럭스와 킬실험. 결함 10개 중 2개 사살 | 조사 | **이관 착수·재개 시** |
| `docs/ref/rnd/AMR-TWIN-DIRECTION-2026-07-30.md` | **AMR 2대·트윈·ROI 방향 판단** — 실기↔AR 방향 · 마커 재고 · 에셋 · 관제 통합 | 조사 | **새 방향 착수 전** |
| `README.md` | 깃허브 첫 화면. 팀원용 진입 문서 | SSOT | 저장소를 처음 볼 때 |
| `docs/research/README.md` | 조사 산출물 3건과 승격된 곳 | 조사 | 조사 원본을 볼 때 |
| `docs/goals/GOAL-editor-copy.md` | 사다리 1/3 — 메인뷰 문구를 사실로·해요체로 | 계약 | **메인뷰 문구를 고칠 때** |
| `docs/goals/GOAL-editor-undo-save.md` | 사다리 2/3 — 되돌리기 한 단계 + 로컬 저장 | 계약 | 편집이 사라지는 갭을 닫을 때 |
| `docs/goals/GOAL-editor-coord-input.md` | 사다리 3/3 — 좌표 숫자 직접 입력 | 계약 | 격자 사이 값이 필요할 때 |
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
| `ref/` | 코드의 근거가 되는 문서 | SSOT |
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
> 웹 기준은 `docs/ref/CODING-CONVENTIONS.md`가 이긴다.
```

- 전문 복사가 아니라 **발췌**한다. 원본이 정본이고 이쪽은 사본이다.
- 웹 기준 문서와 충돌하면 **웹 기준이 이긴다.** 사본을 근거로 웹 코드를 바꾸지 않는다.

## 자가검증

- INDEX.md에 등재된 문서 행 개수 = 53/53
- PROJECT-STATUS.md의 "다음 한 걸음" 항목 개수 = 5/5
- PROJECT-STATUS.md의 "블로커" 항목 개수 = 3/3
