분류: **SSOT**. 스펙과 구현 사이에 남은 갭을 추적하고, 다음 행동을 본다.

# GAP-MATRIX — 갭 추적

> 갭이 채워지면 상태를 `DONE`으로, 진행 중이면 `IN_PROGRESS`로, 팀 회의 대기면 `BLOCKED`로 바꾼다.

| 갭 | 영향받는 기능 | 상태 | 다음 행동 |
|---|---|---|---|
| 무대(배경) 미확정 | 시연 시나리오 작성 | **CLOSED (2026-07-30)** | 과학실험실 · 팔+AMR 배치별 생산성으로 확정 |
| `server/` 코드 없음 | F1~F6 전부 | OPEN | V0 브리지 뼈대부터 시작 |
| `web/` 코드 없음 | F1~F4 | **CLOSED (2026-07-30)** | `AR/` · `Dashboard/` 로 갈라 Vite 이관 완료 |
| URDF·STL 복사 | F2 | CLOSED (2026-07-29) | `scripts/assets/sync-from-unity.sh`로 자동화됨 |
| 그리퍼(PGEA-100-40)가 URDF에 없음 | F2 부분 | OPEN | URDF에 그리퍼 링크 추가. 통합형/분리형 STL 중 선택 |
| Fairino 파이썬 SDK가 PyPI에 없어 설치 경로 미확인 | V0 | BLOCKED | 공식 저장소에서 설치법 확인. 최신 파이썬에서 막히면 pip 패치본 조사 |
| 폰 HTTPS 접속 방식 미결정 (mkcert vs 터널) | V3 | BLOCKED | 개발 환경과 시연 환경에서 접속 방법 확정 |
| 기록 저장소 미정 (파일/SQLite/Supabase) | F6, V4 | BLOCKED | 저장 방식과 보존 기간 팀 회의에서 확정 |
| v3 기능이 실제 동작하는지 미검증 — 이름만 확인. V3 씬은 빌드에 없음 | F1·F3 | OPEN | 옮길 기능마다 원본 C# 직접 읽기. 안전 로직 우선 (`docs/evidence/2026-07-29-v3-feature-survey-limits.md`) |
| SDK 상태 패킷이 안전조건을 주는지 | V0 전체 | **CLOSED (2026-07-29)** | 킬-실험 통과 — 4개 값 전부 확인. `docs/ref/SAFETY-RULES.md` |
| 비상정지 신호의 SDK 필드명 | 안전 전체 | **CLOSED (2026-07-30)** | `EmergencyStop` 외 9개 확인. `docs/evidence/2026-07-30-sdk-state-fields.md` |
| **편집한 배치안이 저장되지 않는다** — 새로고침하면 사라진다 | L1 · L3 비교 | OPEN | `Shared/data/config/` 슬롯으로 내린다 (이관 H 단계와 같은 일) |
| Vercel 이 모노레포 workspaces 를 못 빌드한다 (하위 폴더 `npm install` 이 `@fr5/shared` 를 못 푼다) | 배포 자동화 | OPEN | 지금은 로컬 빌드 산출물 업로드 (D24). 루트 기준 설정은 AR 과 충돌하므로 보류 |
| `Dashboard/dist` 7.2MB 중 6.6MB 가 **아직 안 쓰는** URDF·그리퍼 STL | 배포 속도 | OPEN | `publicDir` 이 `Shared/assets` 전부를 복사한다. L2 에서 팔을 세우면 쓰인다 — 그때까지 방치 |
| 터틀봇 상판 마커 크기가 검출 한계인가 | AMR 위 가상 팔 | **CLOSED (2026-07-31)** | 35mm·1.8m·100% 확인. 단 `src=1280&cv=960` 필수 (`evidence/2026-07-31-marker-live-phone.md`) |
| **고해상도에서 fps 13~14** — 시각적으로 끊긴다 | AR 체감 품질 | OPEN | 검출 캔버스를 줄여도 그대로다 → 병목이 카메라 디코딩 쪽. 프레임 건너뛰며 검출하는 방식 검토 |
| **고정 카메라 경로가 아직 없다** — 맵 전체를 한 대로 찍고 AMR 위에 팔 | 시연 본편 | OPEN | 마커가 아니라 **호모그래피 4점 + 위치값**. 맵·카메라 위치 확정 후 착수. 색 검출은 사진 1장으로 먼저 판정 |
| AMR 위치(odom·AMCL)를 받을 수 있는지 미확인 | 고정 카메라 · 하이브리드 | BLOCKED | 팀원 ROS 쪽 확인 필요. 못 받으면 영상 색 검출로 우회 |
