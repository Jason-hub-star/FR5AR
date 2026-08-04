> **출처: Unity 프로젝트 (FR5UNITY)** — 원본 `robotapp/Assets/Scripts/App/Fairino/`
> 이 문서는 **Unity 기준**이다. 웹(three.js)에 그대로 적용하지 마라 — 좌표계와 단위가 다르다.
> 웹 기준은 `docs/ref/arch/CODING-CONVENTIONS.md`가 이긴다.

# unity-bridge-protocol — 유니티가 실기에서 검증한 값

분류: **참고**(위 배너대로 Unity 기준). **우리가 구현할 프로토콜이 아니다.**
FR5 브리지(`FR5/bridge/`)를 짤 때 **숫자와 함정을 가져오는 출처**다.
조사 2026-07-30 — OpenCode 정찰 후 **`FairinoBridgeClient.cs` 원본을 직접 열어 대조**했다.

## 이 문서의 위치 — 출처이지 계약이 아니다

**목표는 실기 ↔ 우리 대시보드·AR 이다.** 유니티 펜던트는 받쳐야 할 클라이언트가 아니고,
같은 로봇을 이미 실기로 붙여 본 **선례**다. 그래서 이 문서에서 가져오는 것은 둘이다.

1. **검증된 숫자** — IP·포트·타임아웃·폴링 주기·브링업 순서
2. **실기에서 밟은 함정** — 이게 더 값어치 있다 (§6)

**필드명·엔드포인트 모양을 그대로 베끼지 않는다.** 우리 계약은 `API-CONTRACT.md` 이고
이름은 우리 규칙(`CODING-CONVENTIONS.md`)을 따른다. 다만 **필드 목록**은 참고한다 —
우리 초안에 `enabled`·`safetyStop`·`inDragTeach` 가 빠져 있었고, 그게 없으면
안전 판정을 못 한다는 것을 이 조사로 알았다.

---

## 1. 네트워크 — 실기에서 통한 값

| 항목 | 값 | 검증 |
|---|---|---|
| FR5 eth0 | **`192.168.57.2`** | `CONNECT_OK` 확인 |
| FR5 eth1 | `192.168.58.2` | `ping` + `nc` + `CONNECT_OK` 확인 |
| FR5 포트 | **`8080`** | 확인 |
| 맥북 이더넷 (같은 대역) | `192.168.57.10/24` | 현장 기록 |
| 브리지 주소 | **`http://127.0.0.1:5055`** | `FairinoBridgeClient.cs:144` 하드코딩 폴백 |
| 환경변수 | `FAIRINO_BRIDGE_URL` · `FAIRINO_IP` · `FAIRINO_PORT` | 설정되면 우선 |

**`FAIRINO_BRIDGE_URL` 이 설정되면 유니티가 즉시 브리지 모드로 붙는다.**
→ 우리 서버를 `127.0.0.1:5055` 에 띄우면 유니티가 그대로 연결된다.

## 2. 엔드포인트와 타임아웃 (원본 확인)

| 메서드 | 엔드포인트 | 페이로드 | 타임아웃 | 줄 |
|---|---|---|---|---|
| Connect | `POST /connect` | `{"ip": string, "port": int}` | **3000ms** | `:35-36` |
| Disconnect | `POST /disconnect` | `{}` | **3000ms** | `:57` |
| ReadState | `GET /state` | — | **500ms** | `:75` |
| GetVersion | `GET /version` | — | **3000ms** | `:106` |

**`/state` 타임아웃이 500ms다.** 서버가 그보다 느리면 유니티가 실패로 처리하고
읽기 백오프에 들어간다 (4회 이상 실패 → 5.0s, 미만 → `0.5 × 실패횟수` 초).

## 3. 응답 스키마 — 필드 **목록**을 참고한다

우리가 이 모양으로 응답할 필요는 없다. 볼 것은 **"실기에서 실제로 쓰이는 필드가 무엇인가"** 다.

모든 응답의 공통 껍데기 (`BridgeBasicResponse`):

```jsonc
{ "ok": true, "errorCode": 0, "message": "…" }
```

`GET /state` — **플랫이든 `state` 안에 넣든 둘 다 받는다.**
원본이 `var payload = response.value.state ?? response.value;` 다 (`:83`).

```jsonc
{
  "ok": true, "errorCode": 0, "message": "",
  "jointsDeg": [0,0,0,0,0,0],          // double[6]
  "tcpMmDeg":  [0,0,0,0,0,0],          // double[6]  ← 우리가 tcpMm 이라 쓴 그것
  "mode": 0,                            // 0=auto 1=manual
  "motionQueueLength": 0,
  "safetyCode": 0,
  "realtimeStateSamplePeriodMs": 33,
  "mainErrorCode": 0, "subErrorCode": 0,
  "toolId": 0, "userId": 0,
  "connected": true,
  "enabled": false,                     // 서보 on/off
  "emergencyStop": false,
  "collisionDetected": false,
  "inDragTeach": false,
  "safetyStop": false
}
```

`GET /version`:

```jsonc
{ "ok": true, "errorCode": 0, "message": "",
  "firmwareVersion": "", "sdkVersion": "", "softwareVersion": "",
  "controllerVersion": "", "hardwareVersion": "" }
```

**우리가 여기서 가져온 것은 필드 목록이다.** 초안에 없던
`enabled`(서보) · `safetyStop` · `inDragTeach` · `collisionDetected` ·
`mainErrorCode`/`subErrorCode` · `motionQueueLength` 가 여기서 나왔다.

**나중에 유니티를 붙이기로 하면** 그때는 이름이 정확히 맞아야 한다 — JSON 역직렬화라
이름이 다르면 에러 없이 0이 들어가고 관절이 전부 0으로 보인다. 그 경우 우리 계약을
바꾸지 말고 **변환 라우트 하나를 더한다** (`API-CONTRACT.md` §유니티 펜던트).

## 4. 브링업 순서 (연결 후 정책)

`FairinoConnectionService.Connect(ip, port, applyLiveBringupPolicies=true)` 순서:

```
client.Connect(ip, port)
  ↓  readback-only 가 아니면
SetReconnect(enable=true, timeoutMs=30000, periodMs=500)
SetRealtimeStateSamplePeriod(33)
ExitDragTeach()
EnsureAutoMode()            // = SetMode(0)
  ↓
EmitCurrentState()
```

모드 전환은 **검증까지 한다** — 변경 후 `retry 6회 · delay 150ms` 로 상태를 재조회해
실제로 바뀌었는지 확인한다 (`FairinoConnectionService.cs:384-385`).

## 5. 폴링 — 33ms 가 기본이고 실측은 27.37Hz다

| 항목 | 값 |
|---|---|
| 기본 주기 | **33ms** (`realtimeSampleMs: 33`) |
| 오류 시 폴백 주기 | 50ms (연속 2회 오류) |
| 연결 손실 판정 | 연속 3회 오류 |

**현장 실측 (맥북 direct readback)**

| 설정 | 실제 |
|---|---|
| 100ms | 8.93 Hz |
| 50ms | 18.66 Hz |
| **33ms** | **27.37 Hz** |

→ **`API-CONTRACT.md` 의 "초당 30회" 는 낙관값이다.** 33ms 로 돌려도 27Hz 남짓이다.
왜 33ms 인지는 **문서에 이유가 적혀 있지 않다** (기본값으로만 존재).

## 6. 실기에서 걸렸던 함정 — 우리도 그대로 밟는다

원문 인용. **이 목록이 이 문서의 가장 값어치 있는 부분이다.**

| 함정 | 무슨 일이 났나 |
|---|---|
| **macOS 직접 SDK 실패** | `"macOS direct SDK 실패 시 사용하는 readback-only HTTP bridge"` — 브리지가 존재하는 이유 자체다 |
| **서보 OFF 면 모드 교정을 거부한다** | `"Some controllers refuse auto-mode correction while servo is still off. Bring servo up first, then normalize drag/auto as a best-effort follow-up."` → **서보를 먼저 올리고 모드를 나중에** |
| **fault 1/1 이 ResetErrors 로 안 풀린다** | `"ResetErrors()는 0/OK였지만 후속 sync에서도 fault=1/1이 유지됐다"` → 컨트롤러 쪽에서 풀어야 한다 |
| **stale 소켓이 포트를 잡고 있다** | `"Unity를 재시작해 stale FR5 SDK sockets를 정리한 뒤에는 8080 포트가 다시 열렸다"` → 연결 안 되면 **프로세스를 죽여본다** |
| **그리퍼 readback 이 5초 늦다** | `"명령 직후에는 여전히 'readback 확인 안 됨'이 먼저 표시되고 약 5초 뒤 SDK/UI가 수렴"` → 즉시 판정하면 오판한다 |
| **auto 모드 전후로 그리퍼 값이 다르다** | `"before auto mode + DAHUAN: 0% close → SDK position=96. after auto mode + DAHUAN: 0% → position=0"` |
| **`port` 가 SDK 에 전달되지 않는다** | `"port는 진단 메시지 수준으로만 사용함"` — C# 경로의 알려진 결함 |
| **브리지는 읽기 전용이었다** | Enable/Move/IO/Gripper 전부 `errorCode -80` + `"실기 이동 차단됨"` |

## 7. 안전 — 클라이언트에 비상정지 버튼은 없다

`EnsureReadyForLiveMotion()` 게이트: **connected + enabled + !drag + mode=0 + !emergency
+ !safety + noError** 를 **전부** 통과해야 움직인다 (`LiveFairinoClient.cs:978-1017`).

- 클라이언트가 보낼 수 있는 것은 `StopMotion()`(폴백 `MoveStopJ()`) 뿐이다
- **하드웨어 비상정지는 컨트롤러·펜던트의 물리 버튼에 의존한다** — 소프트웨어로 대체하지 않는다
- 이는 `docs/ref/contract/SAFETY-RULES.md` 의 fail-closed 와 같은 방향이다

## 8. 그리퍼는 별 통신이 아니다

로봇 SDK 경유다. 같은 RPC 연결(`192.168.57.2:8080`)로 컨트롤러가 그리퍼와 485 통신한다.

- 활성화 순서 — `ConfigureGripper(profile)` → `ActivateGripper(profile, true)` → `MoveGripper(…)`
- PGEA-100-40 기본 프로파일 — `company=2, device=4, softVersion=0, bus=0, index=1`
- 현장 확인된 DAHUAN PGI-140 — `company=2, device=4, soft=0, bus=0`
- `blocking` 인자는 **`0`=블로킹**이다 (SDK 관례가 뒤집혀 있다)
- 최대 대기 `30000ms` 캡

## 9. 검증됨 / 코드에만 있음

**우리가 근거로 쓸 수 있는 것은 왼쪽뿐이다.**

| 실기 검증 완료 | 코드에만 있고 현장 기록 없음 |
|---|---|
| 연결 `.57.2:8080` · `.58.2:8080` | `SetReconnect` 재연결 시나리오 |
| 상태 readback (관절·TCP) | `SetRealtimeStateSamplePeriod` 변경 시험 |
| 버전 읽기 | `MoveL` · `ServoJ`(하드코딩 비활성) · `ServoCart` |
| 자동/수동 모드 전환 (펜던트 주도) | IO (`RobotDo`/`ToolDo`) |
| 폴링 33ms→50ms 자동 폴백 | **HTTP 브리지 실물 연결** — 테스트 서버로만 검증 |
| Tiny MoveJ ±1° 전축 · ±5° J5/J6 | 6축 광범위 모션 · TCP jog · MoveL |
| 티칭 지점 1~2점 1회 실행 | 티칭 반복 루프 |
| 그리퍼 0%/100% · 가시 테스트 | `ResetErrors` 로 fault 해소 (**실패 기록 있음**) |

**HTTP 브리지가 실물과 연결된 기록은 없다.** 유니티는 테스트 서버(`BridgeTestServer`)로만
검증했다. 즉 우리가 서버를 짜면 **그 경로의 첫 실기 검증자가 된다.**

→ 왼쪽 표의 값은 근거로 쓰고, 오른쪽은 **"유니티도 안 해봤다"** 로 취급한다.
특히 `MoveL`·TCP jog·광범위 모션은 우리가 처음 하는 것이다.

## 10. 정찰이 틀린 것 하나

정찰 리포트가 **"FAIRINO SDK는 C# 전용(`libfairino.dll`)"** 이라고 결론지었다.
**유니티 프로젝트 안에서만 사실이다.** 파이썬 SDK 는 실재하고 우리가 이미 받아 뜯었다 —
`FAIR-INNOVATION/fairino-python-sdk` `Robot.py` 19,365줄, 상태 필드 150개
(`docs/evidence/2026-07-30/sdk-state-fields.md`). D4(FastAPI + 공식 파이썬 SDK)는 유효하다.

**다만 미확인이 남는다** — 유니티에서 실패한 것은 **macOS 의 C# 바인딩**이었다.
파이썬 SDK 가 macOS 에서 되는지는 **아직 아무도 확인하지 않았다.**
그게 `FR5/bridge/` 착수 시 첫 관문이다.
