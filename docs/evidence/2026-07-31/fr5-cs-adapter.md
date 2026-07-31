# FR5 실기 어댑터 — 검증된 C# SDK 서브프로세스 경로 실측 (D41)

분류: **증거**. libfairino.dll 을 Unity 번들 Mono 서브프로세스로 감싸 브리지에 붙였고,
실기 `192.168.57.2:8080` 에 **observe-only 로 전 구간(E2E) 통과**했다. 모션·서보 명령은 0건.

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
