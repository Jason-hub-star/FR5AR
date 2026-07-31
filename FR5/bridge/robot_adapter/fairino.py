# 실기 FAIRINO 어댑터 자리 — Python SDK 의 설치 경로·macOS 동작이 미확인이다
# (PROJECT-STATUS §블로커). C# readback 성공(2026-07-31)을 Python 성공으로 간주하지 않는다.
# 확인 전에는 연결 자체를 fail-closed 로 거부한다. 추측 구현은 하지 않는다 (스택가드).
from .base import RobotAdapter


class FairinoAdapter(RobotAdapter):
    def __init__(self, profile):
        self._profile = profile

    def connect(self):
        raise ConnectionError(
            "fairino 어댑터 미구현 — Python SDK 설치·macOS 동작 미확인 (PROJECT-STATUS §블로커). "
            "mock 프로필로 진행하거나 Linux 브리지 검증 후 구현한다"
        )

    def disconnect(self):
        pass

    def get_version(self):
        raise ConnectionError("fairino 어댑터 미구현")

    def read_state(self):
        raise ConnectionError("fairino 어댑터 미구현")
