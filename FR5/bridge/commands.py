# 명령 실행 — 게이트를 태우고 어댑터로 보낸다 (API-CONTRACT §명령 · SAFETY-RULES).
#
# **여기가 실기에 닿는 유일한 곳이다.** 허용목록은 `jog`·`moveJ`·`gripper`·`mode`·`stop`
# 다섯뿐이고, 지점 이동·비전 제안은 새 이름을 더하는 게 아니라 이 함수들로 **번역**된다.
# 라우트는 이걸 부르기만 한다 (D54 · tb-bridge 모양). 이 모듈은 main 을 모른다.
#
# 전부 **스레드에서** 돌린다 — xmlrpc 는 블로킹이고 이벤트 루프를 잡으면 stop 이 늦는다.
import time

import safety

# 그리퍼 속도·힘은 화면이 못 정한다 — 보수적 기본값을 서버가 박는다 (GOAL-live-gripper §3).
# 파지 실험으로 힘을 올리려면 여기 한 곳만 고친다. 천장: 물체별 힘 프로필은 그 골 밖이다.
GRIPPER_VEL_PCT = 30.0
GRIPPER_FORCE_PCT = 30.0
# 기구학과 상태 스트림이 같은 좌표계인지 대조할 때의 허용 오차. 같은 로봇의 같은 관절이라
# 원래 0 이어야 하고, 5mm 는 반올림·표본 시차만 덮는 값이다 (계약 §작업영역)
FK_FRAME_TOL_MM = 5.0


class Commands:
    """세션 하나에 붙는 명령 실행기. 사유 목록을 돌려주고, 비면 성공이다."""

    def __init__(self, session, on_log):
        self._s = session
        self._log = on_log

    def _age(self):
        return time.time() - self._s.lastStateAt

    # ── 이동 ────────────────────────────────────────────────────────────────
    def motion(self, target_deg, speed_pct, scan_path=False):
        """게이트 → MoveJ. 사유가 있으면 보내지 않는다.

        `scan_path=True` 는 **지점 이동**이다 (계약 §경로 검사 · D75) — 조그용 5° 상한을
        빼는 대신 현재→목표를 5° 간격으로 보간해 **표본 전부를 작업영역 게이트에 태운다.**
        상한의 근거가 "경로가 안 보인다" 였으므로, 경로를 보면 근거가 사라진다.
        """
        s = self._s
        state = s.read_fresh_state()
        reasons = safety.check_motion(state, self._age(), target_deg, speed_pct,
                                      s.appliedSettings,
                                      delta_cap=None if scan_path else safety.JOINT_DELTA_CAP_DEG)
        if reasons:
            return reasons
        coord = state.get("coord") or {}
        # 조건 12 의 카테시안 절반 — 관절 한계만으로는 손끝이 상판을 뚫는 것을 못 막는다.
        # 목표 관절을 **로봇 자신의 기구학**으로 손끝 위치로 바꿔 판정한다 (계약 §작업영역)
        if s.workspace:
            if scan_path:
                reasons = self._scan_path(state.get("jointsDeg") or [], target_deg, coord)
            else:
                reasons = safety.check_workspace(s.adapter.forward_kin(target_deg),
                                                 s.workspace, coord)
            if reasons:
                self._log("작업영역-거부", " · ".join(reasons))
                return reasons
        elif scan_path:
            # 검사할 수단이 없는데 상한만 푸는 것이 제일 위험하다 (계약 §경로 검사)
            return ["작업영역이 등재되지 않아 경로를 검사할 수 없다 — 지점 이동을 열지 않는다"]
        s.adapter.move_j(target_deg, speed_pct, coord.get("toolId", 0), coord.get("userId", 0))
        self._log("moveJ", f"target={[round(v, 3) for v in target_deg]} speed={speed_pct}")
        time.sleep(0.25)                 # 컨트롤러가 지령을 등록했는지 — 실기 진단 (2026-07-31)
        after = s.read_fresh_state()
        self._log("moveJ-after", f"queue={after.get('motionQueueLength')} "
                  f"servoTarget={[round(v, 2) for v in (after.get('lastServoTargetDeg') or [])]} "
                  f"robotState={after.get('robotState')} programState={after.get('programState')} "
                  f"motionDone={after.get('motionDone')}")
        return []

    def _scan_path(self, from_deg, to_deg, coord):
        """가는 길을 **움직이기 전에** 훑는다. 하나라도 막히면 몇 번째가 왜인지 돌려준다.

        표본은 전부 여기서 구한다 — **이동 중에 xmlrpc 를 두드리지 않는다** (연결이 하나뿐이라
        움직이는 동안 두드리면 컨트롤러가 밀린다 · 그리퍼 폴링 사고와 같은 계열).
        """
        poses = safety.path_samples(from_deg, to_deg)
        if poses is None:
            return ["경로를 표본할 수 없다 — 현재 자세를 못 읽었다 (제1원칙: 결측=차단)"]
        for i, pose in enumerate(poses, 1):
            reasons = safety.check_workspace(self._s.adapter.forward_kin(pose),
                                             self._s.workspace, coord)
            if reasons:
                return [f"가는 길 {i}/{len(poses)} 번째가 막힌다 — " + " · ".join(reasons)]
        self._log("경로검사", f"{len(poses)}점 전부 통과 — 한 번에 간다")
        return []

    def jog(self, joint, delta_deg):
        """현재 자세에서 한 축만 민다. 목표는 **서버가 현재값에서 만든다**."""
        if not isinstance(joint, int) or not 0 <= joint <= 5:
            return ["joint 는 0~5"]
        if not isinstance(delta_deg, (int, float)) or delta_deg != delta_deg:
            return ["deltaDeg 가 숫자가 아니다"]
        joints = (self._s.lastState or {}).get("jointsDeg")
        if not joints:
            return ["현재 관절값이 없다 — fail-closed"]
        target = list(joints)
        target[joint] += float(delta_deg)
        return self.motion(target, safety.SPEED_CAP_PCT)

    # ── 그리퍼 ──────────────────────────────────────────────────────────────
    def gripper(self, pct):
        """게이트 → MoveGripper. 관절 게이트가 아니라 그리퍼 전용을 탄다 (계약 §그리퍼)."""
        s = self._s
        state = s.read_fresh_state()
        reasons = safety.check_gripper(state, self._age(), pct, s.appliedSettings)
        if reasons:
            self._log("gripper-거부", " · ".join(reasons))   # 조용히 버리면 원인을 못 찾는다
            return reasons
        s.adapter.gripper_move(float(pct), GRIPPER_VEL_PCT, GRIPPER_FORCE_PCT)
        # 명령 뒤 조밀 폴링을 하지 않는다 (2026-08-04) — 그 폴링이 read_state 마다
        # IsInDragTeach(xmlrpc) 를 태워 **이동 중에** 단일 연결을 50번 두드렸다.
        # 정착값은 다음 상태 스트림이 어차피 싣는다.
        self._log("gripper", f"지령={pct} vel={GRIPPER_VEL_PCT} force={GRIPPER_FORCE_PCT}")
        return []

    def gripper_activate(self):
        """활성화 — 손가락이 실제로 움직인다. 같은 안전 확인을 지나되 pct 판정은 없다."""
        s = self._s
        state = s.read_fresh_state()
        reasons = safety.check_gripper(state, self._age(), 0, s.appliedSettings)
        # 활성화 자체가 active 를 만드는 것이므로 '활성화 안 됨' 은 사유에서 뺀다
        reasons = [r for r in reasons if "활성화되지 않았다" not in r]
        if reasons:
            return reasons
        diag = s.adapter.gripper_activate()
        time.sleep(0.5)                  # 원점을 잡는 물리 동작 — 비트가 서기까지 한 번만 본다
        after = (s.read_fresh_state() or {}).get("gripper") or {}
        self._log("gripper-activate", f"config={diag} → activeRaw={after.get('activeRaw')} "
                  f"faultRaw={after.get('faultRaw')} pctRaw={after.get('pctRaw')}")
        return []

    # ── 모드 ────────────────────────────────────────────────────────────────
    def mode(self, manual):
        """**로봇을 움직이지 않는다.** 수동으로 바꾸면 펜던트가 조작·드래그 티칭을 할 수 있고,
        자동으로 되돌리면 우리 jog/moveJ 가 가능해진다 (계약 §모드 전환 · D72)."""
        state = self._s.read_fresh_state()
        reasons = safety.check_mode(state, self._age(), manual)
        if reasons:
            self._log("mode-거부", " · ".join(reasons))
            return reasons
        self._s.adapter.set_mode(1 if manual else 0)
        self._log("mode", f"{'수동 — 펜던트가 조작한다' if manual else '자동 — 우리가 조작한다'}")
        return []

    # ── 승격 (계약 §명령 승격 — D41) ────────────────────────────────────────
    def arm_sequence(self, sample_ms):
        """서보 on → 안전 설정 → 샘플 주기 → 자동 모드 → 작업영역 좌표계 대조.
        **순서가 계약이다** — 서보 OFF 에선 auto 교정이 거부된다 (유니티 실측)."""
        s = self._s
        state = s.read_fresh_state()
        reasons = safety.check_arm(state, self._age())
        if reasons:
            return reasons
        a = s.adapter
        a.reset_errors()                 # 잠복 fault 해제 — 사람이 현장확인한 arm 안에서만
        try:
            a.enable(True)
        except Exception as e:
            # 실측(2026-07-31): FW Web-3.9.3 이 SDK V1.2.4 의 RobotEnable 만 -4 로 거부한다.
            # 사람이 펜던트에서 서보를 올렸다면 그걸 인정한다 — 실제 상태가 판정한다
            if not s.read_fresh_state().get("enabled"):
                raise ConnectionError(
                    f"{e} · 펜던트에서 로봇 Enable(활성화) 후 다시 ARM 하면 이어갈 수 있다")
        # 안전 설정은 서보를 올린 뒤·자동 모드 전에 넣는다 (계약 §로봇 안전 설정 · D53).
        # 컨트롤러 충돌 감지는 기본으로 안 켜져 있고 기본 민감도는 사람 접촉에 반응하지 않는다.
        s.apply_settings()
        a.set_sample_period(sample_ms)
        a.exit_drag_teach()
        a.set_mode(0)
        return self._check_frame()

    def _check_frame(self):
        """작업영역은 **기구학이 스트림과 같은 좌표계일 때만** 참이다. 그 가정을 여기서
        실제로 대조한다 — 어긋나면 등재된 숫자가 다른 자리를 가리킨다 (D64 계열)."""
        s = self._s
        if not s.workspace:
            return []
        st = s.read_fresh_state() or {}
        fk = s.adapter.forward_kin(st.get("jointsDeg") or [])
        tcp = st.get("tcpMmDeg") or []
        if not fk or len(tcp) < 3:
            return ["작업영역 게이트를 켤 수 없다 — 기구학을 못 구했다 (제1원칙)"]
        gap = max(abs(fk[i] - tcp[i]) for i in range(3))
        self._log("작업영역", f"기구학↔스트림 최대차 {gap:.1f}mm · fk={[round(v, 1) for v in fk[:3]]}")
        if gap > FK_FRAME_TOL_MM:
            return [f"기구학과 상태 스트림의 좌표계가 다르다 — 최대차 {gap:.1f}mm "
                    f"(> {FK_FRAME_TOL_MM}mm). 작업영역 값이 거짓이 된다"]
        return []
