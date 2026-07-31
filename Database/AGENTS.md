# Database — 스키마·마이그레이션 · **미착수**

무엇을 저장할지는 정해졌고 **어디에 저장할지는 안 정해졌다**
(파일 / SQLite / Supabase — `docs/ref/ARCHITECTURE.md` §아직 정하지 않은 것).

- 저장 후보 — 배치안 · 지표 실행 결과 · 명령/상태 기록(F6) · 이동 지점
- **화면이 여기를 직접 부르지 않는다.** `Shared/data/datasource/` 가 유일한 경계다.
  목업에서 실물로 바꾸는 작업이 **파일 한 개 교체**여야 한다
- 배치안 좌표는 **실험실 바닥 원점 기준 mm·도**로 저장한다 (SR_23).
  로봇 베이스 기준으로 저장하면 배치안끼리 비교가 불가능해진다
- 스키마를 만들기 전에 `docs/ref/API-CONTRACT.md` 를 먼저 고친다 (하드 룰 1)

## 폴더

아직 비어 있다. 착수하면 여기에 구조를 적는다.

읽을 것 — `docs/ref/SHARED-CORE.md` §datasource · `docs/ref/API-CONTRACT.md`
