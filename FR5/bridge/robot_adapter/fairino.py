# 실기 FAIRINO 어댑터 — 공식 Python SDK(순수 표준 라이브러리) 직접 사용 (D42).
# xmlrpc(20003) 명령 + 20004 실시간 상태(RobotStatePkg, SDK 백그라운드 스레드가 캐시).
# 이전 C# dll·Mono 서브프로세스 경로(fairino_cs/)는 2026-07-31 실측에서 Mono xmlrpc 클라이언트가
# 쓰기 호출마다 예외를 삼키고(-4 · 가짜 성공) 컨트롤러 xmlrpc 서비스까지 넘어뜨려 폐기했다.
import math
import threading
import time

from .base import RobotAdapter

# SDK 반환 코드 → 사람 말. 정본: manual.fairino.support §Error Code + SDK RobotError.
ERROR_TRANSLATE = {
    -1: "기타 오류 — 컨트롤러 로그 확인 필요",
    -2: "컨트롤러 통신 이상 — 연결·전원 확인",
    -3: "xmlrpc 통신 실패 — 네트워크·IP 확인",
    -4: "xmlrpc 인터페이스 실행 실패 — 컨트롤러 상태 확인",
    99: "안전정지 신호(SI0/SI1) 활성",
}
DRAG_CACHE_S = 0.5              # IsInDragTeach 는 xmlrpc 왕복이라 캐시한다 (신선도 게이트 이내)
CMD_TIMEOUT_S = 3.0             # xmlrpc 왕복 상한. 넘으면 행으로 보고 던진다 (아래 _guard)
STOP_LOCK_WAIT_S = 0.2          # stop 이 잠금을 기다리는 최대 시간. 그 뒤엔 잠금 없이 보낸다


def _code(rtn, op):
    """SDK 는 int 또는 (int, ...) 를 돌려준다. 0 이 아니면 사람 말로 던진다."""
    code = rtn[0] if isinstance(rtn, (list, tuple)) else rtn
    if code != 0:
        hint = ERROR_TRANSLATE.get(code)
        raise ConnectionError(f"SDK {op} 실패 — {hint + ' ' if hint else ''}(code={code})")
    return rtn


def _guard(fn, *args, **kwargs):
    """xmlrpc 호출을 별도 스레드에서 돌려 상한을 씌운다.

    SDK 는 연결 뒤 소켓 타임아웃을 None 으로 되돌린다 (`Robot.py` connect finally).
    그래서 순단이 '끊김' 이 아니라 '행' 이면 호출이 영원히 안 돌아오고, 잠금을 쥔 채면
    브리지 전체가 선다 — 실측 5.4초 공백의 뿌리다 (evidence/2026-08-03/fr5-field-gates.md).
    데몬 스레드는 버린다: 죽일 방법이 없으니 잡아 두지 않고 호출자만 풀어 준다.
    """
    box = {}

    def _run():
        try:
            box["v"] = fn(*args, **kwargs)
        except Exception as e:      # noqa: BLE001 — 어떤 실패든 호출자에게 그대로 전달한다
            box["e"] = e

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(CMD_TIMEOUT_S)
    if t.is_alive():
        raise ConnectionError(f"SDK 응답 없음 {CMD_TIMEOUT_S:.0f}s — 컨트롤러·네트워크 확인")
    if "e" in box:
        raise box["e"]
    return box["v"]


class FairinoAdapter(RobotAdapter):
    def __init__(self, profile):
        self._profile = profile
        self._r = None
        self._version = None
        self._lock = threading.Lock()   # 명령 직렬화 — xmlrpc 는 동시성에 약하다 (실측)
        self._drag = (0.0, False)       # (읽은 시각, 값)

    def connect(self):
        from .fairino_sdk import Robot as _sdk   # 무거운 모듈(685KB) — 실기 프로필일 때만 로드
        ip = self._profile["endpoint"].split(":")[0]
        r = _sdk.RPC(ip)
        # 생성자는 실패해도 예외를 안 던진다 — 버전 질의로 xmlrpc 생사를 직접 판정한다 (fail-closed)
        try:
            ver = r.GetSoftwareVersion()
        except Exception as e:
            raise ConnectionError(f"xmlrpc 검증 실패 — {e}")
        if not (isinstance(ver, (list, tuple)) and len(ver) >= 4 and ver[0] == 0):
            raise ConnectionError(f"xmlrpc 검증 실패 — GetSoftwareVersion={ver!r}")
        # 실측 모양: [0, 'FR5-V1-002(V6.0)', 'v3.9.3.1', 'V3.9.15-QX'] = 모델·웹·컨트롤러
        self._version = {"model": str(ver[1]), "web": str(ver[2]), "controller": str(ver[3]),
                         "servo": None, "end": None, "sdk": "fairino-python v2.2.3_robot3.9.3"}
        # 실시간 상태(20004) 첫 프레임 대기 — pkg 가 클래스면 아직 수신 전이다
        for _ in range(30):
            if not isinstance(r.robot_state_pkg, type):
                self._r = r
                return
            time.sleep(0.1)
        raise ConnectionError("실시간 상태(20004) 첫 프레임이 안 온다")

    def disconnect(self):
        if self._r is not None:
            # 잠금 안에서 닫는다 — 명령이 소켓을 쓰는 중에 CloseRPC 가 겹치면 같은 소켓을 동시에 건드린다
            with self._lock:
                try:
                    _guard(self._r.CloseRPC)
                except Exception:
                    pass
                self._r = None

    def get_version(self):
        if self._version is None:
            raise ConnectionError("미연결")
        return dict(self._version)

    def _in_drag_teach(self):
        at, val = self._drag
        if time.time() - at < DRAG_CACHE_S:
            return val
        with self._lock:                    # xmlrpc 는 연결 하나 — 동시 요청이면 Request-sent 로 얽힌다 (실측)
            at, val = self._drag            # 잠금 대기 중 다른 스레드가 채웠으면 재사용
            if time.time() - at < DRAG_CACHE_S:
                return val
            rtn = _guard(self._r.IsInDragTeach)   # (error, state) — xmlrpc 왕복
        val = bool(rtn[1]) if isinstance(rtn, (list, tuple)) and len(rtn) > 1 and rtn[0] == 0 else None
        self._drag = (time.time(), val)
        return val

    def read_state(self):
        if self._r is None:
            raise ConnectionError("연결이 없다")
        pkg = self._r.robot_state_pkg
        if isinstance(pkg, type):
            raise ConnectionError("실시간 상태 수신 끊김")
        joints = [float(v) for v in pkg.jt_cur_pos]
        tcp = [float(v) for v in pkg.tl_cur_pos]
        missing = []
        drag = self._in_drag_teach()
        safety = {
            "code": 99 if (pkg.safety_stop0_state or pkg.safety_stop1_state) else 0,
            "emergencyStop": bool(pkg.EmergencyStop),
            "safetyStop": bool(pkg.safety_stop0_state) or bool(pkg.safety_stop1_state),
            "collisionDetected": bool(pkg.collisionState),
            "mainErrorCode": int(pkg.main_code),
            "subErrorCode": int(pkg.sub_code),
        }
        if drag is None:
            missing.append("inDragTeach")   # 못 읽으면 결측 — 게이트가 fail-closed 한다
        else:
            safety["inDragTeach"] = drag
        state = {
            "enabled": bool(pkg.rbtEnableState),
            "mode": int(pkg.robot_mode),     # 0=auto 1=manual — SDK 주석 원문 그대로
            "jointsDeg": [round(v, 4) for v in joints],
            "tcpMmDeg": [round(v, 4) for v in tcp],
            "motionQueueLength": int(pkg.mc_queue_len),
            "safety": safety,
            "coord": {"toolId": int(pkg.tool), "userId": int(pkg.user)},
            "gripper": {"opened": None, "pos": int(pkg.gripper_position)},
            "lastServoTargetDeg": [float(v) for v in pkg.lastServoTarget],
            "missing": missing,
        }
        return state

    # ── 명령 계열 — ARMED 승격 뒤에만 브리지가 부른다. 상한 검사는 브리지 몫 ──
    def reset_errors(self):
        with self._lock:
            _code(_guard(self._r.ResetAllError), "reset")

    def enable(self, on):
        with self._lock:
            _code(_guard(self._r.RobotEnable, 1 if on else 0), "enable")

    def set_mode(self, mode):
        with self._lock:
            _code(_guard(self._r.Mode, int(mode)), "mode")

    def exit_drag_teach(self):
        with self._lock:
            _code(_guard(self._r.DragTeachSwitch, 0), "dragteach")
        self._drag = (0.0, False)

    def set_sample_period(self, ms):
        # v2 SDK 는 20004 스트림이 주기를 스스로 관리한다 — 별도 설정 호출이 없다
        return

    def move_j(self, joints_deg, speed_pct, tool, user):
        with self._lock:
            _code(_guard(self._r.MoveJ, list(joints_deg), int(tool), int(user),
                         vel=float(speed_pct)), "moveJ")

    def stop(self):
        # SAFETY-RULES 제3원칙 — 정지를 막는 조건은 만들지 않는다. 잠금도 조건이다:
        # 앞선 명령이 행이면 잠금을 기다리다 stop 이 못 나간다. 잠깐만 기다리고,
        # 안 잡히면 잠금 없이 보낸다. xmlrpc 동시성 위험보다 안 멈추는 쪽이 더 나쁘다.
        got = self._lock.acquire(timeout=STOP_LOCK_WAIT_S)
        try:
            _code(_guard(self._r.StopMotion), "stop")
        finally:
            if got:
                self._lock.release()
