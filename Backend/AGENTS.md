# Backend — 브리지 서버 (Python · FastAPI) · **미착수**

로봇의 **유일한 관문**이다. 클라이언트는 로봇과 직접 말하지 않는다.

- **착수 전 첫 관문** — 유니티에서 **macOS 직접 SDK 연결이 실패**했다.
  실패한 것은 C# 바인딩이고 **파이썬 SDK 가 macOS 에서 되는지는 아무도 확인 안 했다.**
  그것부터 확인한다. 안 되면 서버를 리눅스 쪽에 둔다
- 검증된 값 — 로봇 `192.168.57.2:8080` · 브리지 `5055` · 폴링 **33ms(실측 27.37Hz)**
- **브링업 순서** — connect → **서보 먼저** → sample 33ms → ExitDragTeach → auto 모드.
  컨트롤러가 서보 OFF 에서 auto 교정을 거부한다
- **안전은 여기서만 강제한다** (`safety.py`). 클라이언트를 믿지 않는다.
  기본 속도 상한 10% · 관절 변화 5° · `stop` 은 항상 통과
- **비전은 명령이 아니라 제안(`POST /proposal`)을 보낸다.** 여기서 검사해 통과분만 실행

## 폴더

아직 비어 있다. 착수하면 여기에 구조를 적는다.

읽을 것 — `docs/ref/API-CONTRACT.md` · `docs/ref/unity/unity-bridge-protocol.md` · `SAFETY-RULES.md`
