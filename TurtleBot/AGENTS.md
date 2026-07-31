# TurtleBot — 자율주행 연계 · **미착수** (팀원 몫)

**AMR 을 우리가 몰지 않는다.** 우리는 경로를 그리고 이동거리를 표시한다
(`docs/ref/PRD.md` §범위 밖). 그 선을 넘으면 안전 책임이 우리에게 온다.

확장 지점은 **이미 둘 있다.** 새 구조를 만들 필요가 없다.

- **배치안의 `amr` 블록** — 도킹 위치 · 경로점(`waypointsMm`). `Shared/data/layout/`
- **`Shared/data/datasource/`** — 실시간 위치가 필요해지면 함수 하나가 는다.
  화면은 출처를 모르므로 바뀌지 않는다

미확정 — 기종이 터틀봇인지 팀 확인 필요 (`docs/ref/USER-REQUIREMENTS.md` §9.5)

## 폴더

아직 비어 있다. 착수하면 여기에 구조를 적는다.

읽을 것 — `docs/ref/SHARED-CORE.md` §배치안 모델
