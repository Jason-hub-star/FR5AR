# 안전 게이트 — 서버가 강제한다, 클라이언트를 믿지 않는다 (SAFETY-RULES.md 가 정본).
# 제1원칙: 값을 못 읽으면 통과가 아니라 차단이다. 기본 반환은 차단이고 전부 통과해야 허용.
# 상한 초과는 자르지 않고 거부한다 — 잘라주면 클라이언트 버그가 숨는다 (TB 규칙 미러).
import math

SPEED_CAP_PCT = 10.0            # v3 DefaultLiveSpeedCapPercent (SAFETY-RULES §상한)
JOINT_DELTA_CAP_DEG = 5.0       # v3 tiny-MoveJ 상한
STATE_FRESH_S = 0.5             # 조건 10 — 최신 상태 신선도 (33ms 폴링 기준 넉넉히)
DRIFT_CAP_DEG = 5.0             # 조건 8 대안(#9) — lastServoTarget vs 실측 차이

# URDF fairino5_v6 <limit> 실측 추출 (라디안→도 변환, 2026-07-31) — 조건 12
# 실기 컨트롤러가 보고한 소프트리밋과 대조해 확정 (2026-08-04 · GetJointSoftLimitDeg).
# j3 만 URDF 값(±162)이 컨트롤러(±160)보다 넓었다 — **좁은 쪽을 쓴다.** 우리가 더 넓으면
# 컨트롤러가 거부할 목표를 게이트가 통과시킨다.
JOINT_LIMITS_DEG = [
    (-175.0, 175.0), (-265.0, 85.0), (-160.0, 160.0),
    (-265.0, 85.0), (-175.0, 175.0), (-175.0, 175.0),
]

# 게이트가 반드시 읽어야 하는 안전 필드 — 하나라도 결측이면 차단 (조건 2·4·22 재료)
REQUIRED_FOR_MOTION = ["emergencyStop", "safetyStop", "collisionDetected",
                       "inDragTeach", "mainErrorCode", "subErrorCode"]


def _common_safety(state, state_age_s, applied_settings):
    """관절·그리퍼가 **함께** 지나는 관문. 두 게이트가 이 판정을 복붙하면 한쪽만 고쳐진다.
    state 가 None 이면 다른 사유를 버리고 fail-closed 한 줄만 돌려준다 (호출자가 즉시 반환)."""
    reasons = []
    # 조건 26 — 컨트롤러 충돌 감지는 기본으로 안 켜져 있다. 브리지가 넣었다는 기록이
    # 없으면 조건 4·5 는 판정할 게 없는 상태다 (SAFETY-RULES §설정이 전제다)
    if not applied_settings:
        reasons.append("안전 설정 적용 기록이 없다 — 충돌 감지가 켜졌는지 모른다 (조건 26)")
    elif applied_settings.get("mismatch"):
        reasons.append("안전 설정 되읽기 불일치 — " + " · ".join(applied_settings["mismatch"]))
    if state is None:
        return ["상태를 읽지 못했다 — fail-closed (조건 17)"]
    if state_age_s > STATE_FRESH_S:
        reasons.append(f"상태가 낡았다 — {state_age_s:.2f}s > {STATE_FRESH_S}s (조건 10)")

    safety = state.get("safety") or {}
    for f in REQUIRED_FOR_MOTION:
        if f not in safety:
            reasons.append(f"안전 필드 결측 — safety.{f} (제1원칙: 결측=차단)")
    if safety.get("emergencyStop"):
        reasons.append("비상정지 작동 중 (조건 1)")
    if safety.get("safetyStop"):
        reasons.append("안전정지 신호 (조건 22)")
    if safety.get("mainErrorCode") or safety.get("subErrorCode"):
        reasons.append(f"컨트롤러 오류 {safety.get('mainErrorCode')}/{safety.get('subErrorCode')} (조건 2)")
    if safety.get("collisionDetected"):
        reasons.append("충돌 감지 상태 (조건 4)")
    if safety.get("inDragTeach"):
        reasons.append("드래그 티칭 중 — 명령을 보내지 않는다")
    return reasons


def check_motion(state, state_age_s, target_deg, speed_pct, applied_settings=None):
    """jog/moveJ 게이트 (SAFETY-RULES §명령별 최소 조건). 반환: 사유 목록, 비면 허용."""
    reasons = _common_safety(state, state_age_s, applied_settings)
    if state is None:
        return reasons
    if state.get("motionQueueLength", 1) != 0:
        reasons.append(f"모션 큐가 비어있지 않다 — {state.get('motionQueueLength')} (조건 6)")
    if not state.get("enabled"):
        reasons.append("서보 OFF (arm 이 안 됐다)")
    if state.get("mode") != 0:
        reasons.append(f"auto 모드가 아니다 — mode={state.get('mode')}")

    joints = state.get("jointsDeg") or []
    # 현재값이 유한한 숫자가 아니면 delta 비교가 NaN 으로 조용히 통과한다 — 명시적으로 차단
    if len(joints) != 6 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in joints):
        reasons.append("현재 관절값이 비정상 (NaN/결측) — fail-closed")

    # 조건 8 대안(#9) — 직전 서보 지령과 실측의 괴리. 지령 이력이 없으면(전부 0) 건너뛴다
    servo_target = state.get("lastServoTargetDeg")
    if servo_target and any(abs(v) > 1e-9 for v in servo_target) and len(joints) == 6:
        drift = max(abs(a - b) for a, b in zip(servo_target, joints))
        if drift > DRIFT_CAP_DEG:
            reasons.append(f"지령·실측 괴리 {drift:.2f}° > {DRIFT_CAP_DEG}° (조건 8 대안)")

    # 상한·한계 (조건 12 + §상한)
    if not isinstance(speed_pct, (int, float)) or speed_pct != speed_pct or not (0 < speed_pct <= SPEED_CAP_PCT):
        reasons.append(f"속도 상한 초과 또는 비정상 — {speed_pct} (상한 {SPEED_CAP_PCT:.0f}%)")
    if not isinstance(target_deg, list) or len(target_deg) != 6 \
            or not all(isinstance(v, (int, float)) and v == v for v in target_deg):
        reasons.append("목표 관절이 6축 숫자가 아니다")
    else:
        if len(joints) == 6:
            delta = max(abs(t - c) for t, c in zip(target_deg, joints))
            if delta > JOINT_DELTA_CAP_DEG:
                reasons.append(f"관절 변화 {delta:.2f}° > 상한 {JOINT_DELTA_CAP_DEG}° — 거부")
        for i, (t, (lo, hi)) in enumerate(zip(target_deg, JOINT_LIMITS_DEG)):
            if not (lo <= t <= hi):
                reasons.append(f"j{i + 1} 목표 {t:.2f}° 가 URDF 한계 [{lo}, {hi}] 밖 (조건 12)")
    return reasons


def check_gripper(state, state_age_s, pct, applied_settings=None):
    """그리퍼 전용 게이트 (API-CONTRACT §그리퍼). 관절이 아니다 —
    5°·URDF 한계·모션큐·auto 모드는 **걸지 않는다.** 그대로 복붙하면 통과할 수 없거나
    엉뚱한 값으로 판정한다 (감사 P1). 반환: 사유 목록, 비면 허용."""
    reasons = _common_safety(state, state_age_s, applied_settings)
    if state is None:
        return reasons

    if not state.get("enabled"):
        reasons.append("서보 OFF (arm 이 안 됐다)")

    grip = state.get("gripper")
    if not isinstance(grip, dict):
        return reasons + ["그리퍼 상태를 못 읽었다 — fail-closed (제1원칙)"]
    for f in ("fault", "active"):
        if grip.get(f) is None:
            reasons.append(f"그리퍼 필드 결측 — gripper.{f} (제1원칙: 결측=차단)")
    if grip.get("fault"):
        reasons.append("그리퍼 고장 신호 (gripper.fault)")
    if grip.get("active") is False:
        reasons.append("그리퍼가 활성화되지 않았다 — 먼저 활성화한다 (ActGripper)")

    if not isinstance(pct, (int, float)) or isinstance(pct, bool) \
            or not math.isfinite(pct) or not 0 <= pct <= 100:
        reasons.append(f"그리퍼 pct 가 0~100 숫자가 아니다 — {pct}")
    return reasons


def check_arm(state, state_age_s):
    """ARMED 승격 게이트 — 서보를 올리기 전의 최소 확인. 반환: 사유 목록."""
    reasons = []
    if state is None:
        return ["상태를 읽지 못했다 — fail-closed"]
    if state_age_s > STATE_FRESH_S:
        reasons.append(f"상태가 낡았다 — {state_age_s:.2f}s")
    safety = state.get("safety") or {}
    for f in REQUIRED_FOR_MOTION:
        if f not in safety:
            reasons.append(f"안전 필드 결측 — safety.{f}")
    if safety.get("emergencyStop"):
        reasons.append("비상정지 작동 중")
    if safety.get("safetyStop"):
        reasons.append("안전정지 신호")
    if safety.get("mainErrorCode") or safety.get("subErrorCode"):
        reasons.append(f"컨트롤러 오류 {safety.get('mainErrorCode')}/{safety.get('subErrorCode')}")
    if safety.get("collisionDetected"):
        reasons.append("충돌 감지 상태")
    # ARM 은 마지막에 ExitDragTeach + SetMode(0) 을 부른다 — 사람이 팔을 잡고 있는 동안
    # 부르면 손 안에서 팔이 굳는다 (조건 25). 사람이 손을 떼고 펜던트에서 끄면 풀린다.
    if safety.get("inDragTeach"):
        reasons.append("드래그 티칭 중 — 사람이 팔을 잡고 있다 (조건 25)")
    return reasons


def check_workspace(tcp_mm, ws, coord=None):
    """작업영역 게이트 — **조건 12 의 카테시안 절반**. 관절 한계만으로는 손끝이 작업대를
    뚫는 것을 못 막는다 (`SAFETY-RULES.md` §FR-HMI — 위치 방어선은 우리 소프트리밋뿐이다).

    실측 근거는 `evidence/2026-08-05/workcell-measure.md` — 로봇이 직접 짚은 5점이다.
    **ws 가 없으면 판정하지 않는다** (mock·미측정 프로필). 그 사실은 `/state.workspace`
    가 노출하므로 조용히 사라지지는 않는다.

    **천장** — 손끝만 본다. 팔꿈치·상완은 판정 밖이라 벽 여유를 크게 잡았다."""
    if not ws:
        return []
    if not isinstance(tcp_mm, (list, tuple)) or len(tcp_mm) < 3 or not all(
            isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
            for v in tcp_mm[:3]):
        return ["손끝 위치를 못 구했다 — 작업영역을 판정할 수 없다 (제1원칙: 결측=차단)"]
    reasons = []
    # 값은 잰 좌표계에서만 참이다. 툴·사용자가 바뀌면 같은 숫자가 다른 자리를 가리킨다
    want = ws.get("frame") or {}
    have = coord or {}
    if want and have and (want.get("toolId") != have.get("toolId")
                          or want.get("userId") != have.get("userId")):
        reasons.append(
            f"좌표계가 잴 때와 다르다 — 잰 것 tool{want.get('toolId')}/user{want.get('userId')}, "
            f"지금 tool{have.get('toolId')}/user{have.get('userId')} (작업영역 값이 거짓이 된다)")
    x, y, z = float(tcp_mm[0]), float(tcp_mm[1]), float(tcp_mm[2])
    tx, ty = ws["tableXmm"], ws["tableYmm"]
    floor = ws["tableTopZmm"] + ws["tableMarginMm"]
    if tx[0] <= x <= tx[1] and ty[0] <= y <= ty[1] and z < floor:
        reasons.append(f"작업대 상판을 뚫는다 — 손끝 z {z:.1f} < {floor:.1f} (조건 12)")
    wall = ws["wallYmm"] + ws["wallMarginMm"]
    if y < wall:
        reasons.append(f"벽에 너무 가깝다 — 손끝 y {y:.1f} < {wall:.1f} (조건 12)")
    return reasons


def check_mode(state, state_age_s, manual):
    """모드 전환 게이트 (계약 §모드 전환). **로봇을 움직이지 않는다** — 권한만 넘긴다.
    그래서 안전 설정 적용 기록(조건 26)·충돌 감지는 걸지 않는다. 움직임의 전제가 아니다.

    **ARMED 에서도 허용한다.** 드래그 티칭은 서보가 켜져 있어야 되므로, ARM 을 풀게
    만들면 잠긴 상태를 풀 수 없다 (2026-08-05). 하드 룰 4 는 이 전환을 막아서가 아니라
    `check_motion` 의 `mode != 0` 이 우리 조그·moveJ 를 거부해서 지켜진다."""
    reasons = []
    if not isinstance(manual, bool):
        reasons.append(f"manual 이 true/false 가 아니다 — {manual}")
    if state is None:
        return reasons + ["상태를 읽지 못했다 — fail-closed (조건 17)"]
    if state_age_s > STATE_FRESH_S:
        reasons.append(f"상태가 낡았다 — {state_age_s:.2f}s > {STATE_FRESH_S}s (조건 10)")
    safety = state.get("safety") or {}
    if safety.get("emergencyStop"):
        reasons.append("비상정지 작동 중 (조건 1)")
    if state.get("motionQueueLength", 1) != 0:
        reasons.append(f"모션 큐가 비어있지 않다 — {state.get('motionQueueLength')} (조건 6)")
    return reasons
