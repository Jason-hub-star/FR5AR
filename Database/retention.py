#!/usr/bin/env python3
"""보존 게이트 — 연속 상태 프레임을 저장할지 정하는 순수 함수.

계약(RECORD-NODE-CONTRACT.md §보존 정책)의 규칙을 한 곳에 담는다:
  저장 조건 = enabled=1 · motionQueueLength>0 · 관절/pose 변화>ε · phase·safety·connected 전이.
  나머지(유휴)는 건너뛴다. **phase·safety·connected 전이는 드물고 중요해 항상 저장한다.**

하드웨어도 DB도 건드리지 않는다 — 프레임 dict 둘을 받아 (저장?, 사유) 만 돌려준다.
그래서 단위 테스트가 장비 없이 돈다. 값은 API 계약대로 도(°)·mm.
"""

EPS_DEG_JOINT = 0.1    # 관절이 이만큼(도) 넘게 움직이면 저장 (엔코더 잡음 위)
EPS_MM_POSE   = 5.0    # AMR 위치가 이만큼(mm) 넘게 움직이면 저장
EPS_DEG_POSE  = 0.5    # AMR 방향이 이만큼(도) 넘게 돌면 저장

# safety 전이 판정에 쓰는 필드 — 하나라도 바뀌면 저장 (계약 §상태값)
SAFETY_FLAGS = ("emergencyStop", "safetyStop", "collisionDetected",
                "inDragTeach", "mainErrorCode", "subErrorCode")


def _safety_sig(frame):
    s = frame.get("safety") or {}
    return tuple(s.get(k) for k in SAFETY_FLAGS)


def _max_abs_delta(a, b):
    if not a or not b or len(a) != len(b):
        return float("inf")     # 모양이 바뀌었으면 저장 쪽으로 (결측=보수적)
    return max(abs(x - y) for x, y in zip(a, b))


def _joints_moved(prev, cur):
    pj, cj = prev.get("jointsDeg"), cur.get("jointsDeg")
    if pj is None and cj is None:
        return False
    return _max_abs_delta(pj, cj) > EPS_DEG_JOINT


def _pose_moved(prev, cur):
    pp, cp = prev.get("pose"), cur.get("pose")
    if not pp or not cp:
        return False
    import math
    dxy = math.hypot((cp.get("xMm", 0) - pp.get("xMm", 0)),
                     (cp.get("yMm", 0) - pp.get("yMm", 0)))
    dth = abs(cp.get("thetaDeg", 0) - pp.get("thetaDeg", 0))
    return dxy > EPS_MM_POSE or dth > EPS_DEG_POSE


def should_store(prev, cur):
    """(저장할지: bool, 사유: str). prev 는 마지막으로 **저장한** 프레임(없으면 None)."""
    if prev is None:
        return True, "first"
    # ── 전이: 드물고 중요 — 항상 저장 ──
    if cur.get("phase") != prev.get("phase"):
        return True, "phase"
    if _safety_sig(cur) != _safety_sig(prev):
        return True, "safety"
    if bool(cur.get("connected")) != bool(prev.get("connected")):
        return True, "connected"
    # ── 활성: 서보 켜짐·큐·실제 이동 ──
    if cur.get("enabled"):
        return True, "enabled"
    if (cur.get("motionQueueLength") or 0) > 0:
        return True, "motion-queue"
    if _joints_moved(prev, cur):
        return True, "joint-move"
    if _pose_moved(prev, cur):
        return True, "pose-move"
    return False, "idle-skip"
