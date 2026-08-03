# TB 관제 검증 4판 (P1 웹 · P2 브리지 · P3 사이클 mock + P4 우분투 실기) — 61항목 전체 PASS

일시: 2026-07-31 · 방법: `/검증` CDP 하네스. 재실행 스크립트가 판정 그 자체다 —
`scripts/check/tb-web-verify.mjs`(웹, dev 필요) · `tb-bridge-verify.mjs` ·
`tb-cycle-verify.mjs`(브리지 — `bash scripts/dev/tb-dev.sh` 후) ·
`tb-real-verify.mjs`(우분투 실기 브리지 기동 시). 전 검사가 관측값을 출력한다.

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

## P4 — 우분투 실기 브리지 (real 어댑터) · 6항목

대상 우분투 PC `ej@192.168.11.2` (Ubuntu 24.04 · ROS 2 Jazzy). 맥에서 SSH 오케스트레이션으로
코드 전송·기동, 맥 브라우저(CDP)로 `http://192.168.11.2:5055` 실렌더.

- repo2 원본 대조로 `real.py` 작성 — TwistStamped · `/{ns}/cmd_vel` · `/{ns}/amcl_pose`→odom
  폴백 · 워치독 2겹(teleop 500ms + odom 2s)
- 우분투 배포: tar+base64 전송 → venv `--system-site-packages`(rclpy+fastapi 공존) →
  `TB_ADAPTER=real` 기동, 브리지가 웹 빌드까지 서빙(팀원 URL 하나 구조)
- 실렌더 6/6: 웹앱 서빙(탭 3) · **`adapter:real` 배지**(rclpy 물림) · 로봇 카드 2대 ·
  **fail-safe** bringup 전이라 둘 다 disconnected·연결 0/2 · 슬롯 로드 · 콘솔 에러 0.
  스크린샷 `tb-p4-real.png`

### 실기에서만 나온 결함 2 (맥에선 안 났다)

| # | 결함 | 근본 수정 |
|---|---|---|
| 5 | 우분투 로케일이 UTF-8 아님 → 한글 주석 파일 `read_text()` 크래시(500) | 모든 파일 IO `encoding="utf-8"` + 기동 스크립트 `LANG=C.UTF-8` |
| 6 | macOS tar가 끼운 `._*`(AppleDouble)를 슬롯으로 오인해 `ast.parse` 크래시 | slots 스캔에 `.` 시작 숨김파일 필터 |

## 한계 (P4 로봇 실주행은 WiFi 교체 후로 보류)

- **로봇 bringup 미실행** — 로봇 토픽이 어느 도메인(0·1·2·30·55·210)에도 없었다.
  connected:true · pose 흐름 · 저속 teleop · 실 SLAM/rosbag 은 로봇을 깨운 뒤에 가능
- WiFi 교체 예정 — IP·대역이 바뀐다. `config.yaml`(코드 밖)만 갱신하게 설계됐으나 재검증 필요
- real.py 토픽명은 repo2 원본 대조값 — 실 토픽 최종 대조 미실행. 폰 터치 실기 미확인
- 다음 재개: 우분투 `bash ~/start-bridge.sh`(코드는 `~/fr5tb/`), 로봇 bringup(도메인 0) 켜면 connected
