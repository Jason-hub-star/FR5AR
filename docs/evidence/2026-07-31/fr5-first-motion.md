# FR5 실기 첫 웹 조그 — 순수 파이썬 어댑터로 성공

분류: **증거**. 2026-07-31 저녁, 웹 브리지 경로(조종권→현장확인 ARM→게이트→MoveJ)로
실물 FR5 를 처음 움직였다.

## 실측

| 항목 | 값 |
|---|---|
| 경로 | WS jog → 조종권·hello → SAFETY-RULES 게이트 → Python SDK MoveJ (vel 10%) |
| 동작 | j1 `-81.852° → -80.852°` (+1.000°) — 중간값 `-81.777°` 스트림 포착, 큐 소진 확인 |
| 직전 | 사용자 브라우저 조그 `-1°` 도 실행됨 — 왕복 2동작 |
| 정체 | 모델 `FR5-V1-002(V6.0)` · 웹 `v3.9.3.1` · 컨트롤러 `V3.9.15-QX` (GetSoftwareVersion 실측) |

## 오늘의 근본 원인 사슬 (다음 사람을 위해)

1. **C# dll(macOS Mono)의 xmlrpc 클라이언트가 고장** — 쓰기 호출마다 예외. 공식 소스의
   catch 가 이를 삼켜 RobotEnable 은 `-4`, MoveJ 는 **가짜 성공(0)** 을 반환했다.
   "명령이 조용히 무시되는" 증상의 정체
2. 그 클라이언트가 **컨트롤러 xmlrpc 서비스(20003)를 다운**시켰다 — 펜던트 로그인 불가,
   버전 문자열 공백, 전 포트 거부까지 전부 이 하나의 결과. 제어함 재부팅으로 복구
3. "Python SDK 는 리눅스 전용" 가정은 **오류** — 원본은 순수 표준 라이브러리 (D42)
4. 나머지 방해 요소: 전역 속도 슬라이더 0%(펜던트에서 1로), 프로필 모델 문자열 불일치
   (실측값 등재로 해소), xmlrpc 동시성(어댑터 잠금으로 해소)

## 남긴 것

- 실기 게이트 P2 잔여: 2클라이언트 409 실기 확인·10분 폴링은 다음 현장 세션에서
- `fairino_cs/`(C# 경로)는 폐기 — 코드는 증거로 남기되 어디서도 부르지 않는다

---

## 부록 — 폐기된 C# 경로의 실측 기록 (D41→D42)

당시 결론("실기 E2E 통과")은 읽기 한정으로만 유효했다. 아래는 원기록이다.

## 실측 순서와 결과

| 단계 | 결과 |
|---|---|
| dotnet 10 으로 dll 로드 | **실패** — `AppDomain.DefineDynamicAssembly` 없음 (.NET Framework 전용 API) |
| Unity 번들 Mono 6.13 (6000.3.11f1) | **성공** — 스모크를 돌린 그 런타임. csc.exe 로 컴파일 (`fairino_cs/build.sh`) |
| `RPC(192.168.57.2)` connect | `ok` — SDK 가 stdout 에 "连接成功" 등 자기 로그를 섞는다 (소비자는 비JSON 줄 폐기) |
| `GetSDKVersion` | `"C#SDK-V1.2.4  Web-3.9.3"` — 아침 실측과 일치 |
| `GetSoftwareVersion`/`GetFirmwareVersion` | code 0 + **빈 문자열** — 모델·펌웨어 문자열 검증 불가 → preflight 는 "보고된 값만" 검증으로 정밀화 |
| `GetRobotRealTimeState` | 관절 `[-80.8509, -98.3535, 91.2481, …]` — 아침 readback 과 자리수 일치 (로봇 부동) |
| `ROBOT_STATE_PKG` 전수 | **78필드** — `main_code`·`sub_code`·`EmergencyStop`·`collisionState`·`mc_queue_len`·`safety_stop0/1_state`·`rbtEnableState`·`lastServoTarget` 있음 · `cmdPointError`·`strangePosFlag`·드래그티칭 필드 **없음** |
| `IsInDragTeach(ref byte)` | 메서드로 대체 성공 → `dragTeach: 0` |
| 브리지 E2E (`POST /connect` fr5-lab-a) | `OBSERVE_ONLY` 진입 · `/state` 60회 연속 JSON 정상 · disconnect 정상 |

## 게이트 매핑 조정 (SAFETY-RULES 대비)

- 조건 8(cmdPointError) → 필드 부재. **#9 대안** (`lastServoTarget` vs 실측 차 ≤5°) 로 대체.
  지령 이력이 전무(전부 0)면 건너뛴다 — 현 실기가 그 상태다
- 조건 19(strangePose) → 부재. v3 목록 밖 "권장" 항목이라 게이트에 넣지 않았다
- NaN/inf 수치 샘플 → 폐기 + 직전 값 유지(신선도 게이트가 모션 차단), **연속 3회면 연결 손실**
  판정 (유니티 폴백 정책 이식)

## 확인하지 않은 범위

- **실기 arm(서보 ON)·jog·stop** — 코드·게이트는 mock 33/33 으로 닫았지만 실기는
  현장 확인(하드룰 3) 후 별도 체크리스트로 승격한다
- 그리퍼 시그니처 (`ActGripper`/`MoveGripper`) — P3
- 장시간(10분+) 실기 폴링 안정성 — V0 실기 체크리스트
