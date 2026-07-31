// 데이터 출처를 아는 유일한 곳 (Dashboard 규칙 미러 — ARCHITECTURE.md §확장성).
// 화면은 fetch 를 부르지 않는다. mock ↔ http 교체는 이 한 줄이다.
// http = tb-bridge (bash scripts/dev/tb-dev.sh). 브리지 없이 화면만 볼 땐 './mock.js' 로.
export { datasource } from './http.js';
