# API-CONTRACT — 브리지 계약

분류: **SSOT**. FR5 브리지·웹·AR가 동시에 작업하려면 이 파일이 유일한 합의점이다.
**여기를 먼저 고치고 코드를 짠다.** 코드가 앞서면 다른 두 사람이 깨진다.

**구현 소유자는 `FR5/bridge/`다.** 루트 범용 `Backend/`는 두지 않는다. `Dashboard/`는
이 계약의 읽기 전용 요약 소비자이며 로봇 명령을 보내지 않는다.

## 왜 이 서버가 필요한가

우리 유니티 코드(`FairinoBridgeClient.cs`)는 이미 `http://127.0.0.1:5055`로
`POST /connect`, `GET /state`, `GET /version`, `POST /disconnect`를 **호출하고 있다.**
받는 쪽이 없을 뿐이다. 그 자리를 채우면 유니티·브라우저·폰이 같은 하나를 본다.

```
FR5 컨트롤러 :8080
      ↕ 공식 파이썬 SDK
  FR5/bridge :5055  ← 이 문서가 정의하는 것
      ↕ REST + WebSocket
  FR5 웹 · 폰(AR) · Dashboard 요약
```

## 상태값 (서버 → 클라이언트)

WebSocket `/ws/state`로 브로드캐스트. 접속한 전원이 같은 것을 받는다.
**주기는 33ms 를 목표로 하고 실제로는 27Hz 남짓 나온다** — 유니티 실측값이다
(`unity/unity-bridge-protocol.md` §5). 이전 판의 "초당 30회"는 낙관값이었다.

**필드 목록을 늘렸다** (2026-07-30, D20). 이전 판은 8개였고 실기에서 실제로 쓰이는 것의
절반이 빠져 있었다 — `enabled`(서보) · `inDragTeach` · `safetyStop` · `collisionDetected` ·
`mainErrorCode`/`subErrorCode` 가 없으면 **안전 판정을 할 수 없다**.
근거는 유니티가 실기에서 읽던 필드 목록이다 (`unity/unity-bridge-protocol.md`).

```jsonc
{
  "t": 1785329668.42,            // 서버 시각 (초, 소수)
  "robotId": "fr5-lab-a",       // IP가 아니라 우리 시스템의 로봇 프로필 ID
  "connected": true,
  "enabled": false,              // 서보 on/off ← 없으면 안전 게이트를 못 만든다
  "mode": 0,                     // 0=auto 1=manual
  "jointsDeg": [0,0,0,0,0,0],    // 6축 관절 (도)
  "tcpMmDeg":  [0,0,0,0,0,0],    // 손끝 x,y,z(mm) + rx,ry,rz(도) — mm·도가 섞여 이름에 둘 다 적는다
  "motionQueueLength": 0,        // 큐에 남은 동작 수
  "safety": {
    "code": 0,
    "emergencyStop": false,      // 비상정지
    "safetyStop": false,         // 안전정지 (별 신호다)
    "collisionDetected": false,
    "inDragTeach": false,        // 드래그 티칭 중이면 명령을 보내지 않는다
    "mainErrorCode": 0, "subErrorCode": 0
  },
  "coord": { "toolId": 0, "userId": 0 },
  "sampleMs": 33,                // 서버가 실제로 쓰는 폴링 주기
  "gripper": { "pct": 70, "fault": false, "motionDone": true, "active": true },
  "owner": "kim",                // 조종권 보유자 (없으면 null)
  "phase": "OBSERVE_ONLY",      // 연결 상태기계 (FR5-IMPLEMENTATION-PLAN §안전 상태) — 클라이언트가 이걸 보고 조작 UI를 잠근다
  "failReason": null,            // FAIL_CLOSED 일 때만 사유 문자열
  "appliedSettings": null        // 아래 §로봇 안전 설정. arm 전에는 null
}
```

### 로봇 안전 설정 — 주인은 브리지다 (2026-08-04 · D53)

우리 안전 게이트(조건 4·5·25)는 **컨트롤러가 설정돼 있어야** 값을 준다. 충돌 감지는 기본으로
켜져 있지 않고 기본 민감도는 사람 접촉에 반응하지 않는다 (`SAFETY-RULES.md` §설정이 전제다).
그래서 **ARM 할 때마다 브리지가 넣는다** — 펜던트에서 누가 바꿔도 우리 값으로 돌아온다.

robot profile(`config.yaml`)에 `settings` 블록을 둔다:

```yaml
settings:
  payloadKg: 0.6          # 말단 하중 — 그리퍼 PGE A-100-40 실측 사양
  cogMm: [0, 0, 60]       # 무게중심 (근사 — 자동 인식은 나중)
  installPos: 0           # 0=바닥 1=측면 2=천장
  collisionMode: 0        # 0=등급(1~10) 1=퍼센트
  collisionLevel: [5,5,5,5,5,5]   # 작을수록 민감 — **실기 실측으로 확정한다**
  collisionStrategy: 2    # 2=에러 후 정지
  # 충돌 감지 **후** 어떻게 서느냐. SDK 기본값을 상속하지 않고 우리가 적는다 (아래)
  collisionSafeTimeMs: 1000        # 1000~2000
  collisionSafeDistanceMm: 100     # 1~150
  collisionSafeVelMmS: 250         # 50~250
  collisionSafetyMargin: [10,10,10,10,10,10]   # 1~10
  toolCoordId: 0          # 0=툴 없음(플랜지). 캘리브레이션 전까지 0 — 아래 주의
```

⚠ `collisionSafe*` 4개는 SDK 기본인자라 **안 적으면 벤더가 고른다** — 그 기본값 중 셋이
각 범위의 가장 느슨한 끝이다. 지금 값은 기본값과 같지만 **박아서 같다.** 범위·조일 후보·
왜 아직 안 조였는지는 `SAFETY-RULES.md` §기본인자는 "안전한 기본" 이 아니다.

`/state.appliedSettings` 모양:

```jsonc
{
  "appliedAt": 1785329668.42,   // 브리지가 넣은 시각
  "sent": { "payloadKg": 0.6, "collisionLevel": [5,5,5,5,5,5], … },   // 넣은 값 그대로
  "readback": { "payloadKg": 0.6, "cogMm": [0,0,60], "toolCoord": […] },  // 되읽은 값
  "unverifiable": ["collisionLevel", "collisionStrategy", "collisionMode", "installPos",
                   "powerLimitW", "collisionSafeTimeMs", "collisionSafeDistanceMm",
                   "collisionSafeVelMmS", "collisionSafetyMargin"],
  "mismatch": []                 // 되읽기와 다른 항목 — 비어 있지 않으면 arm 거부
}
```

- **`/arm` 시퀀스에 단계가 늘었다**: 서보 ON → **설정 적용 → 되읽기 대조** →
  샘플주기 → ExitDragTeach → 자동 모드. 되읽을 수 있는 값이 다르면 **arm 을 거부**한다
- **되읽기가 없는 항목은 `unverifiable` 로 정직하게 노출한다.** "확인했다"가 아니라
  "넣었다"이다. 화면도 그렇게 표시한다
- `appliedSettings` 가 없으면 모션이 나가지 않는다 (조건 26)
- ⚠ **`toolCoordId: 0` 은 매뉴얼상 "툴 없음(플랜지 기준)"** 이지만 툴 0 에 이미
  `[0,0,135,0,0,0]` 이 들어 있다 (2026-08-04). 그 **135 는 실물 실측(플랜지→핑거 끝)과 일치**
  한다 (2026-08-05 · `STACK.md` §안전 설정 API). 남은 건 정확도가 아니라 **기준점**이다 —
  135 는 핑거 **끝**, 파지 지점은 ≈122.5mm. 지금은 관절값 + `MoveJ` 재생이라 동작은 안 바뀐다.
  좌표 기반 이동을 도입하기 전에 어느 쪽을 TCP 로 둘지 정한다 (별도 골)

`phase` 는 `DISCONNECTED → PREFLIGHT → OBSERVE_ONLY → OWNER_HELD → ARMED → EXECUTING`
+ `FAIL_CLOSED` 다 (2026-07-31, D40). 미연결이면 `robotId: null · connected: false ·
phase: "DISCONNECTED"` 스냅샷을 같은 스키마로 보낸다 — 클라이언트가 빈 응답을 따로 처리하지 않는다.
`POST /connect` 응답은 `{ ok, phase, reasons: [] }` 이며 preflight 실패는 `ok: false` +
사유 목록으로 fail-closed 한다.

**이름은 우리 규칙을 따른다** (`CODING-CONVENTIONS.md`) — 안전 관련을 `safety` 아래로 묶고
좌표계 id 를 `coord` 로 묶었다. 유니티는 이걸 플랫으로 뒀지만 우리 클라이언트는 우리 것이다.
`tcpMmDeg` 만 유니티 이름을 가져왔다 — **mm 과 도가 섞인 배열이라 그 이름이 더 정확하다.**

**단위 규칙** — 이 계약의 바깥면은 전부 **도(°)와 밀리미터(mm)**다.
라디안·미터 변환은 서버 안쪽과 3D 화면 안쪽에서만 한다.

## 로봇 프로필과 읽기 전용 사전검증

같은 FR5라도 다른 개체가 배정될 수 있으므로 IP를 로봇 정체성으로 쓰지 않는다.

```text
GET  /robots              → [{ robotId, name, model, endpoint, lastObserved }]
POST /connect             { "robotId": "fr5-lab-a", "observeOnly": true }
GET  /version             → { robotId, controller, servo, end, sdk, web, observedAt }
POST /disconnect
```

- `endpoint`는 서버 설정이며 브라우저가 임의 IP를 전달하지 않는다.
- 기본 연결은 `observeOnly=true`다. 이때 허용되는 SDK 호출은 connect/version/read-state/disconnect뿐이다.
- 모델·6축 배열·필수 안전 필드·허용 펌웨어가 맞지 않으면 연결은 보여주되 명령 상태로 승격하지 않는다.
- 프로필에 비밀번호를 저장하지 않는다. 포트 라벨이 아니라 ARP/TCP와 SDK 응답으로 실제 경로를 확인한다.

### 작업영역 — 조건 12 의 카테시안 절반 (2026-08-05 · D73)

관절 한계만으로는 **손끝이 작업대를 뚫는 것을 못 막는다.** 컨트롤러의 위치 안전망은
FR-HMI 전용 펜던트를 전제하므로 빌릴 수 없다 (`SAFETY-RULES.md` §FR-HMI) — 우리 소프트리밋이
유일한 방어선이다. 값은 **로봇이 직접 짚어** 얻는다 (`runbook/WORKCELL-MEASURE.md`).

프로필 **최상위**에 둔다. `settings` 는 *로봇에 넣는 값*이고(D53) 이것은 *우리 게이트가
쓰는 값*이라 섞으면 `appliedSettings` 되읽기 대조에 끼어든다.

```yaml
workspace:
  frame: {toolId: 1, userId: 1}   # 이 좌표계에서만 참이다
  tableTopZmm: -345.8
  tableXmm: [-16.1, 842.0]
  tableYmm: [-798.2, -210.9]
  tableMarginMm: 10
  wallYmm: -1400.0
  wallMarginMm: 100
```

- 판정은 **손끝**으로 한다. 목표 관절을 **로봇 자신의 `GetForwardKin`** 으로 바꾼다 —
  DH 파라미터를 우리가 다시 적지 않고, 툴·사용자 좌표계가 저절로 맞는다
- **상판은 평면이 아니라 사각 기둥이다** — `x·y` 가 상판 안일 때만 높이를 건다.
  바깥에서는 더 내려가도 된다 (실제로 손끝이 상판 밖에서 346mm 아래에 있었다)
- **`frame` 이 지금 좌표계와 다르면 거부한다.** 같은 숫자가 다른 자리를 가리킨다
- 손끝을 못 구하면 **차단**한다 (제1원칙: 결측=차단)
- **없으면 판정하지 않는다** — `/state.workspace` 가 `null` 로 노출돼 꺼진 것이 보인다
- ⚠ **천장 — 손끝만 본다.** 팔꿈치·상완은 판정 밖이라 벽 여유를 크게 잡는다

## 명령 (클라이언트 → 서버)

WebSocket 같은 연결로 올린다. **조종권을 가진 클라이언트의 명령만 실행한다.**
신원은 TB 와 같은 hello 바인딩이다 (2026-07-31, D41) — `stop` 만 hello 없이도 받는다.

```jsonc
{ "cmd": "hello",   "who": "kim", "token": "…" }   // 이 연결의 신원. 명령 전 1회 (토큰은 §조종권)
{ "cmd": "jog",     "joint": 2, "deltaDeg": 1.0 }
{ "cmd": "moveJ",   "jointsDeg": [0,0,0,0,0,0], "speedPct": 10 }
{ "cmd": "gripper", "pct": 30 }         // 아래 §그리퍼. open:true/false 는 별칭
{ "cmd": "gripperActivate" }
{ "cmd": "mode",    "manual": true }    // 아래 §모드 전환. 로봇을 움직이지 않는다
{ "cmd": "stop" }                       // 조종권·신원 없어도 항상 받는다
```

### 모드 전환 — 펜던트에게 조작을 넘긴다 (D72)

`ARM` 이 `SetMode(0)` 을 부르므로 한 번 ARM 하면 펜던트가 잠기고, `DISARM` 은 안 되돌린다.
`mode` 가 그 되돌리기다. 왜 이 모양인지는 **D72** 에 있다.

- 로봇을 움직이지 않는다 — 권한만 넘긴다. 조종권자만 · 모션 큐 0 · 신선도 게이트
- **`ARMED` 에서도 받는다** — 드래그는 서보가 켜져 있어야 되므로 DISARM 을 선행으로
  걸면 잠금을 못 푼다. 하드 룰 4 는 `check_motion` 의 `mode != 0` 이 지킨다
- ⚠ **드래그 티칭은 웹에서 켜지 않는다** — 팔을 푸는 것은 펜던트의 3위치 인에이블
  스위치다 (`SAFETY-RULES.md` §FR-HMI). `inDragTeach` 는 **읽기만** 한다

### 명령 승격 — ARMED (2026-07-31, D41)

observe-only 연결은 명령을 받지 않는다. 승격은 별도 REST 한 번이며 **서버가 SAFETY-RULES 의
게이트를 전부 통과시켜야** `phase: ARMED` 가 된다. 실행 순서는
**서보 on → 안전 설정 적용·되읽기 대조(2026-08-04 신설, 위 §로봇 안전 설정) →
SetRealtimeStateSamplePeriod(33) → ExitDragTeach → SetMode(0)** 이다.
설정을 넣지 못했거나 되읽기가 어긋나면 **거기서 멈추고 arm 을 거부**한다.

```text
POST /arm     { "who": "kim", "token": "…", "confirm": "현장확인" }   → { ok, phase, reasons }
POST /disarm  { "who": "kim", "token": "…" }                        → 서보 내리고 OBSERVE_ONLY 로
```

- `confirm: "현장확인"` 리터럴이 없으면 거부 — 현장에 사람이 있음을 클라이언트가 명시한다
- 조종권 보유자만 arm 할 수 있고, 조종권을 잃으면 서버가 disarm 한다.
  **arm 시퀀스가 끝나는 순간에도 조종권을 다시 확인한다** — 시퀀스는 수 초가 걸려 그 사이
  자동 해제가 돌 수 있고, 그러면 주인 없는 ARMED 가 남는다 (2026-08-03 감사 P0, 수리됨)
- jog/moveJ/gripper 는 `ARMED` 에서만, 매 명령마다 안전 게이트를 다시 통과해야 실행된다
- **실기에 닿는 명령은 허용목록으로 고정한다** — `jog`·`moveJ`·`gripper`·`mode`·`stop` 다섯뿐이고,
  그중 **로봇을 움직이는 것은 앞의 셋**이다 (`mode` 는 권한만 넘긴다 · `stop` 은 세운다).
  재생·시뮬·모방학습 재현은 이 목록에 새 이름을 더하지 않는 한 하드웨어에 닿을 수 없다.
  격리를 주석이 아니라 구조가 보증한다 (감사 P1)
- `POST /disconnect { "who", "token" }` — 주인이 있으면 주인만 끊는다. 남의 실행을 아무나 중단시키는
  것도 사고다 (감사 P1, 수리됨). 주인이 없으면 누구나 끊을 수 있다

### 그리퍼 (P3 · 실물 PGE A-100-40 · 대환 · 말단 1번 포트)

```jsonc
{ "cmd": "gripper", "pct": 30 }      // 0~100. open:true/false 는 pct 의 별칭으로 남긴다
{ "cmd": "gripperActivate" }         // 활성화(ActGripper). 손가락이 실제로 움직인다 — 사람이 누른다
```

`gripperActivate` 를 **ARM 시퀀스에 넣지 않는다** (2026-08-04 · D65). 활성화는 원점을 잡는
**물리 동작**이라, 서보를 올리는 것과 같은 순간에 손가락까지 움직이면 사람이 예상하지 못한다.
조종권자가 화면에서 따로 누른다.

- **관절이 아니다** — 5°·URDF 한계·모션큐 게이트는 걸지 않고, 그리퍼 전용 게이트를 탄다:
  조종권 · ARMED · 상태 신선도 · `gripperFault` 없음 · 힘 상한. 관절 게이트를 그대로
  복붙하면 통과할 수 없거나 엉뚱한 값으로 판정한다 (감사 P1)
- ~~지령 pct 와 읽기 pct 는 방향이 반대다~~ → **모드 문제였다. 변환은 없다** (2026-08-04).
  유니티 실기 기록: `before auto mode + DAHUAN: 0% → position=96 · after auto mode: 0% → 0`
  (`unity/unity-bridge-protocol.md` §6). 8/3 스모크는 브리지를 끄고 **수동 모드**에서 쟀다.
  우리 ARM 은 `Mode(0)` 자동이라 실측이 곧다 — `지령 30·70·100 → 읽기 30·70·100`.
  **그래서 `pct` 한 벌만 싣는다.** 두 벌의 숫자도, 변환표도, `calibrated` 깃발도 없앴다 —
  없는 문제를 위한 구조를 남기지 않는다
- **읽기는 명령 직후가 아니라 약 5초 뒤에 수렴한다** (유니티 실측). 즉시 판정하면 오판한다 —
  이동 중 값으로 결론을 내리지 않는다 (8/3 의 "방향 반대" 가 그 실수였다)
- ⚠ **`maxtime` 은 `vel` 과 함께 정한다.** `vel 30% + maxtime 3000ms` 로 보냈다가 정상 이동이
  상한과 겹쳐 컨트롤러가 `8/1 Gripper Movement timeout` 을 **래치**했다 — 브리지 재시작으로
  안 풀려 전원 재투입이 필요했다 (2026-08-04 · 펜던트 문구 실측). 지금 `maxtime 10000ms`
- `state.gripper` 는 `{ pct, fault, motionDone, active }` 를 싣는다.
  못 읽으면 `missing` 에 올려 fail-closed 로 넘긴다
- ✅ **필드 순서 문제는 `GetGripperMotionDone` 을 안 써서 없앴다** (2026-08-04 · D65).
  그 xmlrpc 는 **자리로 구분하는 튜플**이라 `[fault, status]` 가 뒤집혀도 알아챌 방법이 없다
  (실측 `[1, 0]`). 대신 20004 실시간 구조체의 **이름 붙은 필드**를 읽는다 —
  `gripper_motiondone` · `gripper_fault` · `gripper_active` · `gripper_position`.
  이름으로 오는 값은 순서가 섞이지 않는다. xmlrpc 왕복도 사라진다
- `active` 는 **비트마스크**다 — `gripper_active` 의 bit N 이 그리퍼 N번. 우리 것은 1번 포트
- 프로필에 그리퍼 정체(`company: 4` 대환 · `device: 0` · 포트 1)를 등재하고 preflight 가
  대조한다 — 다른 그리퍼가 달린 개체에서 같은 지점을 재생하면 파지 폭이 달라진다

### 안전 규칙 (서버가 강제한다 — 클라이언트를 믿지 않는다)

| 규칙 | 값 |
|---|---|
| 기본 속도 상한 | 10% |
| 한 번에 허용되는 관절 변화 | 5° |
| 상한을 넘는 명령 | 거부하고 사유를 응답 |
| `stop` | 조종권·상한과 무관하게 즉시 실행 |

## 조종권

```
POST /owner/claim   { "who": "kim" }              → { ok, owner, token }  아니면 409
POST /owner/release { "who": "kim", "token": … }  → 반납
```

조종권이 없는 사람은 **화면을 볼 수는 있지만 움직임 명령은 거부된다.**
지난 프로젝트에서 화면 두 개가 동시에 명령을 보내 충돌한 적이 있어 이 규칙은 어차피 필요하다.

### 이름이 아니라 토큰이 조종권을 증명한다 (2026-08-04 · D55)

**이름만으로는 안 된다.** 조종권자 이름은 `/state` 로 전원에게 브로드캐스트되므로,
화면만 보면 남의 이름으로 `hello` 를 보내 그 사람의 조종권으로 명령을 낼 수 있었다
(감사 P0). 그리퍼가 붙으면 사람 손과 접촉할 일이 늘어 위험도가 오른다.

- `claim` 이 **1회용 토큰**을 발급한다. 조종권을 요구하는 모든 호출이 이 토큰을 싣는다 —
  `hello` · `/arm` · `/disarm` · `/owner/release` · `/disconnect`(주인이 있을 때)
- **`stop` 은 그대로 신원 없이 통과한다** (제3원칙). 정지를 막는 조건은 만들지 않는다
- 토큰은 반납·자동 해제 때 폐기된다. 다시 잡으면 새 토큰이다
- **로그인이 아니다** (D41 유지) — 사람을 인증하는 게 아니라 **세션을 묶는** 것이다.
  누구나 조종권을 잡을 수 있고, 잡은 뒤에는 그 세션만 명령할 수 있다
- 이름(`who`)은 **화면 표시용**으로 계속 쓴다 — 누가 잡고 있는지 팀이 봐야 한다

## 이동 지점 (P3 Teach)

```
GET    /points            → [{ ...아래 스키마 }]
POST   /points            { "who": "kim", "name": "P1" }   // 값은 서버가 현재 상태에서 찍는다
DELETE /points/{name}     { "who": "kim" }                  // 참조 슬롯이 있으면 409
```

**쓰기는 조종권자만.** 읽기는 누구나 (D44 · 감사 P1). 클라이언트가 좌표를 올리지 않는
이유는 화면이 보낸 값과 실제 자세가 다를 수 있어서다 — **캡처의 정본은 서버가 읽은 상태**다.

```jsonc
{ "name": "P1",
  "jointsDeg": [...], "tcpMmDeg": [...],
  "gripperPct": 62,                 // 캡처 순간 실측 개폐 (없으면 null — 감사 P0)
  "toolId": 0, "userId": 0,         // 캡처 당시 좌표계
  "capturedRobotId": "fr5-lab-a",   // 개체 귀속 — 다른 개체에서 재생하면 경고
  "capturedAt": "2026-08-03T…" }
```

- **캡처도 신선도 게이트를 탄다** — `lastStateAt` 이 0.5초보다 낡으면 거부한다.
  캐시된 마지막 값을 신선한 자세로 굳히면 그 오차가 이후 모든 실행에 실린다 (감사 P2)
- **지점은 하드 삭제하지 않는다.** 참조하는 슬롯이 있으면 보관(archive)만 — 승인된
  리비전이 깨진 참조를 가리키면 실행 시점에야 드러난다 (감사 P1)
- **좌표계가 다르면 실행을 막는다** — 지점의 `toolId`/`userId` 가 현재 세션과 다르면
  슬롯 승인·실행에서 fail-closed. 그리퍼 장착 전(tool0) 지점을 장착 후에 재생하면
  TCP 오프셋만큼 어긋나 파지 실패가 아니라 충돌이 된다 (감사 P0)

## 예상 경로 (AR·3D가 쓴다)

```
POST /preview
  { "from": [0,0,0,0,0,0], "to": [30,-20,40,0,0,0], "steps": 60 }
  →
  { "points": [[x,y,z], ...],   // mm, 로봇 베이스 기준
    "note": "예상값 — 실제 가감속과 다를 수 있음" }
```

FK 보간으로 계산한다. 역기구학은 쓰지 않는다 (`docs/ref/arch/STACK.md` §궤적).

## 카메라 — 이 문서가 아니라 `LAYOUT-METRICS-CONTRACT.md` §카메라 다

**카메라 관문의 정본은 `LAYOUT-METRICS-CONTRACT.md` §카메라** (`/api/camera/*`)다.
시연 녹화·서보 스트리밍과 한 묶음이라 거기 산다. 여기에 두 번째 카메라 계약을 만들지 않는다.

이 문서가 카메라에서 쓰는 것은 **§제안이 참조하는 두 필드**뿐이다 —
`depth.minZmm`(현재 해상도의 Min-Z)와 `depth.valid`(지금 사각지대 밖인가).
**카메라가 무응답이거나 프레임이 낡으면 제안은 전부 거부된다** (fail-closed).

## 제안 — 이 문서가 아니라 `VISION-CONTRACT.md` (2026-08-05 이관)

비전은 명령이 아니라 **제안**을 만든다 (D47·D61). `POST /proposal` 의 판정 3단·거부 사유·
못 박는 것 5개·앵커 봉인은 [`VISION-CONTRACT.md`](VISION-CONTRACT.md) 에 있다.

**§명령의 허용목록은 그대로다** — `proposal` 은 그 목록에 이름을 더하지 않는다.

## 배치안·생산성 지표 — 별 문서로 이관 (2026-08-04)

`LAYOUT-METRICS-CONTRACT.md` 를 본다. 관제화면이 편집하고 AR 이 읽는 데이터와 팀원
알고리즘의 지표 모양은 **로봇 명령과 소비자도 수명주기도 다르다.**

## 실기 연결 — 유니티에서 **검증된 값**을 가져온다

**목표는 실기 ↔ 우리 대시보드·AR 이다.** 유니티 펜던트는 클라이언트로 받쳐야 할 대상이 아니고,
**이미 실기로 검증해 본 값의 출처**다. 우리 계약을 유니티에 맞추지 않는다 — 반대로
유니티가 실기에서 확인한 숫자와 함정을 가져다 쓴다.

정본은 `docs/ref/unity/unity-bridge-protocol.md` (2026-07-30 원본 대조).

| 항목 | 검증된 값 |
|---|---|
| 현재 로봇 응답 주소 | **`192.168.58.2:8080`** (2026-08-05 · `robotId` 프로필로 교체 가능) |
| 같은 대역 PC | `192.168.58.10/24` (`enp3s0`) |
| 브리지 포트 | `5055` |
| 상태 폴링 | **33ms 설정 → 실측 27.37Hz** (100ms→8.93 · 50ms→18.66) |
| 오류 시 폴백 | 연속 2회 → 50ms · 연속 3회 → 연결 손실 판정 |

2026-07-31 현재 실물의 네트워크·펌웨어·관절/TCP 읽기 근거는
`docs/evidence/2026-07-31/fr5-live-readback.md`다.

**1단계: 읽기 전용 사전검증**

```text
link/subnet → ARP/ping → TCP :8080 → connect → version → read state → disconnect 또는 관찰 유지
```

**2단계: 명령 승격** — 조종권·현장 확인·안전조건 19개를 통과한 뒤에만 실행한다.

```
owner claim → safety gate → 서보 on → SetRealtimeStateSamplePeriod(33) → ExitDragTeach → SetMode(0=auto)
```

**서보를 먼저 올린다.** 컨트롤러가 서보 OFF 상태에서는 auto 모드 교정을 거부한다 —
유니티 주석에 그대로 적혀 있다.

### 착수 전 첫 관문 — macOS

2026-07-31 Unity의 기존 C# SDK(`libfairino`, C#SDK-V1.2.4)는 macOS Arm64에서
`Connect → GetVersion → ReadState → Disconnect`가 성공했다. 과거의 “C# 직접 연결 실패”
기록은 이 실측으로 대체한다.

그러나 **Python SDK 설치·macOS 동작은 여전히 미확인**이다. `FR5/bridge/` 첫 구현은 어댑터의
읽기 전용 사전검증부터 하고, 실패하면 브리지만 Linux에서 실행한다. C# 성공을 Python 성공으로
간주하지 않는다.

### 유니티 펜던트를 나중에 붙일 수도 있다 (선택)

유니티는 `FAIRINO_BRIDGE_URL` 이 설정되면 `POST /connect` · `POST /disconnect` ·
`GET /state`(타임아웃 **500ms**) · `GET /version` 을 부른다. 우리 서버에 그 4개를
**얇은 호환 라우트**로 얹으면 붙는다 — 필드명만 유니티 것으로 바꿔 응답하면 된다.

**지금 만들지 않는다.** 요구사항이 아니고, 만들면 우리 스키마가 유니티에 끌려간다.
필요해지면 그때 변환 라우트 하나를 더한다 — 그러면 우리 계약은 그대로 남는다.

## 바꿀 때

1. 이 파일을 먼저 고친다
2. `docs/status/DECISION-LOG.md`에 왜 바꿨는지 한 줄
3. 그 다음 서버·웹 코드
4. 필드를 **지우거나 이름을 바꿀 때**는 팀에 먼저 알린다 — 다른 두 사람이 깨진다
