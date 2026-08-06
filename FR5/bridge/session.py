# 로봇 세션 — 연결 하나의 상태를 소유한다 (명령 주인이 한 명이듯 관문의 로봇도 하나다 · 하드룰 4).
#
# 왜 클래스인가 — 상태가 dict 로 흩어져 있을 때 "빈 세션이 무엇인가" 가 세 곳(init·fail_closed·
# disconnect)에 서로 다르게 적혀 있었다. 필드를 하나 늘리면 세 곳을 다 고쳐야 하고, 빠뜨리면
# 끊긴 뒤에도 옛 기록이 남는다 (2026-08-04 실제로 겪었다 · D54). 여기서는 clear() 하나가
# 빈 세션의 유일한 정의다.
#
# tb-bridge 의 RunStore·OwnerRegistry 와 같은 모양이다 — 도메인은 클래스, 라우트는 얇게.
# 이 모듈은 main 을 모른다 (순환 import 금지).
import math
import time

import preflight
import safety

BAD_READS_LIMIT = 3     # 유니티 실측 정책 — 연속 3회 불량이면 연결 손실 판정 (API-CONTRACT §실기)

# 되읽기가 없는 항목 — SDK 에 Get 이 아예 없다 (STACK §로봇 안전 설정 API).
# "확인했다" 고 적지 않고 "넣었다" 고만 적는다 (D53).
UNVERIFIABLE_SETTINGS = ["collisionLevel", "collisionStrategy", "collisionMode",
                         "installPos", "powerLimitW",
                         "collisionSafeTimeMs", "collisionSafeDistanceMm",
                         "collisionSafeVelMmS", "collisionSafetyMargin"]
SETTING_TOL = {"payloadKg": 0.05, "cogMm": 1.0}     # 되읽기 허용 오차 (kg · mm)


def _within(got, want, tol):
    """되읽은 값이 기대값 근처인가. **NaN 은 통과가 아니라 불일치다** (감사 2026-08-05 P0-3).

    `abs(nan - 0.6) > 0.05` 은 파이썬에서 `False` 라 부등호만 쓰면 NaN 이 조용히 통과한다.
    그러면 말단 하중·무게중심이 로봇에 안 들어간 채 ARM 된다 — 그 둘이 없으면 충돌 감지가
    오작동한다(`fairino.py` §하중이 먼저다). 제1원칙 그대로 **못 읽으면 차단**이다.
    """
    if isinstance(got, bool) or not isinstance(got, (int, float)) or not math.isfinite(got):
        return False
    return abs(float(got) - float(want)) <= tol


class RobotSession:
    def __init__(self, sample_ms, on_log):
        self._sample_ms = sample_ms
        self._log = on_log
        self.clear()

    def clear(self, phase="DISCONNECTED", fail_reason=None):
        """빈 세션의 **유일한 정의**. 필드를 늘리면 여기만 고친다."""
        self.profile = None
        self.adapter = None
        self.phase = phase
        self.failReason = fail_reason
        self.version = None
        self.observedAt = None
        self.armed = False
        self.lastState = None
        self.lastStateAt = 0.0
        self.badReads = 0
        self.appliedSettings = None
        self.workspace = None
        # 드리프트 기준 — **우리가 마지막으로 보낸 MoveJ 목표** (계약 §드리프트 기준).
        # None 이면 검사하지 않는다. 컨트롤러의 lastServoTarget 을 쓰지 않는 이유는 계약에.
        self.lastCommandedDeg = None

    def open(self, profile, adapter, version, state):
        """preflight 를 통과한 연결을 세션에 앉힌다."""
        now = time.time()
        self.profile = profile
        self.adapter = adapter
        # settings 는 **로봇에 넣는 값**이고(D53) 작업영역은 **우리 게이트가 쓰는 값**이라
        # 프로필 최상위에 둔다 — 섞으면 appliedSettings 되읽기 대조에 끼어든다
        self.workspace = profile.get("workspace")
        self.phase = "OBSERVE_ONLY"
        self.failReason = None
        self.version = version
        self.observedAt = now
        self.lastState = state
        self.lastStateAt = now
        self.badReads = 0
        self.lastCommandedDeg = None

    # ── 상태 ────────────────────────────────────────────────────────────────
    def current_phase(self, owner_who):
        if self.adapter is None:
            return self.phase
        if self.armed:
            return "EXECUTING" if (self.lastState or {}).get("motionQueueLength") else "ARMED"
        return "OWNER_HELD" if owner_who else "OBSERVE_ONLY"

    def read_fresh_state(self):
        """어댑터에서 지금 읽고 세션에 기록한다. 실패는 fail-closed.

        비정상 수치(NaN/inf — SDK 워밍업·전송 오류)는 그 샘플을 버리고 직전 값을 유지한다.
        타임스탬프를 안 올리므로 신선도 게이트가 모션을 막는다. 연속 3회면 연결 손실 판정.
        """
        state = self.adapter.read_state()
        numbers = list(state.get("jointsDeg") or []) + list(state.get("tcpMmDeg") or [])
        if len(numbers) != 12 or not all(
                isinstance(v, (int, float)) and math.isfinite(v) for v in numbers):
            self.badReads += 1
            self._log("bad-read", f"{self.badReads}/{BAD_READS_LIMIT} — 비정상 수치 샘플 폐기")
            if self.badReads >= BAD_READS_LIMIT:
                raise ConnectionError(f"연속 {BAD_READS_LIMIT}회 비정상 상태 — 연결 손실 판정")
            if self.lastState is not None:
                return self.lastState
            raise ConnectionError("첫 상태부터 비정상 수치 — fail-closed")
        self.badReads = 0
        # 사람이 팔을 잡으면 우리 지령은 더 이상 실측의 기준이 아니다 (계약 §드리프트 기준).
        # 여기서 비우는 이유 — 펜던트가 직접 티칭을 켠 경우까지 한 곳에서 잡힌다.
        if ((state.get("safety") or {}).get("inDragTeach")
                and self.lastCommandedDeg is not None):
            self.lastCommandedDeg = None
            self._log("드리프트-기준-해제", "드래그 티칭 — 사람이 팔을 옮긴다")
        self.lastState = state
        self.lastStateAt = time.time()
        return state

    def fresh_state(self):
        """지금 읽고 **신선도까지** 본다 → `(state, reasons)`. 캐시된 마지막 값을 신선한
        자세로 굳히지 않는다 (감사 P2). 실패는 fail-closed 로 넘긴다."""
        if self.adapter is None:
            return None, ["미연결 — 읽을 상태가 없다"]
        try:
            state = self.read_fresh_state()
        except Exception as e:
            self.fail_closed(f"상태 읽기 실패 — {e}")
            return None, [f"상태 읽기 실패 — {e}"]
        age = time.time() - self.lastStateAt
        if age > safety.STATE_FRESH_S:
            return None, [f"상태가 낡았다 — {age:.2f}s (상한 {safety.STATE_FRESH_S}s · 조건 10)"]
        return state, []

    def stamp(self, gripper_force_pct):
        """**잰 조건.** 이게 없으면 속도 상한 10%로 잰 것과 30%로 잰 것을 나란히 놓게
        되고 "A 가 B 보다 몇 % 빠르다" 가 거짓말이 된다 (D74 · 계약 §궤적 녹화)."""
        v = self.version or {}
        ws = self.workspace or {}
        coord = (self.lastState or {}).get("coord") or {}
        return {"robotId": (self.profile or {}).get("robotId"),
                "toolId": coord.get("toolId", 0), "userId": coord.get("userId", 0),
                "firmware": v.get("controller"),
                "speedCapPct": safety.SPEED_CAP_PCT,
                "gripperForcePct": gripper_force_pct,
                "workspaceRev": ws.get("rev") or ("측정됨" if ws else None)}

    def snapshot(self, owner_who):
        """미연결에도 같은 스키마 — 클라이언트가 빈 응답을 따로 처리하지 않는다 (D40)."""
        base = {
            "t": time.time(),
            "robotId": None, "connected": False, "enabled": False, "mode": 1,
            "jointsDeg": [0, 0, 0, 0, 0, 0], "tcpMmDeg": [0, 0, 0, 0, 0, 0],
            "motionQueueLength": 0,
            "safety": {"code": 0, "emergencyStop": False, "safetyStop": False,
                       "collisionDetected": False, "inDragTeach": False,
                       "mainErrorCode": 0, "subErrorCode": 0},
            "coord": {"toolId": 0, "userId": 0},
            "sampleMs": self._sample_ms,
            "gripper": {"opened": True, "pos": 0},
            "owner": owner_who,
            "phase": self.phase, "failReason": self.failReason,
            "appliedSettings": self.appliedSettings,
            # 작업영역이 없으면 손끝 판정이 꺼진 것이다 — 조용히 사라지지 않게 노출한다
            "workspace": self.workspace,
        }
        if self.adapter is None:
            return base
        try:
            state = self.read_fresh_state()
        except Exception as e:              # 읽기 실패 = 연결 손실 — fail-closed (계약 §안전)
            self.fail_closed(f"상태 읽기 실패 — {e}")
            base.update(phase="FAIL_CLOSED", failReason=self.failReason)
            return base
        base.update({k: v for k, v in state.items()
                     if k not in ("missing", "lastServoTargetDeg")})
        base.update(robotId=self.profile["robotId"], connected=True,
                    phase=self.current_phase(owner_who))
        return base

    # ── 안전 설정 (D53) ─────────────────────────────────────────────────────
    def apply_settings(self):
        """설정을 넣고 되읽어 대조한다. 반환은 계약 §로봇 안전 설정의 appliedSettings 모양."""
        settings = (self.profile or {}).get("settings")
        if not settings:
            raise ConnectionError("프로필에 settings 가 없다 — 안전 설정 없이 arm 하지 않는다")
        self.adapter.apply_settings(settings)
        back = self.adapter.read_settings() or {}
        mismatch = []
        got = back.get("payloadKg")
        if not _within(got, settings["payloadKg"], SETTING_TOL["payloadKg"]):
            mismatch.append(f"payloadKg 기대 {settings['payloadKg']} · 실제 {got}")
        got = back.get("cogMm")
        want = settings["cogMm"]
        # 길이도 본다 — `zip` 은 짧은 쪽에서 조용히 멈춘다. 빈 목록이면 비교가 0회라 통과한다
        if not isinstance(got, (list, tuple)) or len(got) != len(want) \
                or not all(_within(g, w, SETTING_TOL["cogMm"]) for g, w in zip(got, want)):
            mismatch.append(f"cogMm 기대 {settings['cogMm']} · 실제 {got}")
        applied = {"appliedAt": time.time(), "sent": dict(settings), "readback": back,
                   "unverifiable": list(UNVERIFIABLE_SETTINGS), "mismatch": mismatch}
        if mismatch:
            raise ConnectionError("안전 설정이 로봇에 안 먹었다 — " + " · ".join(mismatch))
        self.appliedSettings = applied
        notes = preflight.compare_soft_limits(back.get("jointSoftLimitDeg"),
                                              safety.JOINT_LIMITS_DEG)
        if notes:      # 거부하지 않는다 — 값 신뢰도가 낮다 (STACK). 기록만 남긴다
            self._log("soft-limit-diff", " · ".join(notes))
        return applied

    # ── 종료 경로 ───────────────────────────────────────────────────────────
    def disarm_hw(self, why):
        self.armed = False
        if self.adapter is None:
            return
        try:
            self.adapter.stop()
            self.adapter.enable(False)
            self._log("disarm", why)
        except Exception as e:
            self._log("disarm-fail", f"{why} — {e}")

    def fail_closed(self, reason):
        self.armed = False
        if self.adapter:
            try:
                self.adapter.disconnect()
            except Exception:
                pass
        self.clear(phase="FAIL_CLOSED", fail_reason=reason)
        self._log("FAIL_CLOSED", reason)

    def close(self):
        """정상 해제 — 열려 있으면 서보를 내리고 어댑터를 닫은 뒤 빈 세션으로 돌아간다."""
        if self.adapter:
            if self.armed:
                self.disarm_hw("disconnect")
            try:
                self.adapter.disconnect()
            except Exception:
                pass
            self._log("DISCONNECTED", self.profile["robotId"])
        self.clear()
