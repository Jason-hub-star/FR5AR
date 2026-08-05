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
# 그리퍼 속도·힘은 화면이 못 정한다 — 보수적 기본값을 서버가 박는다 (GOAL-live-gripper §3).
# 파지 실험으로 힘을 올리려면 여기 한 곳만 고친다. 천장: 물체별 힘 프로필은 이 골 밖이다.
# 기구학과 상태 스트림이 같은 좌표계인지 대조할 때의 허용 오차. 같은 로봇의 같은 관절이라
# 원래 0 이어야 하고, 5mm 는 반올림·표본 시차만 덮는 값이다 (계약 §작업영역)
FK_FRAME_TOL_MM = 5.0
GRIPPER_VEL_PCT = 30.0
GRIPPER_FORCE_PCT = 30.0

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
    b = body or {}
    if holder and not owner.is_owner(b.get("who"), b.get("token")):
        return refuse([f"조종권이 {holder} 에게 있다 — 먼저 STOP 하거나 주인이 끊는다"], 403)
    await asyncio.to_thread(session.close)
    return {"ok": True, "phase": "DISCONNECTED", "reasons": []}


# ── 조종권 (API-CONTRACT §조종권) ────────────────────────────────────────────
@app.post("/owner/claim")
async def owner_claim(body: dict):
    okey, result = owner.claim(body.get("who"))
    # 토큰이 조종권을 증명한다 — 이름은 화면 표시용이다 (D55 · 계약 §조종권)
    return {"ok": True, "owner": owner.get(), "token": result} if okey \
        else refuse([result], 409)


@app.post("/owner/release")
async def owner_release(body: dict):
    okey, reason = owner.release(body.get("who"), body.get("token"))
    return {"ok": True, "owner": None} if okey else refuse([reason], 409)


# ── 명령 승격 (API-CONTRACT §명령 승격 — D41) ────────────────────────────────
@app.post("/arm")
async def arm(body: dict):
    who, token = body.get("who"), body.get("token")
    if body.get("confirm") != "현장확인":
        return refuse(['confirm: "현장확인" 이 없다 — 현장에 사람이 있음을 명시해야 한다'], 403)
    if not owner.is_owner(who, token):
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
        # 작업영역은 **기구학이 스트림과 같은 좌표계일 때만** 참이다. 그 가정을 여기서
        # 실제로 대조한다 — 같은 관절을 FK 에 넣어 스트림의 손끝과 맞는지 본다.
        # 어긋나면 등재된 숫자가 다른 자리를 가리키므로 arm 을 거부한다 (D64 계열).
        if session.workspace:
            st = session.read_fresh_state() or {}
            fk = a.forward_kin(st.get("jointsDeg") or [])
            tcp = st.get("tcpMmDeg") or []
            if not fk or len(tcp) < 3:
                return ["작업영역 게이트를 켤 수 없다 — 기구학을 못 구했다 (제1원칙)"]
            gap = max(abs(fk[i] - tcp[i]) for i in range(3))
            log("작업영역", f"기구학↔스트림 최대차 {gap:.1f}mm · fk={[round(v,1) for v in fk[:3]]}")
            if gap > FK_FRAME_TOL_MM:
                return [f"기구학과 상태 스트림의 좌표계가 다르다 — 최대차 {gap:.1f}mm "
                        f"(> {FK_FRAME_TOL_MM}mm). 작업영역 값이 거짓이 된다"]
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
    if not owner.is_owner(who, token):
        await asyncio.to_thread(session.disarm_hw, "arm 중 조종권 소실")
        return refuse(["arm 중 조종권을 잃었다 — 다시 잡고 ARM"], 403)
    session.armed = True
    log("ARMED", f"who={who}")
    return {"ok": True, "phase": "ARMED", "reasons": []}


@app.post("/disarm")
async def disarm(body: dict):
    if not owner.is_owner(body.get("who"), body.get("token")):
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
    # 조건 12 의 카테시안 절반 — 관절 한계만으로는 손끝이 상판을 뚫는 것을 못 막는다.
    # 목표 관절을 **로봇 자신의 기구학**으로 손끝 위치로 바꿔 판정한다 (계약 §작업영역)
    ws = session.workspace
    if ws:
        tcp = session.adapter.forward_kin(target_deg)
        reasons = safety.check_workspace(tcp, ws, coord)
        if reasons:
            log("작업영역-거부", " · ".join(reasons))
            return reasons
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


def _do_gripper(pct):
    """게이트 → MoveGripper. 관절 게이트가 아니라 그리퍼 전용을 탄다 (계약 §그리퍼)."""
    state = session.read_fresh_state()
    reasons = safety.check_gripper(state, time.time() - session.lastStateAt,
                                   pct, session.appliedSettings)
    if reasons:
        log("gripper-거부", " · ".join(reasons))   # 거부를 조용히 버리면 원인을 못 찾는다
        return reasons
    session.adapter.gripper_move(float(pct), GRIPPER_VEL_PCT, GRIPPER_FORCE_PCT)
    # 되던 모양으로 되돌렸다 (2026-08-04) — 명령 뒤 8초짜리 조밀 폴링을 걷어낸다.
    # 그 폴링은 read_state 마다 IsInDragTeach(xmlrpc) 를 태워 **이동 중에** 단일 연결을
    # 50번 두드렸다. 20003 은 연결이 하나뿐이고 행에 약하다 (fairino.py _guard 주석).
    # 정착값은 다음 상태 스트림이 어차피 싣는다 — 명령 경로에서 캐낼 이유가 없다.
    log("gripper", f"지령={pct} vel={GRIPPER_VEL_PCT} force={GRIPPER_FORCE_PCT}")
    return []


def _do_gripper_activate():
    """활성화 — 손가락이 실제로 움직인다. 이동 게이트와 같은 안전 확인을 지나되
    pct 판정은 없다 (아직 지령이 없다)."""
    state = session.read_fresh_state()
    reasons = safety.check_gripper(state, time.time() - session.lastStateAt,
                                   0, session.appliedSettings)
    # 활성화 자체가 active 를 만드는 것이므로 '활성화 안 됨' 은 사유에서 뺀다
    reasons = [r for r in reasons if "활성화되지 않았다" not in r]
    if reasons:
        return reasons
    diag = session.adapter.gripper_activate()
    time.sleep(0.5)                      # 활성화는 원점을 잡는 물리 동작 — 비트가 서기까지 한 번만 본다
    after = (session.read_fresh_state() or {}).get("gripper") or {}
    log("gripper-activate", f"config={diag} → activeRaw={after.get('activeRaw')} "
        f"faultRaw={after.get('faultRaw')} pctRaw={after.get('pctRaw')}")
    return []


def _do_mode(manual):
    """모드 전환 — **로봇을 움직이지 않는다.** 수동으로 바꾸면 펜던트가 조작·드래그
    티칭을 할 수 있고, 자동으로 되돌리면 우리 jog/moveJ 가 가능해진다 (계약 §모드 전환)."""
    state = session.read_fresh_state()
    reasons = safety.check_mode(state, time.time() - session.lastStateAt, manual)
    if reasons:
        log("mode-거부", " · ".join(reasons))
        return reasons
    session.adapter.set_mode(1 if manual else 0)
    log("mode", f"{'수동 — 펜던트가 조작한다' if manual else '자동 — 우리가 조작한다'}")
    return []


async def handle_cmd(msg, who, token):
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
    if not owner.is_owner(who, token):
        return {"ok": False, "reason": f"조종권이 없다 — 보유자 {owner.get() or '없음'}"}
    if session.adapter is None:
        return {"ok": False, "reason": "로봇에 연결돼 있지 않다"}
    # mode 는 ARMED 전·후 어디서나 받는다 — 드래그 티칭은 서보가 켜져 있어야 되므로
    # ARM 을 풀게 만들면 잠긴 상태를 못 푼다 (계약 §모드 전환)
    if cmd == "mode":
        reasons = await asyncio.to_thread(_do_mode, msg.get("manual"))
        return {"ok": True} if not reasons else {"ok": False, "reason": " · ".join(reasons)}
    if not session.armed:
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
    elif cmd == "gripper":
        pct = msg.get("pct")
        if pct is None and isinstance(msg.get("open"), bool):
            pct = 100.0 if msg["open"] else 0.0     # open 은 pct 의 별칭 (계약 §그리퍼)
        reasons = await asyncio.to_thread(_do_gripper, pct)
    elif cmd == "gripperActivate":
        reasons = await asyncio.to_thread(_do_gripper_activate)
    else:
        return {"ok": False, "reason": f"모르는 cmd — {cmd}"}
    return {"ok": True} if not reasons else {"ok": False, "reason": " · ".join(reasons)}


@app.websocket("/ws/state")
async def ws_state(ws: WebSocket):
    await ws.accept()
    who = None
    token = None
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
                # 이름은 표시용, 토큰이 조종권을 증명한다 (D55)
                if who:
                    owner.session_close(who)
                who = str(msg.get("who") or "") or None
                token = msg.get("token")
                if who:
                    owner.session_open(who)
                continue
            res = await handle_cmd(msg, who, token)
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
