# FAIRINO SDK 접점의 유일한 경계 (FR5/bridge/README.md). 이 밖에서는 SDK 를 import 하지 않는다.
# 단위 변환(라디안·미터 ↔ 도·mm)도 이 경계 안에서만 한다 (하드룰 5).
# 여기는 안전 판정을 하지 않는다 — 게이트는 브리지(safety.py)가 강제한다 (SAFETY-RULES 제2원칙).


class RobotAdapter:
    """mock.py 와 fairino.py 가 같은 얼굴을 갖는다. 바깥면 단위는 전부 도(°)·mm."""

    def connect(self) -> None:
        """관측 연결만 연다. 서보·모드는 절대 건드리지 않는다 (observe-only)."""
        raise NotImplementedError

    def disconnect(self) -> None:
        raise NotImplementedError

    def get_version(self) -> dict:
        """{ model, controller, servo, end, sdk, web } — 못 읽는 값은 None 으로 보고한다.
        빈 문자열로 채워 아는 척하지 않는다 (preflight 가 '보고된 값만' 검증한다)."""
        raise NotImplementedError

    def read_state(self) -> dict:
        """API-CONTRACT §상태값의 로봇 유래 필드 — enabled·mode·jointsDeg·tcpMmDeg·
        motionQueueLength·safety·coord·gripper. 게이트 재료로 lastServoTargetDeg(있으면)와
        missing(못 읽은 필드 이름 목록)을 함께 준다. t/robotId/owner/phase 는 브리지가 얹는다."""
        raise NotImplementedError

    # ── 안전 설정 — 주인은 브리지다 (D53 · SAFETY-RULES §설정이 전제다) ────
    def apply_settings(self, settings: dict) -> None:
        """프로필의 settings 를 로봇에 넣는다. arm 시퀀스에서 서보 ON 직후에 부른다.

        컨트롤러 충돌 감지는 기본으로 켜져 있지 않고, 말단 하중이 없으면 드래그·충돌감지가
        오작동한다 (공식 매뉴얼). 그래서 **매번** 넣는다 — 펜던트에서 누가 바꿔도 되돌린다.
        실패는 예외로 던진다. 조용히 넘어가면 게이트가 있는 척만 하게 된다.
        """
        raise NotImplementedError

    def read_settings(self) -> dict:
        """되읽을 수 있는 설정만 돌려준다. **못 읽는 값은 None** (base 규칙 그대로).

        SDK 에 SetAnticollision·SetCollisionStrategy·SetRobotInstallPos·SetPowerLimit 의
        Get 이 없다 (STACK §로봇 안전 설정 API). 그것들은 여기서 None 이고, 브리지가
        appliedSettings.unverifiable 로 정직하게 노출한다.
        """
        raise NotImplementedError

    # ── 명령 계열 — ARMED 승격 뒤에만 브리지가 부른다 ──────────────────────
    def reset_errors(self) -> None:
        """잠복 fault 해제 (ResetAllError). arm 시퀀스 맨 앞에서만 부른다."""
        raise NotImplementedError

    def enable(self, on: bool) -> None:
        """서보 on/off."""
        raise NotImplementedError

    def set_mode(self, mode: int) -> None:
        """0=auto 1=manual."""
        raise NotImplementedError

    def exit_drag_teach(self) -> None:
        raise NotImplementedError

    def set_sample_period(self, ms: int) -> None:
        raise NotImplementedError

    def move_j(self, joints_deg, speed_pct: float, tool: int, user: int) -> None:
        """작은 delta 의 MoveJ. 상한 검사는 브리지가 이미 끝냈다."""
        raise NotImplementedError

    def stop(self) -> None:
        """항상 성공해야 한다. 예외를 던지면 브리지가 fail-closed 로 기록한다."""
        raise NotImplementedError
