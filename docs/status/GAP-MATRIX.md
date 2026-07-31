분류: **SSOT**. 스펙과 구현 사이에 남은 갭을 추적하고, 다음 행동을 본다.

# GAP-MATRIX — 갭 추적

> 갭이 채워지면 상태를 `DONE`으로, 진행 중이면 `IN_PROGRESS`로, 팀 회의 대기면 `BLOCKED`로 바꾼다.

| 갭 | 영향받는 기능 | 상태 | 다음 행동 |
|---|---|---|---|
| 무대(배경) 미확정 | 시연 시나리오 작성 | **CLOSED (2026-07-30)** | 과학실험실 · 팔+AMR 배치별 생산성으로 확정 |
| `FR5/bridge/` 코드 없음 | F1~F6 전부 | OPEN | V0 브리지 뼈대부터 시작 |
| `web/` 코드 없음 | F1~F4 | **CLOSED (2026-07-30)** | `AR/` · `Dashboard/` 로 갈라 Vite 이관 완료 |
| URDF·STL 복사 | F2 | CLOSED (2026-07-29) | `scripts/assets/sync-from-unity.sh`로 자동화됨 |
| 그리퍼(PGEA-100-40)가 URDF에 없음 | F2 부분 | OPEN | URDF에 그리퍼 링크 추가. 통합형/분리형 STL 중 선택 |
| Fairino 파이썬 SDK가 PyPI에 없어 설치 경로 미확인 | V0 | BLOCKED | 공식 저장소에서 설치법 확인. 최신 파이썬에서 막히면 pip 패치본 조사 |
| macOS에서 FAIRINO C# SDK 직접 연결 가능 여부 | H0·V0 | **CLOSED (2026-07-31)** | 실물에서 version·6축·TCP readback 성공. Python SDK는 별도 갭 (`evidence/2026-07-31/fr5-live-readback.md`) |
| 같은 FR5라도 다른 개체 배정 시 IP·펌웨어를 고정값으로 오인 | V0~V7 | OPEN | robot profile + observe-only preflight로 모델·버전·6축·안전 필드 재검증 |
| 실물 그리퍼·tool/user·페이로드·충돌 형상 미보정 | V3·V5·V6 | BLOCKED | 현장 값 확정 전 시뮬레이션 후보를 “최적” 또는 실기 승인으로 승격하지 않는다 |
| 폰 HTTPS 접속 방식 미결정 (mkcert vs 터널) | V3 | BLOCKED | 개발 환경과 시연 환경에서 접속 방법 확정 |
| 기록 저장소 미정 (파일/SQLite/Supabase) | F6, V4 | BLOCKED | 저장 방식과 보존 기간 팀 회의에서 확정 |
| v3 기능이 실제 동작하는지 미검증 — 이름만 확인. V3 씬은 빌드에 없음 | F1·F3 | OPEN | 옮길 기능마다 원본 C# 직접 읽기. 안전 로직 우선 (`docs/evidence/2026-07-29/v3-feature-survey-limits.md`) |
| SDK 상태 패킷이 안전조건을 주는지 | V0 전체 | **CLOSED (2026-07-29)** | 킬-실험 통과 — 4개 값 전부 확인. `docs/ref/SAFETY-RULES.md` |
| 비상정지 신호의 SDK 필드명 | 안전 전체 | **CLOSED (2026-07-30)** | `EmergencyStop` 외 9개 확인. `docs/evidence/2026-07-30/sdk-state-fields.md` |
| **편집한 배치안이 저장되지 않는다** — 새로고침하면 사라진다 | L1 · L3 비교 | **CLOSED (2026-07-31)** | `localStorage` 저장 + 되돌리기 한 단계. 실렌더 9항목 확인 (`evidence/2026-07-31/dashboard-save-undo.md`). **천장 — 브라우저 한 대 안에서만 산다.** 팀 공유는 아래 항목 |
| 저장이 **브라우저 한 대 안에만** 있다 — 팀·기기 간 공유 불가 | L3 비교 · 팀 검토 | OPEN | `Shared/data/config/` 슬롯으로 올린다 (이관 H 단계) |
| `pointerup` 이 유실되면 편집기가 멈춘다 (`pointercancel` 미청취) | L1 사용성 | OPEN | **합성 이벤트에서만 재현됐다.** 실제 입력은 `setPointerCapture` 가 막는다 — 실사용에서 나오면 그때 고친다 |
| 격자 사이 좌표를 못 넣는다 (끌기가 100mm 에 붙는다) | L1 · 실측 치수 반영 | **CLOSED (2026-07-31)** | x·y·회전 숫자 입력. 실렌더 11항목 (`evidence/2026-07-31/dashboard-coord-input.md`) |
| `userData.item` 이 `{kind,id,type}` 만 담아 **회전을 안 실어 나른다** | 3D 노드에서 값을 읽는 모든 화면 | OPEN | 지금은 **배치안에서 직접 읽어** 우회했다. `Shared/view3d/props/index.js:162` 를 고치면 근본이 닫힌다 |
| **편집기를 폰에서 안 봤다** — 패널 접힘 · `SLOP_PX=4` 가 손가락에 맞나 | L1 폰 사용성 | **CLOSED (2026-07-31)** | 주인님이 폰에서 확인 — "잘됨". 자동화로는 세 번 다 막혔던 항목이다. **기종·수치는 안 남겼다** — 문턱을 다시 건드리면 그때 재확인한다 |
| 문서 무게 경고 4건 — PROJECT-STATUS 130줄(120) · DECISION-LOG 708줄(600) · INDEX 48행(45) · evidence 19개(15) | 진입 비용 | OPEN | 전부 soft 경고(게이트는 통과). **옮기는 것은 사람이 확인하고 한다**(D18). `bash scripts/check/docs-weight.sh --weekend` 로 이관 후보를 본다 |
| **고르기만 해도 편집이 생긴다** — 클릭 중 손이 1px 만 움직여도 격자로 스냅해 커밋 (`runN1` y 7620→7600) | L1 · 배치안 신뢰 | **CLOSED (2026-07-31)** | 끌기 문턱 `SLOP_PX = 4` 를 뒀다. 넘기 전에는 **메시도 데이터도 안 건드린다** (`interaction.js`). 배포본에서 확인 — 클릭 시 편집 0건, 끌기는 그대로 |
| 끌기가 끝나도 **미리보기 모드(`live`)가 안 꺼져** 패널이 놓은 자리에 얼어붙었다 | L1 · 배치안 신뢰 | **CLOSED (2026-07-31)** | 되돌리기를 해도 옛 좌표를 보여줬다. 커밋할 때 `live` 를 끈다 (`LayoutView.jsx`). 배포본에서 `6300,8000` → ⌘Z → `2600,7500` 확인 |
| 메인뷰가 **되는 기능을 "다음 단계"라고 적어 뒀다** | L1 사용성 | **CLOSED (2026-07-31)** | 문구 전면 교체 + 실렌더 확인 (`evidence/2026-07-31/dashboard-copy.md`). 판정 `ready-for-review` — 실제 폰은 아직 |
| 벽·문·창을 클릭해도 안 골라지는데 **화면이 이유를 안 알려준다** | L1 사용성 | OPEN | 의도된 제한이다(`userData.item` 없는 노드). 지금은 고치지 않고 기록만 — 실사용에서 오해가 나오면 그때 만든다 |
| Vercel 이 모노레포 workspaces 를 못 빌드한다 (하위 폴더 `npm install` 이 `@fr5/shared` 를 못 푼다) | 배포 자동화 | OPEN | 지금은 로컬 빌드 산출물 업로드 (D24). 루트 기준 설정은 AR 과 충돌하므로 보류 |
| `Dashboard/dist` 7.2MB 중 6.6MB 가 **아직 안 쓰는** URDF·그리퍼 STL | 배포 속도 | OPEN | `publicDir` 이 `Shared/assets` 전부를 복사한다. L2 에서 팔을 세우면 쓰인다 — 그때까지 방치 |
| Dashboard 기존 CSS가 새 의미 토큰을 아직 안 씀 (`--c-ok` 선택 탭 · 밝은 화면의 `color-scheme: dark`) | Dashboard·FR5 시각 통일 | OPEN | 다음 UI 구현 때 `--c-selected`·밝은 color-scheme으로 교체. 이번 변경은 문서·토큰까지만 |
| 터틀봇 상판 마커 크기가 검출 한계인가 | AMR 위 가상 팔 | **CLOSED (2026-07-31)** | 35mm·1.8m·100% 확인. 단 `src=1280&cv=960` 필수 (`evidence/2026-07-31/marker-live-phone.md`) |
| **고해상도에서 fps 13~14** — 시각적으로 끊긴다 | AR 체감 품질 | OPEN | 검출 캔버스를 줄여도 그대로다 → 병목이 카메라 디코딩 쪽. 프레임 건너뛰며 검출하는 방식 검토 |
| **고정 카메라 경로가 아직 없다** — 맵 전체를 한 대로 찍고 AMR 위에 팔 | 시연 본편 | OPEN | 마커가 아니라 **호모그래피 4점 + 위치값**. 맵·카메라 위치 확정 후 착수. 색 검출은 사진 1장으로 먼저 판정 |
| AMR 위치(odom·AMCL)를 받을 수 있는지 미확인 | 고정 카메라 · 하이브리드 | BLOCKED | 팀원 ROS 쪽 확인 필요. 못 받으면 영상 색 검출로 우회 |
| **AR 을 영상으로 남길 방법이 없었다** — 폰 내장 녹화는 버튼바까지 찍힌다 | 시연 · 증거 | **CLOSED (2026-07-31)** | ⚙ 에 [● 녹화]. 카메라+겹침만 합쳐 mp4. 합성 레이어를 픽셀로 확인 (`evidence/2026-07-31/ar-record.md`). 판정 `ready-for-review` |
| 녹화가 **진짜 카메라 영상과 합쳐지는지 못 봤다** — 가짜 카메라 캔버스로만 확인 | AR 녹화 신뢰 | OPEN | 자동화 탭에 웹캠이 안 붙는다. **폰에서 한 판 찍어 본다** — 그때 iOS 사파리 코덱도 같이 본다 |
| 녹화 중 **fps 비용 미측정** — 프레임마다 한 장 더 그린다 | AR 체감 품질 | OPEN | 이미 13~14fps 다. 폰에서 `[측정 30초]` 를 녹화 전후로 돌려 차이를 잰다 |
| **실기가 낸 값이 기본값이 아니었다** — 마커 `#2`(실물은 `#5`) · AR.js 기본 해상도(58%) | AR 전체 | **CLOSED (2026-07-31)** | 배포본을 폰에서 열었더니 로봇이 안 떴다. `.env` 를 `#5`·45mm 로, `ar.js` 기본을 `src=1280&cv=960` 으로 (D40). 배포본에서 확인 |
| `FR5_MARKER_MM` 하한이 **설정 40 · 슬라이더 10** 으로 서로 달랐다 | 크기 시험 | **CLOSED (2026-07-31)** | 시트의 10~35mm 를 설정으로 못 박았다. `config.mjs` 를 10 으로 맞췄다 (D40) |
| **AR 새 배포본을 폰에서 안 봤다** — 마커 #5·새 기본 해상도 | AR 시연 | OPEN | `https://fr5ar.vercel.app/ar.html`. 로봇이 뜨는지 · 녹화본에 카메라 배경이 깔리는지 · fps 를 본다 |
