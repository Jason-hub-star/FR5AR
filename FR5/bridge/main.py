# fr5-bridge — FAIRINO FR5 의 유일한 관문 (API-CONTRACT.md 가 정본이다. 어긋나면 문서부터 고친다).
# 실행: bash scripts/dev/fr5-dev.sh  (준비물 없음 — 순수 파이썬 SDK · D42)
# P0: profile·observe-only preflight·상태 스트림 · P2: 조종권·arm·guarded jog/stop.
# 배포: npm run build:fr5 뒤 이 서버가 FR5/dist 를 같은 주소에서 서빙한다 —
# 주소를 여는 누구나 조작 후보다 (LAN·팀 신뢰). 보호는 조종권 1명·게이트·stop 상시가 맡는다.
#
# **여기는 조립과 라우트만 둔다** (D54 · tb-bridge 와 같은 모양). 상태와 I/O 는 도메인
# 모듈이 소유한다 — RobotSession(session.py) · Owner(owner.py) · 어댑터(robot_adapter/).
import asyncio
import json
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
from session import RobotSession

HERE = Path(__file__).parent
CONFIG = yaml.safe_load((HERE / "config.yaml").read_text())
PROFILES = {r["robotId"]: r for r in CONFIG["robots"]}
SAMPLE_MS = CONFIG.get("sample_ms", 33)

app = FastAPI(title="fr5-bridge")


def log(event, detail=""):
    # 재연결·fail-closed·명령 기록 — P0~P2 는 stdout. 영속 기록은 P6(History)에서 승격한다
    print(f"[fr5-bridge] {time.strftime('%H:%M:%S')} {event} {detail}", flush=True)


# 연결은 한 번에 하나 — 명령 주인이 한 명이듯 관문의 로봇도 하나다 (하드룰 4)
session = RobotSession(SAMPLE_MS, log)


def _owner_lost(who):
    # 조종권 소실 = 즉시 disarm — 주인 없는 ARMED 를 남기지 않는다
    if session.armed:
        session.disarm_hw(f"조종권 소실({who})")


owner = Owner(_owner_lost, lambda e, d: log(e, d))


def refuse(reasons, status=409):
    return JSONResponse(
        {"ok": False, "phase": session.current_phase(owner.get()), "reasons": reasons},
        status_code=status,
    )


def snapshot():
    return session.snapshot(owner.get())


# ── 프로필·연결 (API-CONTRACT §로봇 프로필과 읽기 전용 사전검증) ─────────────
@app.get("/robots")
async def robots():
    return [
        {"robotId": r["robotId"], "name": r["name"], "model": r["expectedModel"],
         "endpoint": r["endpoint"],
         "lastObserved": session.observedAt
         if session.profile and session.profile["robotId"] == r["robotId"] else None}
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
    if session.adapter is not None:
        return refuse([f"이미 {session.profile['robotId']} 에 연결 — 먼저 disconnect"])

    session.phase, session.failReason = "PREFLIGHT", None
    log("PREFLIGHT", f"robotId={robot_id} endpoint={profile['endpoint']}")
    adapter = make_adapter(profile)

    def _preflight():
        adapter.connect()
        return adapter.get_version(), adapter.read_state()

    try:
        version, state = await asyncio.to_thread(_preflight)
    except Exception as e:
        session.fail_closed(str(e))
        return refuse([str(e)])

    reasons = preflight.check(profile, version, state)
    if reasons:
        try:
            adapter.disconnect()
        except Exception:
            pass
        session.fail_closed(" · ".join(reasons))
        return refuse(reasons)

    session.open(profile, adapter, version, state)
    log("OBSERVE_ONLY", f"robotId={robot_id} sdk={version.get('sdk')}")
    return {"ok": True, "phase": "OBSERVE_ONLY", "reasons": []}


@app.get("/version")
async def version():
    if session.version is None:
        return refuse(["미연결 — 관측된 버전이 없다"])
    v = session.version
    return {"robotId": session.profile["robotId"], "controller": v.get("controller"),
            "servo": v.get("servo"), "end": v.get("end"), "sdk": v.get("sdk"),
            "web": v.get("web"), "observedAt": session.observedAt}


@app.post("/disconnect")
async def disconnect(body: dict | None = None):
    # 주인이 있을 때는 주인만 끊는다 — 남의 실행을 아무나 중단시키면 그것도 사고다.
    # 주인이 없으면 누구나 끊을 수 있다 (observe-only 정리는 막을 이유가 없다).
    holder = owner.get()
    if holder and not owner.is_owner((body or {}).get("who")):
        return refuse([f"조종권이 {holder} 에게 있다 — 먼저 STOP 하거나 주인이 끊는다"], 403)
    await asyncio.to_thread(session.close)
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
    if session.adapter is None:
        return refuse(["미연결"])
    if session.armed:
        return {"ok": True, "phase": session.current_phase(owner.get()), "reasons": []}

    def _arm_seq():
        state = session.read_fresh_state()
        reasons = safety.check_arm(state, time.time() - session.lastStateAt)
        if reasons:
            return reasons
        a = session.adapter
        # 순서는 계약 §2단계 — 서보를 먼저 올린다 (서보 OFF 에선 auto 교정 거부, 유니티 실측)
        a.reset_errors()          # 잠복 fault 해제 — 사람이 현장확인한 arm 안에서만
        try:
            a.enable(True)
        except Exception as e:
            # 실측(2026-07-31): FW Web-3.9.3 이 SDK V1.2.4 의 RobotEnable 만 -4 로 거부한다.
            # 사람이 펜던트에서 서보를 올렸다면 그걸 인정한다 — 실제 상태가 판정한다 (fail-closed 유지)
            if not session.read_fresh_state().get("enabled"):
                raise ConnectionError(
                    f"{e} · 펜던트에서 로봇 Enable(활성화) 후 다시 ARM 하면 이어갈 수 있다")
        # 안전 설정은 서보를 올린 뒤·자동 모드 전에 넣는다 (계약 §로봇 안전 설정 · D53).
        # 컨트롤러 충돌 감지는 기본으로 안 켜져 있고 기본 민감도는 사람 접촉에 반응하지 않는다.
        session.apply_settings()
        a.set_sample_period(SAMPLE_MS)
        a.exit_drag_teach()
        a.set_mode(0)
        return []

    try:
        reasons = await asyncio.to_thread(_arm_seq)
    except Exception as e:
        await asyncio.to_thread(session.disarm_hw, f"arm 실패 — {e}")
        return refuse([f"arm 시퀀스 실패 — {e}"])
    if reasons:
        return refuse(reasons)
    # arm 시퀀스가 도는 동안(수 초) 조종권이 넘어갔을 수 있다 — 그 사이 자동 해제가 돌면
    # armed 가 아직 False 라 _owner_lost 가 아무것도 안 하고, 여기서 주인 없는 ARMED 가 남는다
    if not owner.is_owner(who):
        await asyncio.to_thread(session.disarm_hw, "arm 중 조종권 소실")
        return refuse(["arm 중 조종권을 잃었다 — 다시 잡고 ARM"], 403)
    session.armed = True
    log("ARMED", f"who={who}")
    return {"ok": True, "phase": "ARMED", "reasons": []}


@app.post("/disarm")
async def disarm(body: dict):
    if not owner.is_owner(body.get("who")):
        return refuse(["조종권이 없다"], 403)
    await asyncio.to_thread(session.disarm_hw, f"disarm by {body.get('who')}")
    return {"ok": True, "phase": session.current_phase(owner.get()), "reasons": []}


# ── 상태 (API-CONTRACT §상태값) ──────────────────────────────────────────────
@app.get("/state")
async def state():
    return await asyncio.to_thread(snapshot)


# ── 명령 실행 ────────────────────────────────────────────────────────────────
def _do_motion(target_deg, speed_pct):
    """게이트 → MoveJ. 사유가 있으면 보내지 않는다. (스레드에서 실행)"""
    state = session.read_fresh_state()
    reasons = safety.check_motion(state, time.time() - session.lastStateAt,
                                  target_deg, speed_pct, session.appliedSettings)
    if reasons:
        return reasons
    coord = state.get("coord") or {}
    session.adapter.move_j(target_deg, speed_pct,
                           coord.get("toolId", 0), coord.get("userId", 0))
    log("moveJ", f"target={[round(v, 3) for v in target_deg]} speed={speed_pct}")
    time.sleep(0.25)                     # 컨트롤러가 지령을 등록했는지 — 실기 진단 (2026-07-31)
    after = session.read_fresh_state()
    log("moveJ-after", f"queue={after.get('motionQueueLength')} "
        f"servoTarget={[round(v, 2) for v in (after.get('lastServoTargetDeg') or [])]} "
        f"robotState={after.get('robotState')} programState={after.get('programState')} "
        f"motionDone={after.get('motionDone')}")
    return []


async def handle_cmd(msg, who):
    cmd = msg.get("cmd")
    if cmd == "stop":                            # 제3원칙 — 조종권·신원·phase 무관 항상 실행
        if session.adapter is None:
            return {"ok": True, "note": "미연결 — 보낼 곳이 없다"}
        try:
            await asyncio.to_thread(session.adapter.stop)
            log("stop", f"by={who or '무명'}")
            return {"ok": True}
        except Exception as e:
            session.fail_closed(f"stop 실패 — {e}")   # 정지가 안 되는 연결은 유지하지 않는다
            return {"ok": False, "reason": f"stop 실패 — {e}"}
    if not who:
        return {"ok": False, "reason": "hello 로 신원을 먼저 묶는다 (stop 은 예외)"}
    if not owner.is_owner(who):
        return {"ok": False, "reason": f"조종권이 없다 — 보유자 {owner.get() or '없음'}"}
    if session.adapter is None or not session.armed:
        return {"ok": False,
                "reason": f"ARMED 가 아니다 — phase={session.current_phase(owner.get())}"}

    if cmd == "jog":
        joint = msg.get("joint")
        delta = msg.get("deltaDeg")
        if not isinstance(joint, int) or not 0 <= joint <= 5:
            return {"ok": False, "reason": "joint 는 0~5"}
        if not isinstance(delta, (int, float)) or delta != delta:
            return {"ok": False, "reason": "deltaDeg 가 숫자가 아니다"}
        joints = (session.lastState or {}).get("jointsDeg")
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
    if session.adapter:
        session.close()
        log("shutdown-disconnect", "세션 정리")


# ── 웹 정적 서빙 — 빌드가 있으면 같은 주소에서 화면을 낸다 (API 라우트가 먼저 매칭된다)
DIST = HERE.parent / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
