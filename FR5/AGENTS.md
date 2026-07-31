# FR5 — 웹 티칭 펜던트 + 로봇 브리지 · **구조만 준비**

이 폴더가 FR5 조작 기능의 수직 배포 단위다. `Dashboard/`는 배치·지표를 보여줄 뿐 명령을 보내지 않는다.

- 계약부터: `docs/ref/API-CONTRACT.md` → `docs/ref/ARCHITECTURE.md`
- 브라우저는 로봇과 직접 통신하지 않는다. 유일한 관문은 `bridge/`
- 안전은 `bridge/`에서만 강제: 기본 속도 10% · 관절 변화 5° · `stop`은 항상 통과
- 명령 주인은 한 명이며, 오류·연결 손실·소유권 불명은 fail-closed
- C# SDK macOS readback은 2026-07-31 실기 통과. Python SDK의 설치·macOS 연결은 별도 관문이다
- 기본 브링업은 observe-only: link/subnet → TCP → connect → version → state. 명령 승격 뒤에만 서보·모드를 바꾼다
- 화면에서 직접 `fetch`하지 않는다. `src/data/datasource/`로 목업↔실물을 바꾼다
- 실기 명령·엔드포인트는 문서를 먼저 바꾼 뒤 구현한다

## 폴더

| 경로 | 책임 |
|---|---|
| `src/` | Dashboard 토큰을 따르는 FR5 전용 웹 화면 |
| `src/features/` | 조작·티칭·슬롯·경로·기록 화면 경계 |
| `src/data/datasource/` | 화면과 브리지·DB 사이의 유일한 데이터 경계 |
| `bridge/` | FastAPI·안전·조종권·상태·웹 빌드 서빙 경계 |
| `bridge/robot_adapter/` | mock과 FAIRINO SDK 교체 경계 |

지금은 문서성 골격뿐이다. 패키지·런타임 코드는 착수 승인 전 만들지 않는다.
상세 순서와 5개 패널은 `docs/ref/FR5-IMPLEMENTATION-PLAN.md`를 따른다.
