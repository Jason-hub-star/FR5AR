# 조종권 — 명령 주인은 한 명 (하드룰 4 · API-CONTRACT §조종권).
# 신원 증명은 하지 않는다 (LAN·팀 신뢰 전제 — TB 규칙 미러, 배포 주소를 여는 누구나 조작).
# 보호는 인증이 아니라 조종권 1명 · 안전 게이트 · stop 상시가 맡는다.
import threading
import time

AUTO_RELEASE_S = 10.0


class Owner:
    def __init__(self, on_lost, on_log):
        self._who = None
        self._sessions = {}             # who -> 살아있는 WS 세션 수
        self._disconnected_at = {}
        self._lock = threading.Lock()
        self._on_lost = on_lost         # (who) — 조종권 소실 시 브리지가 disarm 한다
        self._on_log = on_log
        threading.Thread(target=self._reaper, daemon=True).start()

    def claim(self, who):
        if not who:
            return False, "이름이 없다"
        with self._lock:
            if self._who and self._who != who:
                return False, f"조종권은 {self._who} 에게 있다 (409)"
            self._who = who
        self._on_log("owner-claim", who)
        return True, None

    def release(self, who):
        with self._lock:
            if self._who != who:
                return False, "owner 불일치 (409)"
            self._who = None
        self._on_log("owner-release", who)
        self._on_lost(who)
        return True, None

    def get(self):
        with self._lock:
            return self._who

    def is_owner(self, who):
        with self._lock:
            return who is not None and self._who == who

    # WS 세션 수명 — hello/close 가 부른다. 마지막 세션이 끊기고 10초 지나면 자동 해제
    def session_open(self, who):
        with self._lock:
            self._sessions[who] = self._sessions.get(who, 0) + 1
            self._disconnected_at.pop(who, None)

    def session_close(self, who):
        with self._lock:
            n = self._sessions.get(who, 1) - 1
            if n <= 0:
                self._sessions.pop(who, None)
                self._disconnected_at[who] = time.time()
            else:
                self._sessions[who] = n

    def _reaper(self):
        while True:
            time.sleep(1.0)
            lost = None
            with self._lock:
                gone = [w for w, at in self._disconnected_at.items() if time.time() - at > AUTO_RELEASE_S]
                for who in gone:
                    self._disconnected_at.pop(who, None)
                    if self._who == who:
                        self._who = None
                        lost = who
            if lost:
                self._on_log("owner-auto-release", f"{lost} 세션 종료 {AUTO_RELEASE_S:.0f}s")
                self._on_lost(lost)
