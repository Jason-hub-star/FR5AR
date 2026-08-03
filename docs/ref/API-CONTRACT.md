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
  "gripper": { "opened": true, "pos": 0 },
  "owner": "kim",                // 조종권 보유자 (없으면 null)
  "phase": "OBSERVE_ONLY",      // 연결 상태기계 (FR5-IMPLEMENTATION-PLAN §안전 상태) — 클라이언트가 이걸 보고 조작 UI를 잠근다
  "failReason": null             // FAIL_CLOSED 일 때만 사유 문자열
}
```

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

## 명령 (클라이언트 → 서버)

WebSocket 같은 연결로 올린다. **조종권을 가진 클라이언트의 명령만 실행한다.**
신원은 TB 와 같은 hello 바인딩이다 (2026-07-31, D41) — `stop` 만 hello 없이도 받는다.

```jsonc
{ "cmd": "hello",   "who": "kim" }      // 이 연결의 신원. 명령 전 1회
{ "cmd": "jog",     "joint": 2, "deltaDeg": 1.0 }
{ "cmd": "moveJ",   "jointsDeg": [0,0,0,0,0,0], "speedPct": 10 }
{ "cmd": "gripper", "open": true }
{ "cmd": "stop" }                       // 조종권·신원 없어도 항상 받는다
```

### 명령 승격 — ARMED (2026-07-31, D41)

observe-only 연결은 명령을 받지 않는다. 승격은 별도 REST 한 번이며 **서버가 SAFETY-RULES 의
게이트를 전부 통과시켜야** `phase: ARMED` 가 된다. 실행 순서는 §실기 연결의 2단계 그대로다
(서보 on → SetRealtimeStateSamplePeriod(33) → ExitDragTeach → SetMode(0)).

```text
POST /arm     { "who": "kim", "confirm": "현장확인" }   → { ok, phase, reasons }
POST /disarm  { "who": "kim" }                          → 서보 내리고 OBSERVE_ONLY 로
```

- `confirm: "현장확인"` 리터럴이 없으면 거부 — 현장에 사람이 있음을 클라이언트가 명시한다
- 조종권 보유자만 arm 할 수 있고, 조종권을 잃으면 서버가 disarm 한다.
  **arm 시퀀스가 끝나는 순간에도 조종권을 다시 확인한다** — 시퀀스는 수 초가 걸려 그 사이
  자동 해제가 돌 수 있고, 그러면 주인 없는 ARMED 가 남는다 (2026-08-03 감사 P0, 수리됨)
- jog/moveJ/gripper 는 `ARMED` 에서만, 매 명령마다 안전 게이트를 다시 통과해야 실행된다
- **실기에 닿는 명령은 허용목록으로 고정한다** — `jog`·`moveJ`·`gripper`·`stop` 넷뿐이다.
  재생·시뮬·모방학습 재현은 이 목록에 새 이름을 더하지 않는 한 하드웨어에 닿을 수 없다.
  격리를 주석이 아니라 구조가 보증한다 (감사 P1)
- `POST /disconnect { "who" }` — 주인이 있으면 주인만 끊는다. 남의 실행을 아무나 중단시키는
  것도 사고다 (감사 P1, 수리됨). 주인이 없으면 누구나 끊을 수 있다

### 그리퍼 (P3 · 실물 PGE A-100-40 · 대환 · 말단 1번 포트)

```jsonc
{ "cmd": "gripper", "pct": 30 }      // 0~100. open:true/false 는 pct 의 별칭으로 남긴다
```

- **관절이 아니다** — 5°·URDF 한계·모션큐 게이트는 걸지 않고, 그리퍼 전용 게이트를 탄다:
  조종권 · ARMED · 상태 신선도 · `gripperFault` 없음 · 힘 상한. 관절 게이트를 그대로
  복붙하면 통과할 수 없거나 엉뚱한 값으로 판정한다 (감사 P1)
- **지령 pct 와 읽기 pct 는 방향이 반대다** (실측: 지령 30→읽기 76). 브리지가 한 곳에서
  변환하고, 계약에 나오는 값은 전부 **지령 기준**이다 — 단위 변환은 한 곳에서만 (하드 룰 5)
- `state.gripper` 는 `{ pct, fault, motionDone, active }` 를 싣는다. 못 읽으면 `missing` 에
  올려 fail-closed 로 넘긴다
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
POST /owner/claim   { "who": "kim" }   → 비어 있으면 부여, 아니면 409
POST /owner/release { "who": "kim" }   → 반납
```

조종권이 없는 사람은 **화면을 볼 수는 있지만 움직임 명령은 거부된다.**
지난 프로젝트에서 화면 두 개가 동시에 명령을 보내 충돌한 적이 있어 이 규칙은 어차피 필요하다.

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

FK 보간으로 계산한다. 역기구학은 쓰지 않는다 (`docs/ref/STACK.md` §궤적).

## 배치안 (관제화면이 편집하고 AR이 읽는다)

새 목표(배치별 생산성 비교)의 데이터다. **모양의 정본은 `docs/ref/SHARED-CORE.md`**이고
여기는 주고받는 방법만 정한다.

```
GET    /layouts             → [{ "id": "A", "name": "...", "verified": false }, ...]  // 목록만
GET    /layouts/{id}        → 배치안 전문 (SHARED-CORE.md §모양)
PUT    /layouts/{id}        배치안 전문. 없으면 만든다
DELETE /layouts/{id}
```

- **단위는 mm·도(°)**다. 원점은 **실험실 바닥의 고정된 한 점**이고 로봇 베이스가 아니다.
  로봇 위치가 배치안의 변수라서 그렇다 — 어기면 배치안끼리 비교가 불가능해진다
- **AR은 `GET`만 쓴다.** 폰에서 배치를 고치면 누가 무엇을 측정한 건지 알 수 없어진다
- 서버가 없는 동안은 **생성된 JSON을 빌드에 넣어** 읽기 전용으로 쓴다
  (`BUILD-VITE.md` §설정). 계약 모양은 지금 확정해 두고 저장소만 나중에 바꾼다

## 프로그램 슬롯 (P4) · 실행 기록 (P6) · 시연 (모방학습)

세 개가 같은 저장 경계를 쓴다. **저장 위치는 배포 트리 밖 `~/fr5-data/`** — 배포가
`rsync --delete` 라 트리 안에 두면 다음 배포 한 줄에 팀의 티칭 데이터가 사라진다 (D45).

```
GET/POST      /slots                 목록·생성(draft)
GET/PUT       /slots/{id}            리비전 추가 (불변 revisionId, 활성은 포인터)
POST          /slots/{id}/approve    { who, confirm: "현장확인" } → 실기 실행 자격
POST          /slots/{id}/run        { who } → approved 리비전만. 실행 전 재대조
GET           /history               명령·상태·차단 사유·승인 타임라인 (읽기)
```

- **승인 시점의 정체를 리비전에 고정 기록**하고, **실행 직전에 현재 세션과 다시 대조**한다 —
  robot profile · 펌웨어 문자열 · tool/user · 그리퍼 정체. 고정만 하고 안 보면 옛 승인이
  바뀐 실기에 그대로 나간다 (감사 P1)
- **재생은 실기 명령을 보내지 않는다.** History 재생은 시간축 시각화이고, 위 허용목록
  때문에 구조적으로도 하드웨어에 닿지 않는다
- **중단 후 자동 재개는 없다.** 실행 기록에 마지막 완료 스텝을 남기고, 재개는 사람이 스텝을
  골라 명시적으로 시작한다 — 물체를 문 채 멈춘 상태에서 처음부터 돌리면 충돌이다 (감사 P1)
- **grip 단계는 성패를 판정한다** — 목표 대비 실측 개폐가 임계 밖이면 그 자리에서 정지.
  빈 그리퍼로 place 까지 진행하고 로그에 성공으로 남는 것을 막는다 (감사 P1)

### 모방학습 (신규 요구 · 2026-08-03 · D47 로 범위 확대)

그리퍼에 뎁스카메라를 달고 사람 시연을 수집해 **정책을 학습시키고 그 정책으로 작업을
수행한다.** 학습은 목적이자 수단이다 (D47). PRD 의 선은 여기까지다 — 로봇이 **배운 적 없는
작업을 스스로 계획**하는 것은 여전히 범위 밖이다.

```
POST /demos/start   { who, taskId }     시연 녹화 시작 (관절·그리퍼·카메라 동기 기록)
POST /demos/stop    { who }
GET  /demos         목록 (taskId 별 개수 — 30~50회가 학습 최소선)
POST /servo/start   { who, confirm: "현장확인" }   서보 스트리밍 구간 열기
WS   { "cmd": "servo", "jointsDeg": [...] }        주기적 목표 (8ms~50ms)
POST /servo/stop    { who }
```

- **서보 스트리밍은 별도 관문이다.** `MoveJ` 는 점 대 점이라 정책의 초당 수십 프레임을
  못 받는다. 게이트도 "명령당 5°" 가 아니라 **각속도(°/s)** 로 판정한다
  (`SAFETY-RULES.md` §서보 스트리밍 상한). `stop` 은 스트리밍 중에도 최우선이다
- **정책이 로봇을 직접 잡지 않는다.** 학습 도구(LeRobot 등)는 브리지에게 요청을 보내고,
  모든 프레임이 게이트를 통과한다. xmlrpc 는 연결이 하나뿐이라 예외를 만들 수 없다
- 시연 데이터(영상 포함)는 `~/fr5-data/demos/` — 용량 상한·보존기간을 촬영 **전에** 정한다.
  사람이 찍히므로 로봇 상태와 같은 공개 수준으로 두지 않는다
- 학습된 정책의 실행도 승인 관문을 탄다 — 사람이 검토하지 않은 궤적을 상한 안에서
  연속으로 흘려보내는 우회로를 열지 않는다
- 카메라 스트림은 `/api/camera/*` 로 따로 계약한다 (GAP OPEN — 소유 브리지 미정)

## 생산성 지표 — **우리가 요구 모양을 제시한다**

**수치는 팀원 알고리즘이 만든다. 우리는 받아서 보여준다** (`ARCHITECTURE.md` §우리 몫).
그래서 계약을 기다리지 않는다 — **화면을 가진 쪽이 필요한 모양을 먼저 낸다.**

### 요구 모양 (배치안 1개의 실행 결과)

```jsonc
{
  "layoutId": "A",
  "source": "sim",              // sim | measured | mock — 화면에 출처를 표시한다
  "cycles": 120,                // 처리한 개수
  "durationSec": 3600,
  "metrics": {
    "throughputPerHour": 120.0,                       // 필수
    "cycleTimeSec": { "mean": 30.0, "p50": 29.1, "p95": 38.4 },  // mean 필수
    "amrTravelMm":   480000,                          // 선택
    "waitSec":       { "arm": 220, "amr": 640 },      // 선택
    "interferences": 3                                // 선택
  },
  "series": [ { "tSec": 0.0, "event": "pick", "station": "in" } ]   // 선택 — 타임라인용
}
```

**필수는 둘뿐이다** — `throughputPerHour`와 `cycleTimeSec.mean`.
나머지는 선택이고, **없으면 그 칸만 "—"로 비운다.** 화면이 깨지지 않는다.

이렇게 나눈 이유: 팀원이 처리량 하나만 내도 **비교 화면이 그날 동작한다.**
전부 갖춰질 때까지 기다리면 우리 쪽 진행이 팀원 일정에 묶인다.

### 지금은 목업으로 만든다

```
Shared/data/datasource/mock.js    손으로 만든 JSON 두 개 (배치안 A · B)
Shared/data/datasource/http.js    나중에 이 파일만 바꿔 끼운다
```

**화면은 어느 쪽인지 모른다.** 목업→실물 교체가 파일 한 개여야 한다
(`ARCHITECTURE.md` §확장성).

### 팀원과 맞춰야 할 것 넷

우리가 위 모양을 제시하고, 아래만 회신받으면 `http.js`를 짤 수 있다.

| # | 물어볼 것 | 우리 기본값 |
|---|---|---|
| 1 | 이 모양으로 줄 수 있나. 못 주는 필드가 있나 | 필수 둘만 있으면 된다 |
| 2 | 어떻게 전달하나 — HTTP / 파일 / 데이터베이스 | 우선 **JSON 파일**로 받아도 된다 |
| 3 | **한 사이클의 정의** — 무엇을 하면 1개 처리인가 | 처리량의 분모라 반드시 합의해야 한다 |
| 4 | 실행이 오래 걸리나 (동기/비동기) | 동기라고 가정. 오래 걸리면 작업 ID를 추가한다 |

3번만 어긋나도 **두 배치안의 처리량을 비교할 수 없다.** 나머지 셋은 나중에 바꿔도 된다.

정해지면 이 절을 확정 계약으로 고치고 `DECISION-LOG`에 한 줄 남긴다.

## 실기 연결 — 유니티에서 **검증된 값**을 가져온다

**목표는 실기 ↔ 우리 대시보드·AR 이다.** 유니티 펜던트는 클라이언트로 받쳐야 할 대상이 아니고,
**이미 실기로 검증해 본 값의 출처**다. 우리 계약을 유니티에 맞추지 않는다 — 반대로
유니티가 실기에서 확인한 숫자와 함정을 가져다 쓴다.

정본은 `docs/ref/unity/unity-bridge-protocol.md` (2026-07-30 원본 대조).

| 항목 | 검증된 값 |
|---|---|
| 현재 로봇 응답 주소 | **`192.168.57.2:8080`** (`robotId` 프로필로 교체 가능) |
| 같은 대역 PC | `192.168.57.10/24` |
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
