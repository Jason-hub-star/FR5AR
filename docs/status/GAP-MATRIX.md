분류: **SSOT**. 스펙과 구현 사이에 남은 갭을 추적하고, 다음 행동을 본다.

# GAP-MATRIX — 갭 추적

> 갭이 채워지면 상태를 `DONE`으로, 진행 중이면 `IN_PROGRESS`로, 팀 회의 대기면 `BLOCKED`로 바꾼다.

| 갭 | 영향받는 기능 | 상태 | 다음 행동 |
|---|---|---|---|
| 무대(배경) 미확정 | 시연 시나리오 작성 | BLOCKED | 팀 회의에서 후보(작은 공장 부품검사·분류) 확정 |
| `server/` 코드 없음 | F1~F6 전부 | OPEN | V0 브리지 뼈대부터 시작 |
| `web/` 코드 없음 | F1~F4 | OPEN | `index.html` + three.js + URDF 로더부터 시작 |
| URDF·STL 복사 | F2 | CLOSED (2026-07-29) | `scripts/assets/sync-from-unity.sh`로 자동화됨 |
| 그리퍼(PGEA-100-40)가 URDF에 없음 | F2 부분 | OPEN | URDF에 그리퍼 링크 추가. 통합형/분리형 STL 중 선택 |
| Fairino 파이썬 SDK가 PyPI에 없어 설치 경로 미확인 | V0 | BLOCKED | 공식 저장소에서 설치법 확인. 최신 파이썬에서 막히면 pip 패치본 조사 |
| 폰 HTTPS 접속 방식 미결정 (mkcert vs 터널) | V3 | BLOCKED | 개발 환경과 시연 환경에서 접속 방법 확정 |
| 기록 저장소 미정 (파일/SQLite/Supabase) | F6, V4 | BLOCKED | 저장 방식과 보존 기간 팀 회의에서 확정 |
| v3 기능이 실제 동작하는지 미검증 — 이름만 확인. V3 씬은 빌드에 없음 | F1·F3 | OPEN | 옮길 기능마다 원본 C# 직접 읽기. 안전 로직 우선 (`docs/evidence/2026-07-29-v3-feature-survey-limits.md`) |
| SDK 상태 패킷이 안전조건을 주는지 | V0 전체 | **CLOSED (2026-07-29)** | 킬-실험 통과 — 4개 값 전부 확인. `docs/ref/SAFETY-RULES.md` |
| 비상정지 신호의 SDK 필드명 | 안전 전체 | **CLOSED (2026-07-30)** | `EmergencyStop` 외 9개 확인. `docs/evidence/2026-07-30-sdk-state-fields.md` |
