#!/usr/bin/env python3
"""보존 게이트 단위 테스트 — 장비 없이 돈다. python3 -m unittest 로 실행."""
import unittest
from retention import should_store


def frame(**kw):
    f = {"connected": True, "enabled": False, "phase": "OBSERVE_ONLY",
         "motionQueueLength": 0, "jointsDeg": [0, 0, 0, 0, 0, 0],
         "safety": {k: (0 if k.endswith("Code") else False) for k in
                    ("emergencyStop", "safetyStop", "collisionDetected",
                     "inDragTeach", "mainErrorCode", "subErrorCode")}}
    f.update(kw)
    return f


class Retention(unittest.TestCase):
    def _stored(self, prev, cur):
        return should_store(prev, cur)[0]

    def test_first_always_stored(self):
        self.assertTrue(self._stored(None, frame()))

    def test_idle_skipped(self):
        # 연결됐지만 서보 꺼짐·정지·같은 관절 → 유휴, 건너뜀
        self.assertFalse(self._stored(frame(), frame()))

    def test_enabled_stored(self):
        self.assertTrue(self._stored(frame(), frame(enabled=True)))

    def test_motion_queue_stored(self):
        self.assertTrue(self._stored(frame(), frame(motionQueueLength=3)))

    def test_joint_move_stored(self):
        cur = frame(jointsDeg=[0, 0, 0, 0, 0, 0.2])   # 0.2° > ε 0.1°
        self.assertTrue(self._stored(frame(), cur))

    def test_joint_jitter_skipped(self):
        cur = frame(jointsDeg=[0, 0, 0, 0, 0, 0.05])  # 0.05° < ε, 유휴
        self.assertFalse(self._stored(frame(), cur))

    def test_phase_transition_always_stored_even_when_idle(self):
        # 유휴여도 phase 가 바뀌면 저장 — 안전·중요
        self.assertTrue(self._stored(frame(phase="OBSERVE_ONLY"),
                                     frame(phase="OWNER_HELD")))

    def test_safety_transition_always_stored_even_when_idle(self):
        prev = frame()
        cur = frame(); cur["safety"] = dict(prev["safety"], emergencyStop=True)
        self.assertTrue(self._stored(prev, cur))

    def test_error_code_change_stored(self):
        prev = frame()
        cur = frame(); cur["safety"] = dict(prev["safety"], mainErrorCode=17)
        self.assertTrue(self._stored(prev, cur))

    def test_connected_transition_stored(self):
        self.assertTrue(self._stored(frame(connected=True),
                                     frame(connected=False)))

    def test_amr_pose_move_stored(self):
        prev = frame(jointsDeg=None, pose={"xMm": 0, "yMm": 0, "thetaDeg": 0})
        cur = frame(jointsDeg=None, pose={"xMm": 10, "yMm": 0, "thetaDeg": 0})  # 10mm > ε
        self.assertTrue(self._stored(prev, cur))

    def test_amr_pose_still_skipped(self):
        prev = frame(jointsDeg=None, pose={"xMm": 0, "yMm": 0, "thetaDeg": 0})
        cur = frame(jointsDeg=None, pose={"xMm": 1, "yMm": 0, "thetaDeg": 0.1})  # 1mm·0.1° < ε
        self.assertFalse(self._stored(prev, cur))


if __name__ == "__main__":
    unittest.main()
