# tb-bridge P4 실기 — 우분투에 real 어댑터 배포·기동, 실렌더 6/6 (로봇 실주행 제외)

일시: 2026-07-31 · 대상: 우분투 PC `ej@192.168.11.2` (Ubuntu 24.04 · ROS 2 Jazzy) ·
방법: 맥에서 SSH 오케스트레이션(expect)으로 코드 전송·기동, 맥 브라우저(CDP)로
`http://192.168.11.2:5055` 실렌더. 재실행 `scripts/check/tb-real-verify.mjs`(브리지 기동 시).

## 무엇을 했나

- repo2(eduwing-robotics/ros2-ai-amr-repo2) 원본 대조로 `real.py` 작성 — TwistStamped ·
  `/{ns}/cmd_vel` · `/{ns}/amcl_pose`→odom 폴백 · 워치독 2겹(teleop 500ms + odom 2s)
- 우분투에 코드 전송(tar+base64) → venv `--system-site-packages`(rclpy+fastapi 공존) →
  `TB_ADAPTER=real`로 브리지 기동. 브리지가 웹 빌드까지 서빙(팀원 URL 하나 구조)

## 실렌더 6항목 (맥→우분투, 전부 관측값)

우분투 브리지 웹앱 서빙(탭 3) · **`adapter:real` 배지**(rclpy 어댑터 물림) ·
로봇 카드 2대(config tb3_1·tb3_2) · **fail-safe** 로봇 bringup 전이라 둘 다 disconnected·연결 0/2 ·
슬롯 목록 로드 · 콘솔 에러 0. 스크린샷 `tb-p4-real.png`.

## 실기에서만 나온 결함 2 (맥에선 안 났다)

| # | 결함 | 근본 수정 |
|---|---|---|
| 1 | 우분투 로케일이 UTF-8 아님 → 한글 주석 파일 `read_text()` 크래시(500) | 모든 파일 IO에 `encoding="utf-8"` 명시 + 기동 스크립트 `LANG=C.UTF-8` |
| 2 | macOS tar가 끼운 `._*`(AppleDouble)를 슬롯으로 오인해 `ast.parse` 크래시 | slots 스캔에 `.` 시작 숨김파일 필터 |

두 결함 다 "맥 개발 → 리눅스 실행" 경계에서만 드러난다. 코드가 플랫폼을 방어하게 고쳤다.

## 확인 못 한 범위 (로봇 실주행 — WiFi 교체 후로 보류)

- **로봇 bringup 미실행** — 로봇 토픽이 어느 도메인(0·1·2·30·55·210)에도 없었다.
  connected:true · pose 흐름 · 저속 teleop · 실 SLAM/rosbag 은 로봇을 깨운 뒤에 가능
- WiFi 교체 예정 — IP·대역이 바뀐다. `config.yaml`(코드 밖)만 갱신하면 되게 설계돼 있으나
  실제 교체 후 재검증 필요
- real.py의 TwistStamped·amcl_pose 토픽명은 repo2 원본 대조값 — **실 토픽과의 최종 대조는 미실행**

## 다음 세션 재개

우분투에서 `bash ~/start-bridge.sh`로 브리지 재기동(코드는 `~/fr5tb/`에 있음).
로봇 bringup(도메인 0) 켜지면 배지가 connected로 바뀐다.
