# FAIRINO SDK 접점의 유일한 경계 (FR5/bridge/README.md). 이 밖에서는 SDK 를 import 하지 않는다.
# 단위 변환(라디안·미터 ↔ 도·mm)도 이 경계 안에서만 한다 (하드룰 5).


class RobotAdapter:
    """mock.py 와 fairino.py 가 같은 얼굴을 갖는다. 바깥면 단위는 전부 도(°)·mm."""

    def connect(self) -> None:
        """관측 연결만 연다. 서보·모드는 절대 건드리지 않는다 (observe-only)."""
        raise NotImplementedError

    def disconnect(self) -> None:
        raise NotImplementedError

    def get_version(self) -> dict:
        """{ model, controller, servo, end, sdk, web } — API-CONTRACT GET /version 모양."""
        raise NotImplementedError

    def read_state(self) -> dict:
        """API-CONTRACT §상태값의 로봇 유래 필드만 — enabled·mode·jointsDeg·tcpMmDeg·
        motionQueueLength·safety·coord·gripper. t/robotId/owner/phase 는 브리지가 얹는다."""
        raise NotImplementedError

    # 명령 계열(jog/moveJ/gripper/stop, 서보·모드 전이)은 P2 에서 이 경계에 추가한다.
