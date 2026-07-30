# SDK 상태 구조체 필드 전수 — 열린 항목 3건 종료

분류: 증거 · 2026-07-30

`docs/ref/SAFETY-RULES.md`에 남아 있던 "아직 확인 안 한 것" 3건을 닫기 위해
상태 구조체 필드를 전수로 뽑았다.

## 방법

원본 `FAIR-INNOVATION/fairino-python-sdk` `linux/fairino/Robot.py` (19,365줄, 686KB)를 내려받아
`("필드명", c_타입), # 주석` 패턴을 전부 추출했다. 이름으로 찾지 않고 **목록을 먼저 만들어 훑었다**
(`AGENTS.md` §"없다"고 말하기 전에 규칙 2).

## 규모

| 구분 | 개수 |
|---|---|
| **상태 구조체 필드 (`c_` 타입)** | **150** |
| 별칭 매핑 항목 | 142 |
| 합계 (추출 원시 건수) | 292 |

별칭은 `emergency_stop → "EmergencyStop"` 같은 이름 대응표다. **실제 필드는 150개다.**

### 용도별 분류

| 분류 | 개수 |
|---|---|
| 위치·자세 | 25 |
| 오류·고장 | 22 |
| 모드·상태 | 17 |
| 안전·정지 | 16 |
| 그리퍼 | 13 |
| IO | 8 |
| 전류·토크·온도 | 6 |
| 속도·가속 | 5 |
| 충돌 | 2 |
| 기타 | 36 |

---

## 열린 항목 ① 비상정지 필드 — 종료

**있다. 10개 이상.**

| 필드 | 타입 | 원문 주석 |
|---|---|---|
| **`EmergencyStop`** | `c_uint8` | 急停标志，0-急停未按下，1-急停按下 |
| `safety_stop0_state` | `c_uint8` | 安全停止信号SI0 |
| `safety_stop1_state` | `c_uint8` | 安全停止信号SI1 |
| `btnBoxStopSignal` | `c_uint8` | 按钮盒急停信号 |
| `safetyDoorAlarm` | `c_uint8` | 安全门警告 |
| `safetyPlaneAlarm` | `c_uint8` | 进入安全墙警告 |
| `alarmCheckEmergStopBtn` | `c_uint8` | 通信异常，检查急停按钮是否松开 |
| `safetyDataState` | `c_uint8` | 安全数据状态标志 |
| `safetyBoxSingal` | `c_uint8 * 6` | 机器人按钮盒按钮状态 |
| `alarmRebootRobot` | `c_uint8` | 1-비상정지 해제 후 컨트롤박스 재기동 필요 |

**`safetyPlaneAlarm`(안전벽 진입 경고)이 중요하다.** 로봇이 자체 안전벽을 갖고 있다는 뜻이므로,
AR에 그리는 안전 영역과 로봇이 아는 영역을 **일치시켜야 한다.** 다르면 화면과 실제가 어긋난다.

## 열린 항목 ② `cmdPointError` — 종료

**플래그다.** `c_uint8`, 주석 `指令点错误`(지령점 오류).

수치가 아니므로 임계값을 조절할 수 없다. 임계값이 필요하면
`lastServoTarget`(큐의 마지막 ServoJ 목표, `c_double * 6`)과 실제 관절값의 차이를
**서버가 직접 계산**해야 한다. 선택지는 둘이고, 우선 플래그로 시작하는 쪽이 싸다.

## 열린 항목 ③ 그리퍼 필드 — 종료

**13개.**

| 필드 | 타입 | 원문 주석 |
|---|---|---|
| **`gripper_motiondone`** | `c_uint8` | 0-미완, **1-완료(물체 없음), 2-완료(물체 감지)** |
| **`gripper_fault`** | `c_uint16` | 0-정상 1-485타임아웃 2-지령오류 **3-작업물 낙하** |
| `gripper_fault_id` | `c_uint8` | 오류 그리퍼 번호 |
| `gripper_active` | `c_uint16` | 활성화 상태 |
| `gripper_position` | `c_uint8` | 위치 |
| `gripper_speed` | `c_int8` | 속도 |
| `gripper_current` | `c_int8` | 전류 |
| `gripper_temp` | `c_int` | 온도 |
| `gripper_voltage` | `c_int` | 전압 |
| `gripperError` | `c_uint8` | 오류 |
| `gripperRotNum` | `c_float` | 회전 그리퍼 현재 회전수 |
| `gripperRotSpeed` | `c_uint8` | 회전 속도 % |
| `gripperRotTorque` | `c_uint8` | 회전 토크 % |

**`gripper_motiondone`이 물체를 잡았는지 아닌지를 구분한다(1 vs 2).**
픽앤플레이스에서 "집기 실패"를 판정할 수 있다는 뜻이다. `gripper_fault`의 `3-작업물 낙하`도 같은 용도다.
이건 v3 안전 조건 목록에 없던 것으로, 우리가 추가로 쓸 수 있는 값이다.

---

## 이 조사에서 나온 프로세스 결함

필드 수를 **150 → 292 → 150**으로 두 번 바꿔 말했다.
첫 추출 정규식이 좁아 150이 나왔고, 넓히니 292가 나왔는데, 292에는 별칭 매핑이 섞여 있었다.
**숫자를 정정할 때는 무엇을 세는지를 함께 정의해야 한다** — "필드 150개"와 "추출 건수 292개"는 둘 다 맞다.

이번을 포함해 같은 유형의 실수가 오늘 세 번이다(v3 메서드 4개, 드리프트, 필드 수).
`AGENTS.md`의 규칙에 아래를 추가했다 — **개수를 보고할 때는 세는 단위를 함께 적는다.**
