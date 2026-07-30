# API-CONTRACT — 브리지 계약

분류: **SSOT**. 서버·웹·AR 세 사람이 동시에 작업하려면 이 파일이 유일한 합의점이다.
**여기를 먼저 고치고 코드를 짠다.** 코드가 앞서면 다른 두 사람이 깨진다.

## 왜 이 서버가 필요한가

우리 유니티 코드(`FairinoBridgeClient.cs`)는 이미 `http://127.0.0.1:5055`로
`POST /connect`, `GET /state`, `GET /version`, `POST /disconnect`를 **호출하고 있다.**
받는 쪽이 없을 뿐이다. 그 자리를 채우면 유니티·브라우저·폰이 같은 하나를 본다.

```
FR5 컨트롤러 :8080
      ↕ 공식 파이썬 SDK
  브리지 서버 :5055  ← 이 문서가 정의하는 것
      ↕ REST + WebSocket
  브라우저 · 폰(AR) · 유니티 펜던트
```

## 상태값 (서버 → 클라이언트)

WebSocket `/ws/state`로 **초당 30회** 브로드캐스트. 접속한 전원이 같은 것을 받는다.

```jsonc
{
  "t": 1785329668.42,        // 서버 시각 (초, 소수)
  "connected": true,         // 로봇 연결 여부
  "mode": "auto",            // auto | manual | drag
  "jointsDeg": [0,0,0,0,0,0],// 6축 관절 각도 (도)
  "tcpMm": [0,0,0,0,0,0],    // 손끝 자세 x,y,z(mm) + rx,ry,rz(도)
  "gripper": { "opened": true, "pos": 0 },
  "safety": { "code": 0, "estop": false },
  "owner": "kim"             // 지금 조종권을 가진 사람 (없으면 null)
}
```

**단위 규칙** — 이 계약의 바깥면은 전부 **도(°)와 밀리미터(mm)**다.
라디안·미터 변환은 서버 안쪽과 3D 화면 안쪽에서만 한다.

## 명령 (클라이언트 → 서버)

WebSocket 같은 연결로 올린다. **조종권을 가진 클라이언트의 명령만 실행한다.**

```jsonc
{ "cmd": "jog",     "joint": 2, "deltaDeg": 1.0 }
{ "cmd": "moveJ",   "jointsDeg": [0,0,0,0,0,0], "speedPct": 10 }
{ "cmd": "gripper", "open": true }
{ "cmd": "stop" }                       // 조종권 없어도 항상 받는다
```

### 안전 규칙 (서버가 강제한다 — 클라이언트를 믿지 않는다)

| 규칙 | 값 |
|---|---|
| 기본 속도 상한 | 10% |
| 한 번에 허용되는 관절 변화 | 5° |
| 상한을 넘는 명령 | 거부하고 사유를 응답 |
| `stop` | 조종권·상한과 무관하게 즉시 실행 |

## 조종권

```
POST /owner/claim   { "who": "kim" }   → 비어 있으면 부여, 아니면 409
POST /owner/release { "who": "kim" }   → 반납
```

조종권이 없는 사람은 **화면을 볼 수는 있지만 움직임 명령은 거부된다.**
지난 프로젝트에서 화면 두 개가 동시에 명령을 보내 충돌한 적이 있어 이 규칙은 어차피 필요하다.

## 이동 지점

```
GET    /points            → [{ "name": "P1", "jointsDeg": [...], "tcpMm": [...] }]
POST   /points            { "name": "P1", "jointsDeg": [...] }
DELETE /points/{name}
```

## 예상 경로 (AR·3D가 쓴다)

```
POST /preview
  { "from": [0,0,0,0,0,0], "to": [30,-20,40,0,0,0], "steps": 60 }
  →
  { "points": [[x,y,z], ...],   // mm, 로봇 베이스 기준
    "note": "예상값 — 실제 가감속과 다를 수 있음" }
```

FK 보간으로 계산한다. 역기구학은 쓰지 않는다 (`docs/ref/STACK.md` §궤적).

## 유니티 호환 (이미 호출되고 있는 것)

기존 `FairinoBridgeClient.cs`가 그대로 붙도록 유지한다.

```
POST /connect      { "ip": "192.168.57.2", "port": 8080 }
POST /disconnect
GET  /state        → 위 상태값과 동일 스키마
GET  /version
```

## 바꿀 때

1. 이 파일을 먼저 고친다
2. `docs/status/DECISION-LOG.md`에 왜 바꿨는지 한 줄
3. 그 다음 서버·웹 코드
4. 필드를 **지우거나 이름을 바꿀 때**는 팀에 먼저 알린다 — 다른 두 사람이 깨진다
