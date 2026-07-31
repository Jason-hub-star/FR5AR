# SESSION-START — 세션 진입 캡슐

이 파일 하나만 읽고 필요한 SSOT를 찾아간다. 다른 문서를 미리 다 읽지 않는다.

## 한 줄 정의

**과학실험실에서 로봇팔과 자율주행로봇(AMR)의 배치에 따라 생산성이 얼마나 달라지는지** 재는
웹 작업대. 관제화면이 배치안을 편집하고 지표를 비교하며, 폰 AR이 그 배치안을 실제 바닥에
겹쳐 검증한다.

**우리 몫은 시각화다.** 생산성 수치를 내는 알고리즘과 AMR 자율주행은 팀원이 맡는다.
우리가 지킬 것은 **받는 모양을 먼저 제시하는 것**과 **나중에 백엔드·데이터베이스로
바꿔 끼울 수 있게 격리하는 것** 둘이다 (`ref/ARCHITECTURE.md` §우리 몫).

## 폴더 라우터 — 무엇을 건드리는지부터 정한다

**한 레포에 화면·로봇 도메인을 수직으로 둔다** — `AR/` · `Dashboard/` · `FR5/` ·
`TurtleBot/`, 공용은 `Shared/`다. 어디를 건드리는지 먼저 정하면 읽을 문서가 두 개로 줄어든다.
경계와 파일 귀속은 `docs/ref/BUILD-VITE.md`가 정본이다.

| 건드리는 것 | 폴더 | 읽을 것 (이 순서로) |
|---|---|---|
| 마커·카메라·정합·깜빡임·폰 화면 | **AR/** | `ref/AR-DEBUG.md` → `ref/BUILD-VITE.md` |
| 배치안 편집 · 생산성 지표 · FR5 상태 요약 | **Dashboard/** | `ref/CONSOLE-REACT.md` → `ref/SHARED-CORE.md` |
| FR5 조작 · 티칭 · 슬롯 · 경로 · 기록 | **FR5/** | `../FR5/AGENTS.md` → `ref/API-CONTRACT.md` |
| 그리퍼 장착값 · URDF · 관절 | **Shared/view3d/** | `evidence/2026-07-30/gripper-mount.md` → `ref/SHARED-CORE.md` |
| 마커 검출률 측정 | **AR/test/** | `evidence/2026-07-30/marker-detect.md` |
| **배치안 모양 · 단위 변환 · 설정** | **Shared/data/** | `ref/SHARED-CORE.md` ← **두 폴더가 같이 깨진다. 여기부터** |
| 지표 데이터가 어디서 오나 (목업↔실물) | Shared/data/ | `ref/SHARED-CORE.md` §datasource → `ref/API-CONTRACT.md` |
| 빌드·폴더·엔트리·의존성 | 루트 | `ref/BUILD-VITE.md` |
| FR5 브리지 (Python) | **FR5/bridge/** | `ref/API-CONTRACT.md` → `ref/ARCHITECTURE.md` |

**갈피가 안 잡히면 `Shared/`로 취급한다.** 공용을 한쪽 전용으로 착각하는 것이 그 반대보다 비싸다.

## 문서 지도

| 파일 | 무엇이 들어 있나 | 언제 읽나 |
|---|---|---|
| `docs/ref/PRD.md` | 무엇을 왜 만드는가, 완료 판정 | 범위가 헷갈릴 때 |
| `docs/ref/SHARED-CORE.md` | **배치안 모델 · 단위 · 설정 (두 폴더의 합의점)** | 데이터 모양을 건드릴 때 |
| `docs/ref/BUILD-VITE.md` | 폴더 경계 · 파일 귀속 · 빌드 | 폴더·의존성을 건드릴 때 |
| `docs/ref/CONSOLE-REACT.md` | 관제화면 규약 | React 화면을 짤 때 |
| `docs/ref/AR-DEBUG.md` | AR 진단판 · 증상별 원인 | **AR이 안 될 때 제일 먼저** |
| `docs/ref/ARCHITECTURE.md` | 로봇↔서버↔브라우저 구조 | 어디에 코드를 둘지 모를 때 |
| `docs/ref/STACK.md` | 확정된 기술과 버전, 검증 결과 | 라이브러리를 고를 때 |
| `docs/ref/API-CONTRACT.md` | REST·WebSocket 계약 **(SSOT)** | 서버·프론트 어느 쪽이든 |
| `docs/status/PROJECT-STATUS.md` | 지금 어디까지 | 세션 시작 시 |
| `docs/status/DECISION-LOG.md` | 왜 그렇게 정했나 | "이거 왜 이래?" 싶을 때 |
| `docs/evidence/YYYY-MM-DD/` | 날짜 폴더 안의 검증 기록 | 주장의 근거가 필요할 때 |

전체 목록은 `docs/INDEX.md`.

## 지금 단계

**AR 슬라이스가 폰에서 동작한다** (2026-07-30 실기 확인). 저장소 공개.
목표가 확정됐고(과학실험실 배치별 생산성), 그에 맞춰 **문서를 폴더 기준으로 갈랐다.**
코드는 아직 importmap 방식이다 — Vite 이관이 다음이다.

## 다음 한 걸음

`docs/status/PROJECT-STATUS.md`의 "다음 한 걸음" 항목을 그대로 실행한다.

## 하지 말 것

- 조사 리포트(`docs/research/`, 스크래치패드)를 SSOT로 취급하지 않는다
- API 계약을 코드에서 먼저 바꾸지 않는다
- 로봇에 실제 명령을 보내는 코드를 확인 단계 없이 넣지 않는다
- **`AR/` 과 `Dashboard/` 사이에 직접 import 하지 않는다** — 공유는 `Shared/`로만
- **배치안 좌표를 로봇 베이스 기준으로 쓰지 않는다** — 배치 비교가 불가능해진다
- **배포는 지시를 받고 한다** — 검증까지 하고 멈춘다
