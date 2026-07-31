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


def _code(rtn, op):
    """SDK 는 int 또는 (int, ...) 를 돌려준다. 0 이 아니면 사람 말로 던진다."""
    code = rtn[0] if isinstance(rtn, (list, tuple)) else rtn
    if code != 0:
        hint = ERROR_TRANSLATE.get(code)
        raise ConnectionError(f"SDK {op} 실패 — {hint + ' ' if hint else ''}(code={code})")
    return rtn


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
            try:
                self._r.CloseRPC()
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
            rtn = self._r.IsInDragTeach()   # (error, state) — xmlrpc 왕복
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
            _code(self._r.ResetAllError(), "reset")

    def enable(self, on):
        with self._lock:
            _code(self._r.RobotEnable(1 if on else 0), "enable")

    def set_mode(self, mode):
        with self._lock:
            _code(self._r.Mode(int(mode)), "mode")

    def exit_drag_teach(self):
        with self._lock:
            _code(self._r.DragTeachSwitch(0), "dragteach")
        self._drag = (0.0, False)

    def set_sample_period(self, ms):
        # v2 SDK 는 20004 스트림이 주기를 스스로 관리한다 — 별도 설정 호출이 없다
        return

    def move_j(self, joints_deg, speed_pct, tool, user):
        with self._lock:
            _code(self._r.MoveJ(list(joints_deg), int(tool), int(user), vel=float(speed_pct)),
                  "moveJ")

    def stop(self):
        with self._lock:
            _code(self._r.StopMotion(), "stop")
