# 실기 FAIRINO 어댑터 — 검증된 libfairino.dll(C#SDK-V1.2.4)을 Unity Mono 서브프로세스
# (fairino_cs/)로 부린다 (D41). Python SDK 는 리눅스 .so 에 묶여 macOS 미확인이라 쓰지 않는다.
# 필요 환경: FAIRINO_DLL=<libfairino.dll 경로> · fairino_cs/build.sh 선실행 (STACK.md §FR5 C# SDK).
import json
import os
import subprocess
import threading
import time
from pathlib import Path

from .base import RobotAdapter

HERE = Path(__file__).parent
RESPONSE_TIMEOUT_S = 20.0       # RPC 연결 시도가 제일 길다 — SDK 내부 타임아웃보다 넉넉히

# SDK 반환 코드 → 사람 말. 정본: manual.fairino.support §Error Code (2026-07-31 대조).
# Unity 번역기의 -4="비상정지" 매핑은 공식 문서와 달랐다 — 공식이 이긴다 (STACK.md).
ERROR_TRANSLATE = {
    -1: "기타 오류 — 컨트롤러 로그 확인 필요",
    -2: "컨트롤러 통신 이상 — 연결·전원 확인",
    -3: "xmlrpc 통신 실패 — 네트워크·IP 확인",
    -4: "컨트롤러가 실행을 거부(xmlrpc 인터페이스 실행 실패) — 웹 펜던트가 제어권을 쥐고 있거나 "
        "수동 모드·비상정지·안전회로 상태를 확인",
}


class FairinoAdapter(RobotAdapter):
    def __init__(self, profile):
        self._profile = profile
        self._proc = None
        self._lock = threading.Lock()   # 서브프로세스 stdin/stdout 은 한 번에 한 요청

    # ── 서브프로세스 왕복 ──────────────────────────────────────────────────
    def _ensure_proc(self):
        if self._proc is not None and self._proc.poll() is None:
            return
        if not os.environ.get("FAIRINO_DLL"):
            raise ConnectionError(
                "FAIRINO_DLL 환경변수가 없다 — libfairino.dll 경로를 지정해야 실기 어댑터가 선다 (D41)")
        exe = HERE / "fairino_cs" / "bin" / "fairino-cs.exe"
        if not exe.exists():
            raise ConnectionError("fairino-cs 미빌드 — bash FR5/bridge/robot_adapter/fairino_cs/build.sh")
        self._proc = subprocess.Popen(
            ["bash", str(HERE / "fairino_cs" / "run.sh")],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, bufsize=1,
        )

    def _rpc(self, op, **kw):
        with self._lock:
            self._ensure_proc()
            self._proc.stdin.write(json.dumps({"op": op, **kw}) + "\n")
            self._proc.stdin.flush()
            deadline = time.time() + RESPONSE_TIMEOUT_S
            while time.time() < deadline:
                line = self._proc.stdout.readline()
                if line == "":
                    raise ConnectionError("fairino-cs 프로세스가 죽었다")
                line = line.strip()
                # SDK 가 stdout 에 자기 로그(중국어)를 섞는다 — JSON 줄만 응답으로 본다 (실측)
                if not line.startswith("{"):
                    continue
                try:
                    res = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if res.get("ok"):
                    return res
                code = res.get("code")
                hint = ERROR_TRANSLATE.get(code)
                detail = f"{hint} (code={code})" if hint else f"{res.get('error')} (code={code})"
                raise ConnectionError(f"SDK {op} 실패 — {detail}")
            raise ConnectionError(f"SDK {op} 응답 시간 초과")

    # ── RobotAdapter ──────────────────────────────────────────────────────
    def connect(self):
        ip = self._profile["endpoint"].split(":")[0]
        self._rpc("connect", ip=ip)

    def disconnect(self):
        try:
            self._rpc("disconnect")
        finally:
            if self._proc is not None:
                self._proc.terminate()
                self._proc = None

    def get_version(self):
        v = self._rpc("version")
        sdk_raw = (v.get("sdk") or "").split()
        # 실측: " C#SDK-V1.2.4  Web-3.9.3" 한 줄. software/firmware 는 빈 문자열이다 —
        # 못 읽은 값은 None 으로 보고한다. 빈 문자열로 아는 척하지 않는다 (base.py)
        return {
            "model": None,
            "controller": None,
            "servo": None,
            "end": None,
            "sdk": sdk_raw[0] if sdk_raw else None,
            "web": sdk_raw[1] if len(sdk_raw) > 1 else None,
        }

    def read_state(self):
        s = self._rpc("state")
        missing = list(s.get("missing", []))
        safety = {
            "code": s.get("safetyCode", 0),
            "emergencyStop": bool(s.get("emergencyStop", 0)),
            "safetyStop": bool(s.get("safetyStop0", 0)) or bool(s.get("safetyStop1", 0)),
            "collisionDetected": bool(s.get("collision", 0)),
            "inDragTeach": bool(s.get("dragTeach", 0)),
            "mainErrorCode": int(s.get("mainError", 0)),
            "subErrorCode": int(s.get("subError", 0)),
        }
        for key, srcs in [("emergencyStop", ["emergencyStop"]), ("safetyStop", ["safetyStop0", "safetyStop1"]),
                          ("collisionDetected", ["collision"]), ("inDragTeach", ["dragTeach"]),
                          ("mainErrorCode", ["mainError"]), ("subErrorCode", ["subError"])]:
            if any(x in missing for x in srcs):
                safety.pop(key, None)      # 못 읽은 필드는 지운다 — preflight·게이트가 fail-closed 한다
        state = {
            "enabled": bool(s.get("enabled", 0)),
            "mode": int(s.get("mode", 1)),
            "jointsDeg": s["jointsDeg"],
            "tcpMmDeg": s["tcpMmDeg"],
            "motionQueueLength": int(s.get("queueLen", 0)),
            "safety": safety,
            "coord": {"toolId": int(s.get("toolId", 0)), "userId": int(s.get("userId", 0))},
            "gripper": {"opened": None, "pos": None},   # 그리퍼 시그니처 미검증 — P3 에서 (STACK.md)
            "missing": missing,
        }
        if "lastServoTarget" in s:
            state["lastServoTargetDeg"] = s["lastServoTarget"]
        return state

    def reset_errors(self):
        self._rpc("reset")

    def enable(self, on):
        self._rpc("enable", on=1 if on else 0)

    def set_mode(self, mode):
        self._rpc("mode", mode=int(mode))

    def exit_drag_teach(self):
        self._rpc("dragteach", on=0)

    def set_sample_period(self, ms):
        self._rpc("sample", ms=int(ms))

    def move_j(self, joints_deg, speed_pct, tool, user):
        self._rpc("movej", jointsDeg=list(joints_deg), speedPct=float(speed_pct),
                  toolId=int(tool), userId=int(user))

    def stop(self):
        self._rpc("stop")
