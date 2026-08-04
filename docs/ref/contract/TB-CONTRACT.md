# TB-CONTRACT — 터틀봇 관제 계약

분류: **SSOT**. tb-bridge·터틀봇 웹앱·(미래의 AR)이 맞추는 유일한 합의점.
**여기를 먼저 고치고 코드를 짠다.** FR5 쪽 계약(`API-CONTRACT.md`)과 형제 문서다 —
로봇이 다르고 머신이 다르므로 계약도 분리한다. 원칙(문서 먼저·fail-closed·단위)은 같다.
2026-07-31 실사용 시나리오 감사(D32) 반영판.

## 왜 이 서버가 필요한가

터틀봇 실험은 지금 터미널·SSH 전유물이라 회전율이 낮다. 팀원 전원이 **URL 하나**로
켜고·몰고·매핑하고·기록을 보게 하려면, FR5 와 같은 구조 — **로봇의 유일한 관문 서버** —
가 터틀봇 쪽에도 필요하다.

```
TurtleBot3 Burger ×2 (tb3_1 · tb3_2)      라즈베리파이는 turtlebot3_bringup 만
      ↕ ROS 2 (WiFi · DDS)
  우분투 PC — Nav2·SLAM ×2 · 슬롯 스크립트 · tb-bridge :5055   ← 이 문서가 정의하는 것
      ↕ HTTP + WebSocket (브리지가 웹 빌드도 정적 서빙)
  팀원 폰·노트북 브라우저 — http://turtlebot.local:5055 하나
```

- **무거운 것은 전부 PC 에서 돈다.** 로봇에 스크립트를 얹으면 느려진다 — bringup 만 남긴다
- **Vercel 에 올리지 않는다.** https 페이지는 LAN 의 ws:// 에 못 붙고(혼합 콘텐츠),
  로봇 제어를 인터넷에 노출하지 않는다. 배포 = 우분투 PC 에서 `git pull` + 실행
- WiFi 가 바뀌면 `TurtleBot/bridge/config.yaml` 값 하나만 바뀐다. 코드에 IP 를 박지 않는다
- FR5 `bridge/` 와는 **형제·무의존** — 로봇마다 관문 하나, 서로 호출하지 않는다
- **API 는 브라우저 외 클라이언트에도 열려 있다** (팀원 스크립트·curl — 의도된 설계).
  신원 증명은 하지 않는다 — LAN·팀 신뢰 전제. 이 한계는 수용 리스크로 명시한다

## 단위와 좌표

바깥면은 전부 **밀리미터(mm)·도(°)·mm/s·°/s**다 (`CODING-CONVENTIONS.md` §2).
ROS 의 미터·라디안 변환은 **`ros_adapter/` 경계 한 곳**에서만 한다.
pose 는 활성 맵 원점 기준 `{ xMm, yMm, thetaDeg }`. 맵→실험실 변환은 §미래 접점 ③.

**이름 규칙은 공통이다** — 슬롯·맵 이름과 robot id 는 `[a-z0-9-_]` 만. 경로 문자는 어디서든
거부된다 (이름이 곧 파일 경로가 되기 때문이다).

## 상태 (서버 → 클라이언트) — WebSocket `/ws/state`

접속한 전원이 같은 것을 받는다. **매 틱 전체 스냅샷**이라 재접속하면 그대로 복구된다.
주기 100ms 목표 (팔과 달리 33ms 가 필요 없다 — 버거 최고 속도 220mm/s 에서 100ms 는
22mm 다. 실측 후 갱신한다).

```jsonc
{
  "t": 1785329668.42,               // 서버 시각 (초)
  "adapter": "mock",                // mock | real — 화면에 출처 배지 (SR_24 원칙)
  "robots": {
    "tb3_1": {
      "connected": true,            // 판정: 오도메트리 2초 무수신 → false + cmd_vel 0 시도
      "poseAgeSec": 0.1,            // 마지막 pose 수신 후 경과 — 얼어붙은 값 구분용
      "mode": "idle",               // idle | slot | teleop | mapping — 전이는 §모드 전이
      "nav": null,                  // null | starting | running | error — Nav2/SLAM 프로세스 생사
      "pose": { "xMm": 1200, "yMm": 340, "thetaDeg": 90 },   // 활성 맵 원점 기준
      "velocity": { "linearMmS": 0, "angularDegS": 0 },
      "batteryPct": 87,             // 못 읽으면 null
      "activeMap": "lab-0801",      // 활성 맵 슬롯 (없으면 null)
      "activeSlot": null,           // 실행 중 스크립트 슬롯 (없으면 null)
      "activeRunId": null,          // 진행 중 run (없으면 null)
      "owner": null                 // 조종권 보유자 (없으면 null)
    },
    "tb3_2": { /* 같은 모양 */ }
  }
}
```

## 명령 (클라이언트 → 서버) — 같은 WebSocket

```jsonc
{ "cmd": "hello",  "who": "kim" }              // 접속 직후 1회 — 세션에 신원을 묶는다
{ "cmd": "teleop", "robot": "tb3_1", "linearMmS": 100, "angularDegS": 30 }
{ "cmd": "estop",  "robot": "tb3_1" }          // robot 생략 시 전체. 항상 통과
```

- **`hello` 가 없는 세션의 명령은 `estop` 빼고 전부 거부**된다. owner 검사는 세션 신원으로 한다
- 슬롯 시작/정지·매핑·조종권은 REST 다. WS 명령은 **연속 스트림이 필요한 teleop** 과
  **지연이 치명적인 estop** 둘뿐이다

### 모드 전이 (로봇별 독립)

```
            ┌─────── estop · stop (어디서나) ────────┐
            ▼                                        │
  idle ──슬롯 start──▶ slot      idle ──mapping start──▶ mapping
  idle ──teleop 명령──▶ teleop   (teleop 은 명령이 곧 진입 — 별도 start 없음)
```

- **slot·teleop·mapping 시작은 idle 에서만.** mode 가 다른데 시작·teleop 명령이 오면
  거부 + 사유 응답 — 한 로봇에 cmd_vel 이 두 곳에서 겹치는 일을 계약이 막는다
- **예외 — mapping 중 teleop 은 수락한다 (mode 는 mapping 유지).** 맵은 로봇을 몰아야
  그려진다. 이때 cmd_vel 의 주인은 조이스틱 하나뿐이라 겹침이 없다 (2026-07-31 구현 대조)
- teleop 은 워치독 500ms 무신호면 정지하고, teleop 모드였다면 idle 로 돌아간다
- `estop` → 즉시 정지 + 슬롯 프로세스 종료 + **mode=idle. owner 는 유지된다**
  (estop 이 조종권 탈취 수단이 되면 안 된다). 별도 해제 절차 없음 — owner 가 즉시 재시작한다
- 명령·모드는 로봇별 독립이다. `estop` 만 robot 생략 시 전체에 걸린다

### 안전 규칙 (서버가 강제한다 — 클라이언트를 믿지 않는다)

| 규칙 | 값 |
|---|---|
| teleop 속도 상한 | 기본 **\|150\|mm/s · \|60\|°/s** (절대값 기준 — 음수는 후진·역회전) |
| teleop 워치독 | **500ms** 무신호 → 즉시 정지 (WiFi 순단 대비) |
| 값 검증 | 숫자가 아니거나 필드가 빠지면 거부. 상한 초과는 자르지 않고 **거부 + 사유** |
| `estop` | 신원·조종권·상한 무관 즉시 — 스팸으로 인한 실험 중단은 수용 리스크 |
| **프로세스 종료 시 정지 보장** | 슬롯이 어떤 이유로든 죽으면(정상·SIGKILL 불문) **브리지가 즉시 cmd_vel 0 발행** |
| 연결 손실 | 오도메트리 2초 무수신 → connected:false + cmd_vel 0 시도 |
| 슬롯 시작·teleop | 해당 로봇 **조종권 보유자만** |
| 열람 | 누구나 — 상태·맵·로그·기록은 조종권 없이 보인다 |

## 조종권 — 로봇별 (FR5 규칙 미러: 명령 주인은 한 명)

```
POST /api/owner/claim   { "robot": "tb3_1", "who": "kim" }   → 비어 있으면 부여, 아니면 409
POST /api/owner/release { "robot": "tb3_1", "who": "kim" }   → 현재 owner 와 일치할 때만. 아니면 409
```

- tb3_1 과 tb3_2 의 조종권은 독립 — 두 명이 로봇 하나씩 몬다
- **자동 해제**: owner 의 `hello` 세션이 끊기면 **10초 후 release** — 브라우저를 닫아도
  조종권이 영원히 잠기지 않는다 (teleop 정지는 워치독이 500ms 에 이미 처리)
- REST 응답이 정본이고 `/ws/state` 의 owner 반영은 다음 틱이다

## 스크립트 슬롯 — 팀원의 파이썬이 꽂히는 곳

`TurtleBot/bridge/slots/*.py` 를 스캔한 것이 목록이다. 파일을 넣으면 슬롯이 생긴다.

```
GET  /api/slots                       → [{ "name": "patrol", "description": "..." }]
POST /api/slots/{name}/start          { "robot": "tb3_1", "who": "kim", "params": {} }
                                      → 202 { "runId": "..." }  (spawn 성공만 뜻한다 —
                                        이후 생사는 상태·로그로 본다)
POST /api/robots/{robot}/stop         실행 중 슬롯 정지 (SIGTERM → 5s → SIGKILL)
```

### 슬롯 계약 (팀원용 — `bridge/slots/README.md` 에 같은 내용)

- 파일 첫 줄 docstring 한 줄이 목록의 `description` 이 된다
- 브리지가 **별도 프로세스로 실행**한다. env 로 받는다: `TB_ROBOT`(네임스페이스) ·
  `TB_MAP`(활성 맵 yaml 경로 — **맵 없이 시작하면 빈 값**. 맵 필수인 스크립트는 스스로
  검사하고 메시지를 내고 종료한다) · `TB_PARAMS`(JSON, **4KB 상한**)
- **stdout 에 쓰면 그대로 로그 화면에 흐른다** (한 줄 = 한 로그)
- **SIGTERM 을 받으면 로봇을 세우고 종료한다.** 5초 안에 안 죽으면 SIGKILL.
  어느 경로든 **종료 직후 브리지가 cmd_vel 0 을 발행**한다 — 죽은 스크립트에게
  정지 책임을 맡기지 않는다
- 종료와 동시에 run 이 마감된다: exit 0 → `completed` · `/stop` → `stopped` ·
  estop → `estop` · 그 외(비정상 exit·SIGKILL) → `error`

## 맵 슬롯과 매핑

```
GET   /api/maps                       → [{ "name": "lab-0801", "mapToLab": {...}, "savedAt": ... }]
POST  /api/maps/{name}/activate       { "robot": "tb3_1" }  → 202. 지도·AMCL 재기동은
                                        비동기 — 완료는 상태의 nav 필드(starting→running)로 본다
PATCH /api/maps/{name}                { "mapToLab": { "xMm":0, "yMm":0, "thetaDeg":0 } }
GET   /api/maps/live.png?robot=tb3_1  현재 점유격자 PNG (매핑 중엔 1s 폴링으로 그려진다)
POST  /api/mapping/start              { "robot": "tb3_1", "who": "kim" }  → 202. SLAM 기동
                                      (owner 검사가 필요한 REST 는 body 의 who 로 신원을 싣는다 —
                                       WS 의 hello 와 같은 신뢰 전제)
POST  /api/mapping/save               { "robot": "tb3_1", "name": "lab-0801" }  → 맵 슬롯 등록
POST  /api/mapping/stop               { "robot": "tb3_1" }   저장 없이 종료
```

- 맵 슬롯 = `bridge/data/maps/<name>.yaml + .pgm + .meta.json`
- `.meta.json` 의 `mapToLab { xMm, yMm, thetaDeg }` 은 저장 시 0 — 측정 후 PATCH 로 넣는다.
  측정 절차는 실기(P4)에서 정한다. §미래 접점 ③
- 맵은 아직 0개다. 목록이 비어도 화면이 깨지지 않는다 — 매핑 탭이 첫 안내를 맡는다
- **매핑은 명시적 save/stop 까지 유지된다.** 시작한 사람이 이탈해도 SLAM 은 돈다 —
  mode=mapping 이 전원에게 보이므로, 조종권을 잡은 사람이 정리(stop)할 수 있다

## 로그 — WebSocket `/ws/logs`

```jsonc
{ "t": 1785329668.42, "robot": "tb3_1", "source": "slot", "level": "info", "line": "..." }
// source: slot(스크립트 stdout) | nav(Nav2·SLAM 프로세스) | rosout | bridge(관문 자신)
```

서버는 최근 500줄을 버퍼링해 새 접속에 먼저 준다 — 새로고침해도 맥락이 남는다.
폭주 상한: 로봇·소스당 100줄/s 초과분은 버리고 `dropped` 카운트를 로그로 남긴다.

## 실험 기록 — run

슬롯 시작마다 자동 생성된다. 확장은 `metrics` 자유 필드로 한다 — 스키마 개정 없이.

```jsonc
{
  "id": "2026-08-01-1432-tb3_1-patrol",
  "robot": "tb3_1", "mapSlot": "lab-0801", "scriptSlot": "patrol", "params": {},
  "layoutId": null,                // 배치안 실험이면 배치안 id — Dashboard 비교의 연결 고리
  "startedAt": 1785329668.42, "endedAt": null,
  "result": null,                  // completed | stopped | estop | error — 판정은 §슬롯 계약
  "note": "",                      // 사람이 나중에 붙이는 메모
  "metrics": {},                   // 자유 — 생산성 실험이면 아래 규칙
  "bagPath": null                  // rosbag 녹화 시 경로
}
```

```
GET   /api/runs?robot=&slot=&limit=   목록 (최신순)
GET   /api/runs/{id}
GET   /api/runs/{id}/path             → [{ "tSec": 0.0, "xMm": ..., "yMm": ..., "thetaDeg": ... }]
PATCH /api/runs/{id}                  { "note", "metrics" }  얕은 병합 · 본문 64KB 상한
POST  /api/record/start|stop          { "robot": "tb3_1" }   rosbag 토글 → 활성 run 에 bagPath
```

- **주행 궤적**: 브리지가 run 진행 중 pose 를 1Hz 로 샘플해 저장한다 — rosbag 없이도
  경로 조회·배치안 겹치기가 된다. run 종료 시 `travelMm`(궤적 적분)를 metrics 에 자동 기입
- **생산성 실험이면** `metrics` 에 FR5 지표 계약(`API-CONTRACT.md` §생산성 지표)의
  **전체 객체** — `{ source, cycles, durationSec, metrics{throughputPerHour, cycleTimeSec, ...},
  series[{tSec,event,station}] }` — 를 그대로 담는다. `layoutId` 는 run 최상위에 있다.
  그래야 Dashboard 비교 화면이 변환 없이 먹는다. `series[].event` 는 `pick·place·arrive·depart`
- **브리지 재시작 시**: endedAt=null 인 run 은 result:"error"(사유 bridge-restart)로 마감된다.
  슬롯·rosbag 프로세스는 브리지의 자식이라 함께 죽는다 — 고아가 남지 않는다
- 자동 삭제는 하지 않는다(실험 데이터). 단 **디스크 여유가 임계 미만이면 record/start 를
  거부**하고 사유를 응답한다 (`config.yaml` 임계값)
- 저장은 `bridge/data/runs/*.json` — 저장소가 바뀌어도(`Database/` 확정 시) 이 계약은 그대로다

## 미래 접점 — 계약은 지금, 구현은 나중에

1. **FR5 협업** — "AMR 도착 → 팔 픽" 같은 시나리오는 **슬롯 스크립트가 두 관문(tb-bridge ·
   FR5 bridge)의 클라이언트**가 되어 조율한다. 관문끼리 직접 호출 금지 — 각자 자기 로봇의
   안전만 지킨다. TB 쪽은 스크립트가 rclpy 로 Nav2 goal·도착 판정을 직접 하고, FR5 쪽은
   WS 명령(moveJ·gripper)과 `/ws/state` 의 `motionQueueLength` 로 완료를 판정한다 —
   두 계약만으로 성립함을 감사에서 의사코드로 확인했다 (evidence 2026-07-31)
2. **지표 어휘** — 위 §실험 기록의 생산성 규칙. 겉모양까지 FR5 계약과 맞춘다
3. **좌표 원점** — 실험실 바닥 고정점(mm·도)이 전 도메인 기준(SR_23). SLAM 맵은 원점이
   맵마다 다르므로 `mapToLab` 변환값을 맵 메타에 두고 PATCH 로 넣는다. 이 값 하나로
   주행 경로↔배치안 겹치기, AR 오버레이, 배치안 `waypointsMm`→goal 변환이 전부 풀린다.
   변환은 브리지 경계 한 곳
4. **AR 은 읽기 전용 소비자** — `GET`·`/ws/state` 만 읽어 AMR 위치·경로를 겹친다.
   명령 전송 금지. 예정 경로가 필요해지면 `GET /api/robots/{id}/plan` 을 쓴다 (이름만 예약)
5. **Vision** — 터틀봇 쪽 비전이 범위에 들어오는 날 FR5 와 같은 `POST /proposal` 규약
   (제안→safety 검사→통과분만, fail-closed)을 얹는다. 지금은 이름만 예약

## 검증된 값 — P4 실기에서 채운다

| 항목 | 값 | 상태 |
|---|---|---|
| 로봇 기종 | TurtleBot3 Burger ×2 (repo2: tb3_1 · tb3_2) | 저장소 확인 |
| ROS 2 | Jazzy · Nav2 · AMCL (repo2) | 저장소 확인 |
| 브링업 | **네임스페이스 방식** — `dual_bringup.launch.py namespace:=tb3_1` (도메인 하나) | 원본 대조 2026-07-31 |
| cmd_vel | `/{ns}/cmd_vel` · **TwistStamped** (Twist 아님 — Jazzy · enable_stamped_cmd_vel) | 원본 대조 2026-07-31 |
| 위치 | `/{ns}/amcl_pose`(map 좌표·정본) → 폴백 `/{ns}/odom`(드리프트) | 원본 대조 2026-07-31 |
| 맵 저장 | `/map` OccupancyGrid 구독(TRANSIENT_LOCAL) — 로봇엔 map_server 없음 | 원본 대조 (repo2 `_t1_save_map.py`) |
| 배터리 토픽 | repo2 에 사용처 없음 — 실기에서 `/{ns}/battery_state` 존재 확인 | **미확인** |
| 상태 주기·WiFi 대역 | 100ms 목표 | **미실측** |
| PC·로봇 IP | `config.yaml` | WiFi 변경 예정 — 값만 교체 |

## 바꿀 때

1. 이 파일을 먼저 고친다
2. `docs/status/DECISION-LOG.md` 에 왜 바꿨는지 한 줄
3. 그 다음 브리지·웹 코드
4. 필드를 지우거나 이름을 바꾸면 팀(슬롯 작성자 포함)에 먼저 알린다
