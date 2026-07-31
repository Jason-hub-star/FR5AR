# 가짜 FR5 — 실기 없이 브리지·화면 왕복을 검증하기 위한 어댑터.
# 기준 자세·펌웨어 문자열은 2026-07-31 실측값이다 (evidence/2026-07-31/fr5-live-readback.md).
# 움직임 규칙: move_j 는 순간이동이 아니라 속도 상한에 비례해 한 틱씩 다가간다 —
# 실기처럼 큐가 차 있는 동안 EXECUTING 이 보여야 화면·게이트 검증이 성립한다.
import math
import time

from .base import RobotAdapter

# 실측 readback 값 — mock 의 기준 자세
JOINTS_BASE = [-80.851326, -98.353310, 91.248093, -89.073883, -89.751343, 6.898761]
TCP_BASE = [227.570862, -62.282482, 56.726894, -173.889771, 0.986040, 2.315017]
VERSION = {
    "model": "FR5",
    "controller": "FR_CTRL_FV2.010.12",
    "servo": "FR_SERVO_FV5.043.16",
    "end": "FR05_End_FV2.010.11",
    "sdk": "mock-0.1",          # 실기 SDK 문자열을 사칭하지 않는다 — 화면에서 mock 임이 보여야 한다
    "web": "mock-0.1",
}
FULL_SPEED_DEG_S = 30.0         # speedPct 100 기준 관절 속도 — mock 전용 가정값


class MockFr5Adapter(RobotAdapter):
    """profile.mock 으로 결함 주입 — model 바꿔치기·안전 필드 drop (preflight fail-closed 시험)."""

    def __init__(self, profile):
        self._fault = profile.get("mock") or {}
        self._connected = False
        self._t0 = time.time()
        self._joints = list(JOINTS_BASE)
        self._enabled = False
        self._mode = 1
        self._target = None            # move_j 목표 (도)
        self._speed_pct = 10.0
        self._last_tick = time.time()
        self._servo_target = [0.0] * 6

    def connect(self):
        self._connected = True

    def disconnect(self):
        self._connected = False
        self._target = None
        self._enabled = False
        self._mode = 1

    def get_version(self):
        v = dict(VERSION)
        if "model" in self._fault:
            v["model"] = self._fault["model"]
        return v

    def reset_errors(self):
        self._require()

    def enable(self, on):
        self._require()
        self._enabled = bool(on)
        if not on:
            self._target = None

    def set_mode(self, mode):
        self._require()
        self._mode = int(mode)

    def exit_drag_teach(self):
        self._require()

    def set_sample_period(self, ms):
        self._require()

    def move_j(self, joints_deg, speed_pct, tool, user):
        self._require()
        if not self._enabled:
            raise ConnectionError("mock: 서보 OFF — 컨트롤러가 명령을 거부한다")
        self._target = [float(j) for j in joints_deg]
        self._servo_target = list(self._target)
        self._speed_pct = float(speed_pct)
        self._last_tick = time.time()

    def stop(self):
        self._target = None

    def _require(self):
        if not self._connected:
            raise ConnectionError("mock: 연결이 없다")

    def _step_motion(self):
        if self._target is None:
            return
        now = time.time()
        dt = min(now - self._last_tick, 0.5)
        self._last_tick = now
        step = FULL_SPEED_DEG_S * (self._speed_pct / 100.0) * dt
        done = True
        for i in range(6):
            diff = self._target[i] - self._joints[i]
            if abs(diff) <= step:
                self._joints[i] = self._target[i]
            else:
                self._joints[i] += math.copysign(step, diff)
                done = False
        if done:
            self._target = None

    def read_state(self):
        self._require()
        self._step_motion()
        joints = list(self._joints)
        if not self._enabled:
            # 서보 OFF 관측 상태에서만 ±0.5° 숨쉬기 — 스트림이 살아있음을 화면에서 보이게
            dt = time.time() - self._t0
            joints[0] += 0.5 * math.sin(dt * 0.5)
            joints[2] += 0.5 * math.sin(dt * 0.7)
        state = {
            "enabled": self._enabled,
            "mode": self._mode,
            "jointsDeg": [round(j, 4) for j in joints],
            "tcpMmDeg": list(TCP_BASE),
            "motionQueueLength": 1 if self._target is not None else 0,
            "safety": {
                "code": 0,
                "emergencyStop": False,
                "safetyStop": False,
                "collisionDetected": False,
                "inDragTeach": False,
                "mainErrorCode": 0,
                "subErrorCode": 0,
            },
            "coord": {"toolId": 0, "userId": 0},
            "gripper": {"opened": True, "pos": 0},
            "lastServoTargetDeg": list(self._servo_target),
            "missing": [],
        }
        for name in self._fault.get("drop", []):
            state["safety"].pop(name, None)
            state["missing"].append(name)
        return state
