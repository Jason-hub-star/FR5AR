# TB-CONTRACT 실사용 시나리오 감사 — 발견 21건, 전건 계약 반영

일시: 2026-07-31 · 대상: `docs/ref/TB-CONTRACT.md` 초판 (코드 착수 전 게이트 P0.5)
방법: 렌즈 5개(온보딩 · 동시성 · 회복탄력성 · 보안 · 미래 접점) 워크스루.
**병렬 서브에이전트가 API 과부하(529)로 전멸해 5개 렌즈 전부 메인 모델이 직접 수행** —
스킬 폴백 규칙. 발견 근거는 전부 계약 원문 인용으로 대조했다.

## 발견과 반영

| # | 심각도 | 발견 | 반영 |
|---|---|---|---|
| C1 | P0 | mode 전이 규칙 부재 — slot 중 teleop 오면 cmd_vel 이중 발행 | §모드 전이 신설: 시작은 idle 에서만, 위반 거부 |
| C2 | P0 | WS 명령에 신원이 없어 "owner 만" 검사가 불가능 (계약 자체 모순) | `hello` 세션-신원 바인딩 신설 |
| R1 | P0 | 슬롯 SIGKILL 후 마지막 cmd_vel 잔류 — 로봇이 계속 굴러간다 | "프로세스 종료 시 브리지가 cmd_vel 0 발행" 안전표 추가 |
| C3 | P1 | 브라우저 닫으면 조종권 영구 잠김 | hello 세션 단절 10초 후 자동 release |
| C4 | P1 | estop 후 mode·owner·재개 절차 미명시 | estop→idle, owner 유지, 즉시 재시작 명시 |
| C5 | P1 | 슬롯 종료↔run.result 판정 규칙 부재 | exit0/stop/estop/그외 → 4값 매핑 명시 |
| R2 | P1 | 브리지↔로봇 연결 손실 판정 기준 부재 | 오도메트리 2s 무수신 → connected:false + poseAgeSec 필드 |
| R3 | P1 | 브리지 재시작 후 고아 run·프로세스 규칙 부재 | 기동 시 error 마감 + 자식 프로세스 동반 종료 명시 |
| S1 | P1 | release 가 타인 조종권을 풀 수 있다 | owner 일치 시만 성공(409) + 신뢰 전제 명시 |
| S2 | P1 | teleop 값 검증이 상한 초과만 정의 | 절대값 기준 + 비숫자·필드 누락 거부 |
| F1 | P1 | 지표 "어휘"만 같아선 MetricsCompare 가 못 먹는다 (겉모양 상이) | run.layoutId 추가 + metrics 에 FR5 지표 전체 객체 |
| F2 | P1 | 궤적 조회 API 부재 — amrTravelMm·배치안 겹치기 불성립 | 1Hz pose 샘플 + GET /runs/{id}/path + travelMm 자동 |
| O1 | P1 | activate·mapping 의 동기/비동기 미명시 (재기동 수십 초) | 202 비동기 + nav 필드(starting→running)로 완료 판정 |
| R4 | P2 | 매핑 시작자 이탈 시 SLAM 방치 | 명시적 save/stop 까지 유지 + 조종권자가 정리 가능 명시 |
| R5 | P2 | 디스크 축적 정책 부재 | 자동 삭제 없음 + 임계 미만 시 record 거부 |
| R6 | P2 | Nav2·SLAM 생사 필드 부재 | robots.{id}.nav 필드 추가 (O1 과 겸용) |
| S3 | P2 | 이름 규칙이 슬롯에만 | 슬롯·맵·robot id 공통으로 승격 |
| S4 | P2 | PATCH runs 병합 방식·크기 미정의 | 얕은 병합 + 64KB · TB_PARAMS 4KB |
| S5 | P2 | curl 허용·estop 스팸 지위 미명시 | 의도된 설계·수용 리스크로 명시 |
| F3 | P2 | mapToLab 입력 절차 부재 | PATCH /api/maps/{name} 신설 + 측정은 P4 |
| F4 | P2 | AR 이 겹칠 예정 경로 없음 | GET /api/robots/{id}/plan 이름 예약 |
| O2 | P2 | 슬롯 start 응답 의미 모호 | 202 = spawn 성공만, 생사는 상태·로그로 |
| O3 | P2 | 맵 없이 슬롯 시작 가능 여부 모호 | TB_MAP 빈 값 허용 + 스크립트 자가 검사 명시 |

## 성립 확인 (수정 불요)

- 접점① FR5 협업 — 협업 슬롯 의사코드 워크스루로 두 계약만으로 성립 확인
  (TB 는 rclpy 직접, FR5 는 WS 명령 + motionQueueLength 완료 판정)
- WS 재접속 복구 — 전체 스냅샷 방식이라 자가 치유 · 로그 500줄 버퍼 기존 명시
- 접점⑤ Vision — 이름 예약으로 충분

## 판정

P0 3건이 전부 "구현자마다 다르게 짜서 사고가 나는" 종류였다 — 코드 착수 전에 잡혔으므로
수정 비용 0. 미해결 취약점 0건, 보류 없음. **P0.5 게이트 통과.**
