# FR5 bridge 경계

FAIRINO FR5의 유일한 명령 관문이다. FastAPI 구현은 아직 시작하지 않았으며 계약은
`docs/ref/API-CONTRACT.md`가 정본이다.

예정 책임:

- 공식 Python SDK 연결과 33ms 상태 폴링
- WebSocket 상태 브로드캐스트와 REST 명령
- 조종권 한 명, 속도·관절 변화 상한, stop 예외, fail-closed
- robot profile 선택과 observe-only preflight. 현재 실기 `192.168.57.2:8080`은 기본값이 아니라 증거값
- Vision은 명령 대신 `POST /proposal`을 보내며 안전 게이트 통과분만 실행
- 지점·경로·슬롯·실행 기록의 API 경계
- 빌드된 FR5 웹 화면의 LAN 서빙

`robot_adapter/` 밖에서 FAIRINO SDK를 직접 import하지 않는다. C# SDK의 macOS readback은
통과했지만 Python SDK는 미확인이므로, 첫 구현은 Python 어댑터의 read-only 연결부터 확인하고
실패하면 브리지만 Linux에서 실행한다.
