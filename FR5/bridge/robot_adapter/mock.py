# 가짜 FR5 — 실기 없이 브리지·화면 왕복을 검증하기 위한 어댑터.
# 기준 자세·펌웨어 문자열은 2026-07-31 실측값이다 (evidence/2026-07-31/fr5-live-readback.md).
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


class MockFr5Adapter(RobotAdapter):
    """profile.mock 으로 결함 주입 — model 바꿔치기·안전 필드 drop (preflight fail-closed 시험)."""

    def __init__(self, profile):
        self._fault = profile.get("mock") or {}
        self._connected = False
        self._t0 = time.time()

    def connect(self):
        self._connected = True

    def disconnect(self):
        self._connected = False

    def get_version(self):
        v = dict(VERSION)
        if "model" in self._fault:
            v["model"] = self._fault["model"]
        return v

    def read_state(self):
        if not self._connected:
            raise ConnectionError("mock: 연결이 없다")
        # 관절 1·3축만 ±0.5° 느린 숨쉬기 — Live 화면에서 스트림이 살아있음이 보이게
        dt = time.time() - self._t0
        joints = list(JOINTS_BASE)
        joints[0] += 0.5 * math.sin(dt * 0.5)
        joints[2] += 0.5 * math.sin(dt * 0.7)
        state = {
            "enabled": False,          # observe-only 기본 — 서보는 내려가 있다
            "mode": 1,                 # 1=manual
            "jointsDeg": [round(j, 4) for j in joints],
            "tcpMmDeg": list(TCP_BASE),
            "motionQueueLength": 0,
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
        }
        for name in self._fault.get("drop", []):
            state["safety"].pop(name, None)
        return state
