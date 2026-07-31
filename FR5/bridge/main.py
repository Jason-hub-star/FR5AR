# fr5-bridge — FAIRINO FR5 의 유일한 관문 (API-CONTRACT.md 가 정본이다. 어긋나면 문서부터 고친다).
# 실행: bash scripts/dev/fr5-dev.sh  (실기: FAIRINO_DLL=<libfairino.dll> 필요 — D41)
# P0: profile·observe-only preflight·상태 스트림 · P2: 조종권·arm·guarded jog/stop.
# 배포: npm run build:fr5 뒤 이 서버가 FR5/dist 를 같은 주소에서 서빙한다 —
# 주소를 여는 누구나 조작 후보다 (LAN·팀 신뢰). 보호는 조종권 1명·게이트·stop 상시가 맡는다.
import asyncio
import json
import math
import time
from pathlib import Path

import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import preflight
import safety
from owner import Owner
from robot_adapter import make_adapter

HERE = Path(__file__).parent
CONFIG = yaml.safe_load((HERE / "config.yaml").read_text())
PROFILES = {r["robotId"]: r for r in CONFIG["robots"]}
SAMPLE_MS = CONFIG.get("sample_ms", 33)

app = FastAPI(title="fr5-bridge")

# 연결은 한 번에 하나 — 명령 주인이 한 명이듯 관문의 로봇도 하나다 (하드룰 4)
session = {
    "profile": None, "adapter": None,
    "phase": "DISCONNECTED", "failReason": None,
    "version": None, "observedAt": None,
    "armed": False,
    "lastState": None, "lastStateAt": 0.0,
    "badReads": 0,
}
BAD_READS_LIMIT = 3     # 유니티 실측 정책 — 연속 3회 불량이면 연결 손실 판정 (API-CONTRACT §실기)


def log(event, detail=""):
    # 재연결·fail-closed·명령 기록 — P0~P2 는 stdout. 영속 기록은 P6(History)에서 승격한다
    print(f"[fr5-bridge] {time.strftime('%H:%M:%S')} {event} {detail}", flush=True)


def _owner_lost(who):
    # 조종권 소실 = 즉시 disarm — 주인 없는 ARMED 를 남기지 않는다
    if session["armed"]:
        _disarm_hw(f"조종권 소실({who})")


def _disarm_hw(why):
    session["armed"] = False
    a = session["adapter"]
    if a is None:
        return
    try:
        a.stop()
        a.enable(False)
        log("disarm", why)
    except Exception as e:
        log("disarm-fail", f"{why} — {e}")


owner = Owner(_owner_lost, lambda e, d: log(e, d))


def refuse(reasons, status=409):
    return JSONResponse(
        {"ok": False, "phase": current_phase(), "reasons": reasons}, status_code=status
    )


def fail_closed(reason):
    session["armed"] = False
    if session["adapter"]:
        try:
            session["adapter"].disconnect()
        except Exception:
            pass
    session.update(profile=None, adapter=None, phase="FAIL_CLOSED", failReason=reason,
                   lastState=None)
    log("FAIL_CLOSED", reason)


def current_phase():
    if session["adapter"] is None:
        return session["phase"]
    if session["armed"]:
        st = session["lastState"] or {}
        return "EXECUTING" if st.get("motionQueueLength") else "ARMED"
    return "OWNER_HELD" if owner.get() else "OBSERVE_ONLY"


def read_fresh_state():
    """어댑터에서 지금 읽고 세션에 기록한다. 실패는 fail-closed.

    비정상 수치(NaN/inf — SDK 워밍업·전송 오류)는 그 샘플을 버리고 직전 값을 유지한다.
    타임스탬프를 안 올리므로 신선도 게이트가 모션을 막는다. 연속 3회면 연결 손실 판정.
    """
    state = session["adapter"].read_state()
    numbers = list(state.get("jointsDeg") or []) + list(state.get("tcpMmDeg") or [])
    if len(numbers) != 12 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in numbers):
        session["badReads"] += 1
        log("bad-read", f"{session['badReads']}/{BAD_READS_LIMIT} — 비정상 수치 샘플 폐기")
        if session["badReads"] >= BAD_READS_LIMIT:
            raise ConnectionError(f"연속 {BAD_READS_LIMIT}회 비정상 상태 — 연결 손실 판정")
        if session["lastState"] is not None:
            return session["lastState"]
        raise ConnectionError("첫 상태부터 비정상 수치 — fail-closed")
    session["badReads"] = 0
    session["lastState"] = state
    session["lastStateAt"] = time.time()
    return state


def snapshot():
    """미연결에도 같은 스키마 — 클라이언트가 빈 응답을 따로 처리하지 않는다 (D40)."""
    base = {
        "t": time.time(),
        "robotId": None, "connected": False, "enabled": False, "mode": 1,
        "jointsDeg": [0, 0, 0, 0, 0, 0], "tcpMmDeg": [0, 0, 0, 0, 0, 0],
        "motionQueueLength": 0,
        "safety": {"code": 0, "emergencyStop": False, "safetyStop": False,
                   "collisionDetected": False, "inDragTeach": False,
                   "mainErrorCode": 0, "subErrorCode": 0},
        "coord": {"toolId": 0, "userId": 0},
        "sampleMs": SAMPLE_MS,
        "gripper": {"opened": True, "pos": 0},
        "owner": owner.get(),
        "phase": session["phase"], "failReason": session["failReason"],
    }
    if session["adapter"] is None:
        return base
    try:
        state = read_fresh_state()
    except Exception as e:                      # 읽기 실패 = 연결 손실 — fail-closed (계약 §안전)
        fail_closed(f"상태 읽기 실패 — {e}")
        base.update(phase="FAIL_CLOSED", failReason=session["failReason"])
        return base
    base.update({k: v for k, v in state.items() if k not in ("missing", "lastServoTargetDeg")})
    base.update(robotId=session["profile"]["robotId"], connected=True, phase=current_phase())
    return base


# ── 프로필·연결 (API-CONTRACT §로봇 프로필과 읽기 전용 사전검증) ─────────────
@app.get("/robots")
async def robots():
    return [
        {"robotId": r["robotId"], "name": r["name"], "model": r["expectedModel"],
         "endpoint": r["endpoint"],
         "lastObserved": session["observedAt"]
         if session["profile"] and session["profile"]["robotId"] == r["robotId"] else None}
        for r in CONFIG["robots"]
    ]


@app.post("/connect")
async def connect(body: dict):
    robot_id = body.get("robotId")
    profile = PROFILES.get(robot_id)
    if not profile:
        return refuse([f"없는 robotId — {robot_id}"], 404)
    if body.get("observeOnly", True) is not True:
        return refuse(["연결은 observe-only 로만 열린다 — 명령 승격은 POST /arm (D41)"])
    if session["adapter"] is not None:
        return refuse([f"이미 {session['profile']['robotId']} 에 연결 — 먼저 disconnect"])

    session.update(phase="PREFLIGHT", failReason=None)
    log("PREFLIGHT", f"robotId={robot_id} endpoint={profile['endpoint']}")
    adapter = make_adapter(profile)

    def _preflight():
        adapter.connect()
        return adapter.get_version(), adapter.read_state()

    try:
        version, state = await asyncio.to_thread(_preflight)
    except Exception as e:
        fail_closed(str(e))
        return refuse([str(e)])

    reasons = preflight.check(profile, version, state)
    if reasons:
        try:
            adapter.disconnect()
        except Exception:
            pass
        fail_closed(" · ".join(reasons))
        return refuse(reasons)

    session.update(profile=profile, adapter=adapter, phase="OBSERVE_ONLY",
                   version=version, observedAt=time.time(),
                   lastState=state, lastStateAt=time.time(), badReads=0)
    log("OBSERVE_ONLY", f"robotId={robot_id} sdk={version.get('sdk')}")
    return {"ok": True, "phase": "OBSERVE_ONLY", "reasons": []}


@app.get("/version")
async def version():
    if session["version"] is None:
        return refuse(["미연결 — 관측된 버전이 없다"])
    v = session["version"]
    return {"robotId": session["profile"]["robotId"], "controller": v.get("controller"),
            "servo": v.get("servo"), "end": v.get("end"), "sdk": v.get("sdk"),
            "web": v.get("web"), "observedAt": session["observedAt"]}


@app.post("/disconnect")
async def disconnect():
    if session["adapter"]:
        if session["armed"]:
            await asyncio.to_thread(_disarm_hw, "disconnect")
        try:
            await asyncio.to_thread(session["adapter"].disconnect)
        except Exception:
            pass
        log("DISCONNECTED", session["profile"]["robotId"])
    session.update(profile=None, adapter=None, phase="DISCONNECTED",
                   failReason=None, version=None, armed=False, lastState=None, badReads=0)
    return {"ok": True, "phase": "DISCONNECTED", "reasons": []}


# ── 조종권 (API-CONTRACT §조종권) ────────────────────────────────────────────
@app.post("/owner/claim")
async def owner_claim(body: dict):
    okey, reason = owner.claim(body.get("who"))
    return {"ok": True, "owner": owner.get()} if okey else refuse([reason], 409)


@app.post("/owner/release")
async def owner_release(body: dict):
    okey, reason = owner.release(body.get("who"))
    return {"ok": True, "owner": None} if okey else refuse([reason], 409)


# ── 명령 승격 (API-CONTRACT §명령 승격 — D41) ────────────────────────────────
@app.post("/arm")
async def arm(body: dict):
    who = body.get("who")
    if body.get("confirm") != "현장확인":
        return refuse(['confirm: "현장확인" 이 없다 — 현장에 사람이 있음을 명시해야 한다'], 403)
    if not owner.is_owner(who):
        return refuse(["조종권이 없다 — 먼저 /owner/claim"], 403)
    if session["adapter"] is None:
        return refuse(["미연결"])
    if session["armed"]:
        return {"ok": True, "phase": current_phase(), "reasons": []}

    def _arm_seq():
        state = read_fresh_state()
        reasons = safety.check_arm(state, time.time() - session["lastStateAt"])
        if reasons:
            return reasons
        a = session["adapter"]
        # 순서는 계약 §2단계 — 서보를 먼저 올린다 (서보 OFF 에선 auto 교정 거부, 유니티 실측)
        a.reset_errors()          # 잠복 fault 해제 — 사람이 현장확인한 arm 안에서만
        try:
            a.enable(True)
        except Exception as e:
            # 실측(2026-07-31): FW Web-3.9.3 이 SDK V1.2.4 의 RobotEnable 만 -4 로 거부한다.
            # 사람이 펜던트에서 서보를 올렸다면 그걸 인정한다 — 실제 상태가 판정한다 (fail-closed 유지)
            if not read_fresh_state().get("enabled"):
                raise ConnectionError(
                    f"{e} · 펜던트에서 로봇 Enable(활성화) 후 다시 ARM 하면 이어갈 수 있다")
        a.set_sample_period(SAMPLE_MS)
        a.exit_drag_teach()
        a.set_mode(0)
        return []

    try:
        reasons = await asyncio.to_thread(_arm_seq)
    except Exception as e:
        await asyncio.to_thread(_disarm_hw, f"arm 실패 — {e}")
        return refuse([f"arm 시퀀스 실패 — {e}"])
    if reasons:
        return refuse(reasons)
    session["armed"] = True
    log("ARMED", f"who={who}")
    return {"ok": True, "phase": "ARMED", "reasons": []}


@app.post("/disarm")
async def disarm(body: dict):
    if not owner.is_owner(body.get("who")):
        return refuse(["조종권이 없다"], 403)
    await asyncio.to_thread(_disarm_hw, f"disarm by {body.get('who')}")
    return {"ok": True, "phase": current_phase(), "reasons": []}


# ── 상태 (API-CONTRACT §상태값) ──────────────────────────────────────────────
@app.get("/state")
async def state():
    return await asyncio.to_thread(snapshot)


# ── 명령 실행 ────────────────────────────────────────────────────────────────
def _do_motion(target_deg, speed_pct):
    """게이트 → MoveJ. 사유가 있으면 보내지 않는다. (스레드에서 실행)"""
    state = read_fresh_state()
    reasons = safety.check_motion(state, time.time() - session["lastStateAt"],
                                  target_deg, speed_pct)
    if reasons:
        return reasons
    coord = state.get("coord") or {}
    session["adapter"].move_j(target_deg, speed_pct,
                              coord.get("toolId", 0), coord.get("userId", 0))
    log("moveJ", f"target={[round(v, 3) for v in target_deg]} speed={speed_pct}")
    time.sleep(0.25)                     # 컨트롤러가 지령을 등록했는지 — 실기 진단 (2026-07-31)
    after = read_fresh_state()
    log("moveJ-after", f"queue={after.get('motionQueueLength')} "
        f"servoTarget={[round(v, 2) for v in (after.get('lastServoTargetDeg') or [])]} "
        f"robotState={after.get('robotState')} programState={after.get('programState')} "
        f"motionDone={after.get('motionDone')}")
    return []


async def handle_cmd(msg, who):
    cmd = msg.get("cmd")
    if cmd == "stop":                            # 제3원칙 — 조종권·신원·phase 무관 항상 실행
        if session["adapter"] is None:
            return {"ok": True, "note": "미연결 — 보낼 곳이 없다"}
        try:
            await asyncio.to_thread(session["adapter"].stop)
            log("stop", f"by={who or '무명'}")
            return {"ok": True}
        except Exception as e:
            fail_closed(f"stop 실패 — {e}")      # 정지가 안 되는 연결은 유지하지 않는다
            return {"ok": False, "reason": f"stop 실패 — {e}"}
    if not who:
        return {"ok": False, "reason": "hello 로 신원을 먼저 묶는다 (stop 은 예외)"}
    if not owner.is_owner(who):
        return {"ok": False, "reason": f"조종권이 없다 — 보유자 {owner.get() or '없음'}"}
    if session["adapter"] is None or not session["armed"]:
        return {"ok": False, "reason": f"ARMED 가 아니다 — phase={current_phase()}"}

    if cmd == "jog":
        joint = msg.get("joint")
        delta = msg.get("deltaDeg")
        if not isinstance(joint, int) or not 0 <= joint <= 5:
            return {"ok": False, "reason": "joint 는 0~5"}
        if not isinstance(delta, (int, float)) or delta != delta:
            return {"ok": False, "reason": "deltaDeg 가 숫자가 아니다"}
        joints = (session["lastState"] or {}).get("jointsDeg")
        if not joints:
            return {"ok": False, "reason": "현재 관절값이 없다 — fail-closed"}
        target = list(joints)
        target[joint] += float(delta)
        reasons = await asyncio.to_thread(_do_motion, target, safety.SPEED_CAP_PCT)
    elif cmd == "moveJ":
        reasons = await asyncio.to_thread(
            _do_motion, msg.get("jointsDeg"), msg.get("speedPct", safety.SPEED_CAP_PCT))
    else:
        return {"ok": False, "reason": f"모르는 cmd — {cmd} (gripper 는 P3)"}
    return {"ok": True} if not reasons else {"ok": False, "reason": " · ".join(reasons)}


@app.websocket("/ws/state")
async def ws_state(ws: WebSocket):
    await ws.accept()
    who = None
    log("ws-open", str(ws.client))

    async def sender():
        # ponytail: 접속마다 snapshot() = 접속마다 read_state(). 실기 다중 접속은 중복 폴링이
        # 된다 — 접속자가 늘면 단일 샘플러 태스크 + 팬아웃으로 승격.
        while True:
            await ws.send_text(json.dumps(await asyncio.to_thread(snapshot)))
            await asyncio.sleep(SAMPLE_MS / 1000)

    send_task = asyncio.create_task(sender())
    try:
        while True:
            try:
                msg = json.loads(await ws.receive_text())
            except json.JSONDecodeError:
                continue
            if msg.get("cmd") == "hello":
                if who:
                    owner.session_close(who)
                who = str(msg.get("who") or "") or None
                if who:
                    owner.session_open(who)
                continue
            res = await handle_cmd(msg, who)
            if not res.get("ok"):
                await ws.send_text(json.dumps(res))
    except WebSocketDisconnect:
        pass
    finally:
        send_task.cancel()
        if who:
            owner.session_close(who)
        log("ws-close", str(ws.client))


@app.on_event("shutdown")
async def _shutdown():
    # 브리지가 죽을 때 CloseRPC 없이 나가면 컨트롤러가 세션을 쥔 채 남아
    # 펜던트 로그인까지 막을 수 있다 (2026-07-31 실측 추정) — 반드시 정리하고 나간다
    if session["adapter"]:
        if session["armed"]:
            _disarm_hw("shutdown")
        try:
            session["adapter"].disconnect()
        except Exception:
            pass
        log("shutdown-disconnect", "세션 정리")


# ── 웹 정적 서빙 — 빌드가 있으면 같은 주소에서 화면을 낸다 (API 라우트가 먼저 매칭된다)
DIST = HERE.parent / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
