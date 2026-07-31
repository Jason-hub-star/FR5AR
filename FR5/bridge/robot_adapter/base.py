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

    # ── 명령 계열 — ARMED 승격 뒤에만 브리지가 부른다 ──────────────────────
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
