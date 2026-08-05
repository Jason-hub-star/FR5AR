// 데이터 출처를 아는 유일한 곳 (`SHARED-CORE.md` §4 · `ARCHITECTURE.md` §확장성).
// **화면은 fetch 를 부르지 않는다.** 목업 ↔ 실물 교체는 이 한 줄이다 — 그게 완료 판정이다.
//
// 형제 둘이 같은 패턴을 이미 돌린다 — `FR5/src/data/datasource/` · `TurtleBot/src/data/datasource/`.
// 저장을 팀 공유로 올릴 때(D46 · 이관 H) `./http.js` 를 만들고 이 줄만 바꾼다.
export { datasource } from './mock.js';
