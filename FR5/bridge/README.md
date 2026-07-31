# FR5 bridge 경계

FAIRINO FR5의 유일한 명령 관문이다. 계약은 `docs/ref/API-CONTRACT.md`가 정본이다.

구현됨 (P0 · 2026-07-31):

- robot profile 선택(`config.yaml`)과 observe-only preflight — 모델·6축·안전 필드 불일치는
  `FAIL_CLOSED` + 사유. 현재 실기 `192.168.57.2:8080`은 기본값이 아니라 증거값
- `/robots` `/connect` `/version` `/disconnect` `/state` `/ws/state` (33ms 브로드캐스트)
- `robot_adapter/` — mock(실측 기준 자세·결함 주입)과 fairino(미구현 — 연결 거부) 교체 경계
- 실행 `bash scripts/dev/fr5-dev.sh` · 검증 `node scripts/check/fr5-bridge-verify.mjs`

예정 책임:

- 공식 Python SDK 연결 (macOS 동작 확인 뒤 — 블로커)
- 조종권 한 명, 속도·관절 변화 상한, stop 예외 (P2)
- Vision은 명령 대신 `POST /proposal`을 보내며 안전 게이트 통과분만 실행
- 지점·경로·슬롯·실행 기록의 API 경계
- 빌드된 FR5 웹 화면의 LAN 서빙

`robot_adapter/` 밖에서 FAIRINO SDK를 직접 import하지 않는다. C# SDK의 macOS readback은
통과했지만 Python SDK는 미확인이므로, 첫 구현은 Python 어댑터의 read-only 연결부터 확인하고
실패하면 브리지만 Linux에서 실행한다.
