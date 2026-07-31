# TB 관제 mock 검증 3판 (P1 웹 · P2 브리지 왕복 · P3 전 사이클) — 55항목 전체 PASS

일시: 2026-07-31 · 방법: `/검증` CDP 하네스. 재실행 스크립트가 판정 그 자체다 —
`scripts/check/tb-web-verify.mjs`(웹, dev 필요) · `tb-bridge-verify.mjs` ·
`tb-cycle-verify.mjs`(브리지 — `bash scripts/dev/tb-dev.sh` 후). 전 검사가 관측값을 출력한다.

## P1 — 웹앱 골격 (mock 데이터소스) · 16항목

탭 3 · adapter 배지 · 로봇 카드 2 · 맵 캔버스 · claim→소유자 표시 · 슬롯 시작→mode=slot ·
로봇 이동(픽셀 diff) · E-STOP→idle+로그 · 계약 규칙 그대로 거부(조종권·상한 — 사유 문자열
일치) · 매핑 중 teleop 수락(계약 예외) · 기록 최신 estop · 콘솔 에러 0.

## P2 — tb-bridge 왕복 (FastAPI + mock 어댑터) · 20항목

WS 상태 100ms · hello 신원 · 로그 500줄 백로그 · curl 중복 claim 409 ·
**진짜 파이썬 프로세스**: example_patrol spawn(pid)→stdout 이 로그 패널로→E-STOP→SIGTERM→
스크립트 자체 정리 로그→run=estop 마감 · 거부 사유가 로그로 흐름 · 매핑 202 비동기 ·
맵 meta(mapToLab) 등재 · **1Hz 경로 샘플 + travelMm 자동 기입**.
스크린샷 `2026-07-31-tb-p2-{drive,runs}.png`.

## P3 — 전 사이클 · 9항목

매핑 시작 → **live.png**(stdlib 인코더 · 240×160 · 1s 폴링) 로드 → teleop 3초에 png
360→480b 성장(탐색이 실제로 깎임, `2026-07-31-tb-p3-mapping.png`) → `lab-p3` 저장·등재 →
주행 탭 드롭다운 활성화(nav starting→running) → 슬롯 주행 → rosbag 버튼(run 중만 활성) →
bagPath 기록 → 정지 stopped 마감 → 기록 행에 stopped·lab-p3·▣.

## 실렌더가 잡은 결함 4 (게이트·빌드는 전부 통과했었다)

| # | 결함 | 수정 |
|---|---|---|
| 1 | mock 과거 기록의 절대 타임스탬프가 미래가 돼 정렬 역전 | 상대 시각 |
| 2 | E-STOP 이 첫 화면 밖 | 사이드 맨 위로 |
| 3 | E-STOP 위험색이 명시도에 밀려 회색 | `button.estop` · computed `rgb(186,26,26)` 확인 |
| 4 | runs.py 고아 회수가 `.path.json` 까지 읽어 **브리지 기동 크래시** | path 파일 제외 |

## 구현이 계약을 고친 것 (문서 먼저 규칙 · D32 개정)

mapping 중 teleop 수락(맵은 몰아야 그려진다) · owner 검사 REST 는 body `who`.

## 검증 교훈

- 관측값 없는 검사는 실패 원인을 못 준다 — 전 검사에 실제 값 출력
- 슬롯은 SIGTERM 후 잔여 sleep(≤2s) 뒤 종료 — run 마감은 기다려서 판정
- "기록이 없어요" 자리 행도 `tr` — 행 개수가 아니라 데이터 행(배지)을 기다린다
- REST 로만 claim 한 클라이언트는 자동 해제가 없다 — release 는 스크립트 책임 (slots/README)

## 한계

mock 어댑터다 — rclpy·Nav2·실 rosbag·실 OccupancyGrid 는 P4(실기). 폰 터치 실기 미확인.
