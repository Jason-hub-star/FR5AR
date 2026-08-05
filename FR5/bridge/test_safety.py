# safety.py 단위 테스트 — 표준 라이브러리 unittest (새 의존성 0).
#
# 왜 단위인가 — safety 는 `import math` 뿐인 순수 함수라 제일 싸게 검증된다. HTTP 통합
# (fr5-bridge-verify.mjs 38항목)은 "한 판이 도는가" 를 보고, 여기는 **조건 하나하나가
# 제대로 막는가** 를 본다. 조건이 26개라 조합을 통합으로만 덮을 수 없다.
#
# 규칙: 게이트는 사유 목록을 돌려주고 **비어 있을 때만 허용**이다 (제1원칙).
# 그래서 "차단됐다" 는 사유 문자열 일부로 확인한다.
import unittest

import safety

OK_SETTINGS = {"mismatch": []}          # 조건 26 통과용 최소 모양


def state(**over):
    """게이트를 통과하는 기준 상태 — 테스트마다 한 곳만 망가뜨린다."""
    base = {
        "enabled": True, "mode": 0, "motionQueueLength": 0,
        "jointsDeg": [0.0] * 6, "tcpMmDeg": [0.0] * 6,
        "safety": {"emergencyStop": False, "safetyStop": False, "collisionDetected": False,
                   "inDragTeach": False, "mainErrorCode": 0, "subErrorCode": 0},
        "coord": {"toolId": 0, "userId": 0},
    }
    if "safety" in over:
        base["safety"] = {**base["safety"], **over.pop("safety")}
    base.update(over)
    return base


def blocked(reasons, needle):
    return any(needle in r for r in reasons)


class MotionGate(unittest.TestCase):
    def gate(self, st=None, age=0.0, target=None, speed=None, applied=OK_SETTINGS):
        return safety.check_motion(st if st is not None else state(), age,
                                   target if target is not None else [0.0] * 6,
                                   safety.SPEED_CAP_PCT if speed is None else speed, applied)

    def test_기준_상태는_통과한다(self):
        self.assertEqual(self.gate(), [])

    def test_상태_None_은_차단(self):
        self.assertTrue(blocked(safety.check_motion(None, 0.0, [0.0] * 6, 10, OK_SETTINGS),
                                "fail-closed"))

    def test_신선도_초과_차단(self):
        self.assertTrue(blocked(self.gate(age=safety.STATE_FRESH_S + 0.01), "낡았다"))

    def test_안전필드_결측은_차단(self):
        st = state()
        del st["safety"]["collisionDetected"]
        self.assertTrue(blocked(self.gate(st), "결측"))

    def test_비상정지_차단(self):
        self.assertTrue(blocked(self.gate(state(safety={"emergencyStop": True})), "비상정지"))

    def test_안전정지_차단(self):
        self.assertTrue(blocked(self.gate(state(safety={"safetyStop": True})), "안전정지"))

    def test_컨트롤러_오류_차단(self):
        self.assertTrue(blocked(self.gate(state(safety={"mainErrorCode": 7})), "오류"))

    def test_충돌_차단(self):
        self.assertTrue(blocked(self.gate(state(safety={"collisionDetected": True})), "충돌"))

    def test_드래그티칭_중_차단(self):
        self.assertTrue(blocked(self.gate(state(safety={"inDragTeach": True})), "드래그"))

    def test_큐가_남아있으면_차단(self):
        self.assertTrue(blocked(self.gate(state(motionQueueLength=2)), "큐"))

    def test_서보_off_차단(self):
        self.assertTrue(blocked(self.gate(state(enabled=False)), "서보"))

    def test_수동모드_차단(self):
        self.assertTrue(blocked(self.gate(state(mode=1)), "auto"))

    def test_현재값_NaN_은_차단(self):
        self.assertTrue(blocked(self.gate(state(jointsDeg=[float("nan")] + [0.0] * 5)),
                                "비정상"))

    def test_속도_상한_초과_차단(self):
        self.assertTrue(blocked(self.gate(speed=safety.SPEED_CAP_PCT + 0.1), "속도 상한"))

    def test_속도_0_이하_차단(self):
        self.assertTrue(blocked(self.gate(speed=0), "속도 상한"))

    def test_관절_변화_상한_초과_차단(self):
        over = [safety.JOINT_DELTA_CAP_DEG + 0.1] + [0.0] * 5
        self.assertTrue(blocked(self.gate(target=over), "관절 변화"))

    def test_목표가_6축_숫자가_아니면_차단(self):
        self.assertTrue(blocked(self.gate(target=[0.0] * 5), "6축"))

    def test_드리프트_초과_차단(self):
        st = state(lastServoTargetDeg=[safety.DRIFT_CAP_DEG + 1.0] + [0.0] * 5)
        self.assertTrue(blocked(self.gate(st), "괴리"))

    def test_지령_이력이_전부_0이면_드리프트를_건너뛴다(self):
        st = state(lastServoTargetDeg=[0.0] * 6)
        self.assertEqual(self.gate(st), [])


class JointLimits(unittest.TestCase):
    """실기 컨트롤러가 보고한 소프트리밋과 대조해 확정된 값이다 (2026-08-04)."""

    def gate_target(self, target):
        # 현재값을 목표 근처에 둬서 5° 변화 상한에 걸리지 않게 한다
        cur = [min(max(t, -175), 175) for t in target]
        st = state(jointsDeg=cur)
        return safety.check_motion(st, 0.0, target, safety.SPEED_CAP_PCT, OK_SETTINGS)

    def test_j3_경계_160_은_통과(self):
        t = [0.0, 0.0, 160.0, 0.0, 0.0, 0.0]
        self.assertEqual([r for r in self.gate_target(t) if "한계" in r], [])

    def test_j3_161_은_차단_컨트롤러가_160_이다(self):
        t = [0.0, 0.0, 161.0, 0.0, 0.0, 0.0]
        self.assertTrue(blocked(self.gate_target(t), "j3"))

    def test_j2_비대칭_한계(self):
        self.assertTrue(blocked(self.gate_target([0.0, 86.0, 0.0, 0.0, 0.0, 0.0]), "j2"))
        self.assertEqual([r for r in self.gate_target([0.0, -260.0, 0.0, 0.0, 0.0, 0.0])
                          if "한계" in r], [])


class Condition26(unittest.TestCase):
    """안전 설정 기록이 없으면 모션을 막는다 — 충돌 감지가 켜졌는지 알 수 없기 때문 (D53)."""

    def test_설정_기록이_없으면_차단(self):
        r = safety.check_motion(state(), 0.0, [0.0] * 6, safety.SPEED_CAP_PCT, None)
        self.assertTrue(blocked(r, "조건 26"))

    def test_되읽기_불일치면_차단(self):
        applied = {"mismatch": ["payloadKg 기대 0.6 · 실제 1.6"]}
        r = safety.check_motion(state(), 0.0, [0.0] * 6, safety.SPEED_CAP_PCT, applied)
        self.assertTrue(blocked(r, "되읽기 불일치"))


class ArmGate(unittest.TestCase):
    def test_기준_상태는_통과한다(self):
        self.assertEqual(safety.check_arm(state(), 0.0), [])

    def test_상태_None_은_차단(self):
        self.assertTrue(blocked(safety.check_arm(None, 0.0), "fail-closed"))

    def test_낡은_상태로는_arm_하지_않는다(self):
        self.assertTrue(blocked(safety.check_arm(state(), safety.STATE_FRESH_S + 0.01), "낡았다"))

    def test_비상정지_중_arm_거부(self):
        self.assertTrue(blocked(safety.check_arm(state(safety={"emergencyStop": True}), 0.0),
                                "비상정지"))

    def test_arm_은_서보_off_에서도_통과한다(self):
        # arm 이 서보를 켜는 동작이다 — 여기서 서보 ON 을 요구하면 영원히 arm 할 수 없다
        self.assertEqual(safety.check_arm(state(enabled=False), 0.0), [])

    def test_드래그_티칭_중에는_arm_거부(self):
        # arm 은 마지막에 ExitDragTeach 를 부른다 — 사람 손 안에서 팔이 굳는다 (조건 25)
        self.assertTrue(blocked(safety.check_arm(state(safety={"inDragTeach": True}), 0.0),
                                "드래그 티칭"))


WS = {"frame": {"toolId": 1, "userId": 1},
      "tableTopZmm": -345.8, "tableXmm": [-16.1, 842.0], "tableYmm": [-798.2, -210.9],
      "tableMarginMm": 10, "wallYmm": -1400.0, "wallMarginMm": 100}
FRAME = {"toolId": 1, "userId": 1}


class WorkspaceGate(unittest.TestCase):
    """조건 12 의 카테시안 절반 — 관절 한계만으로는 손끝이 상판을 뚫는 것을 못 막는다.
    실측 근거는 `evidence/2026-08-05/workcell-measure.md`."""

    def test_상판_위는_통과한다(self):
        self.assertEqual(safety.check_workspace([400, -400, -100], WS, FRAME), [])

    def test_상판_아래로_가면_거부(self):
        # 상판 z -345.8 + 여유 10 = -335.8 보다 낮고, x·y 가 상판 안이면 뚫는 것이다
        self.assertTrue(blocked(safety.check_workspace([400, -400, -340], WS, FRAME), "상판을 뚫는다"))

    def test_상판_밖에서는_같은_높이도_통과한다(self):
        # 상판 바깥은 더 내려가도 된다 — 높이 하나로 판정하면 이게 막힌다
        self.assertEqual(safety.check_workspace([1500, -400, -340], WS, FRAME), [])
        self.assertEqual(safety.check_workspace([400, -100, -340], WS, FRAME), [])

    def test_벽에_가까우면_거부(self):
        self.assertTrue(blocked(safety.check_workspace([400, -1350, 0], WS, FRAME), "벽에 너무 가깝다"))

    def test_벽_여유_안쪽은_통과(self):
        self.assertEqual(safety.check_workspace([400, -1290, 0], WS, FRAME), [])

    def test_좌표계가_다르면_거부(self):
        # 같은 숫자가 다른 자리를 가리킨다 — 값이 거짓이 된다
        self.assertTrue(blocked(
            safety.check_workspace([400, -400, -100], WS, {"toolId": 0, "userId": 0}), "좌표계가"))

    def test_손끝을_못_구하면_차단(self):
        for bad in (None, [], [1, 2], [1, 2, float("nan")], ["a", "b", "c"], [True, 2, 3]):
            self.assertTrue(blocked(safety.check_workspace(bad, WS, FRAME), "결측=차단"), bad)

    def test_작업영역이_없으면_판정하지_않는다(self):
        # mock·미측정 프로필 — 없는 값을 지어내 막지 않는다 (사실은 /state.workspace 가 노출)
        self.assertEqual(safety.check_workspace([0, 0, -9999], None, FRAME), [])


class ModeGate(unittest.TestCase):
    """모드 전환은 **로봇을 움직이지 않는다** — 움직임의 전제(설정 기록·충돌 감지)를 걸지 않는다."""

    def test_기준_상태에서_수동_전환_통과(self):
        self.assertEqual(safety.check_mode(state(), 0.0, True), [])

    def test_기준_상태에서_자동_복귀_통과(self):
        self.assertEqual(safety.check_mode(state(mode=1), 0.0, False), [])

    def test_서보가_켜져_있어도_통과한다(self):
        # 드래그 티칭은 서보가 켜져 있어야 된다 — ARMED 를 막으면 잠긴 상태를 못 푼다
        self.assertEqual(safety.check_mode(state(enabled=True), 0.0, True), [])

    def test_서보가_꺼져_있어도_통과한다(self):
        self.assertEqual(safety.check_mode(state(enabled=False), 0.0, True), [])

    def test_manual_이_불리언이_아니면_거부(self):
        self.assertTrue(blocked(safety.check_mode(state(), 0.0, "manual"), "true/false"))
        self.assertTrue(blocked(safety.check_mode(state(), 0.0, None), "true/false"))

    def test_상태_None_은_차단(self):
        self.assertTrue(blocked(safety.check_mode(None, 0.0, True), "fail-closed"))

    def test_낡은_상태로는_바꾸지_않는다(self):
        self.assertTrue(blocked(
            safety.check_mode(state(), safety.STATE_FRESH_S + 0.01, True), "낡았다"))

    def test_비상정지_중_거부(self):
        self.assertTrue(blocked(
            safety.check_mode(state(safety={"emergencyStop": True}), 0.0, True), "비상정지"))

    def test_모션_큐가_차_있으면_거부(self):
        self.assertTrue(blocked(safety.check_mode(state(motionQueueLength=2), 0.0, True),
                                "모션 큐"))

    def test_안전_설정_기록이_없어도_통과한다(self):
        # 조건 26 은 **움직임**의 전제다. 권한만 넘기는 전환에 걸면 영원히 못 바꾼다
        self.assertEqual(safety.check_mode(state(), 0.0, True), [])

    def test_수동_모드에서는_조그가_막힌다(self):
        # 하드 룰 4 를 지키는 것은 전환 금지가 아니라 **이 게이트**다 — 여기가 뚫리면
        # 사람이 팔을 잡고 있는데 웹에서 움직일 수 있게 된다
        self.assertTrue(blocked(
            safety.check_motion(state(mode=1), 0.0, [0.0] * 6, safety.SPEED_CAP_PCT, OK_SETTINGS),
            "auto 모드가 아니다"))


class GripperGate(unittest.TestCase):
    """그리퍼는 **관절이 아니다.** 관절 게이트를 복붙하면 통과할 수 없거나 엉뚱하게 막는다."""

    def gstate(self, **over):
        grip = {"pctRaw": 50, "pct": None, "fault": False,
                "motionDone": True, "active": True, "calibrated": False}
        grip.update(over.pop("gripper", {}))
        return state(gripper=grip, **over)

    def gate(self, st=None, age=0.0, pct=50, applied=OK_SETTINGS):
        return safety.check_gripper(st if st is not None else self.gstate(), age, pct, applied)

    def test_기준_상태는_통과한다(self):
        self.assertEqual(self.gate(), [])

    # ── 관절 게이트를 타지 않는다 (감사 P1) ─────────────────────────────
    def test_모션큐가_차_있어도_그리퍼는_움직인다(self):
        # 팔이 이동 중이어도 손가락은 따로다. 모션큐를 걸면 pick 이 성립하지 않는다
        self.assertEqual(self.gate(self.gstate(motionQueueLength=3)), [])

    def test_수동_모드에서도_그리퍼는_움직인다(self):
        # auto 모드 요구는 MoveJ 의 조건이다 — 그리퍼까지 걸면 티칭 중 개폐를 못 한다
        self.assertEqual(self.gate(self.gstate(mode=1)), [])

    def test_관절값이_비정상이어도_그리퍼는_판정하지_않는다(self):
        self.assertEqual(self.gate(self.gstate(jointsDeg=[float("nan")] * 6)), [])

    # ── 그리퍼 고유 조건 ───────────────────────────────────────────────
    def test_활성화_전에는_거부(self):
        self.assertTrue(blocked(self.gate(self.gstate(gripper={"active": False})), "활성화"))

    def test_고장_신호면_거부(self):
        self.assertTrue(blocked(self.gate(self.gstate(gripper={"fault": True})), "고장"))

    def test_그리퍼_필드_결측은_차단(self):
        self.assertTrue(blocked(self.gate(self.gstate(gripper={"fault": None})), "결측"))

    def test_그리퍼_상태_자체가_없으면_차단(self):
        st = state()
        st.pop("gripper", None)
        self.assertTrue(blocked(self.gate(st), "못 읽었다"))

    def test_pct_범위_밖은_거부(self):
        for bad in (-1, 101, float("nan"), "50", None, True):
            self.assertTrue(blocked(self.gate(pct=bad), "0~100"), f"{bad!r} 가 통과했다")

    # ── 공통 관문은 그대로 탄다 ────────────────────────────────────────
    def test_서보_off_면_거부(self):
        self.assertTrue(blocked(self.gate(self.gstate(enabled=False)), "서보 OFF"))

    def test_비상정지_중_거부(self):
        self.assertTrue(blocked(self.gate(self.gstate(safety={"emergencyStop": True})), "비상정지"))

    def test_드래그_티칭_중_거부(self):
        self.assertTrue(blocked(self.gate(self.gstate(safety={"inDragTeach": True})), "드래그"))

    def test_낡은_상태는_거부(self):
        self.assertTrue(blocked(self.gate(age=safety.STATE_FRESH_S + 0.01), "낡았다"))

    def test_안전설정_기록이_없으면_거부(self):
        self.assertTrue(blocked(self.gate(applied=None), "조건 26"))

    def test_상태_None_은_차단(self):
        # gate() 헬퍼는 None 을 '기본값 쓰라'로 읽으므로 여기만 직접 부른다
        self.assertTrue(blocked(safety.check_gripper(None, 0.0, 50, OK_SETTINGS), "fail-closed"))


if __name__ == "__main__":
    unittest.main()
