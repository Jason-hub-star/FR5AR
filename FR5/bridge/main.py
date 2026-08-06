# fr5-bridge — FAIRINO FR5 의 유일한 관문 (API-CONTRACT.md 가 정본이다. 어긋나면 문서부터 고친다).
# 실행: bash scripts/dev/fr5-dev.sh  (준비물 없음 — 순수 파이썬 SDK · D42)
# 배포: npm run build:fr5 뒤 이 서버가 FR5/dist 를 같은 주소에서 서빙한다 —
# 주소를 여는 누구나 조작 후보다 (LAN·팀 신뢰). 보호는 조종권 1명·게이트·stop 상시가 맡는다.
#
# **여기는 조립과 라우트만 둔다** (D54 · tb-bridge 와 같은 모양 — 라우터를 안 쓴다).
# 상태와 I/O 는 도메인 모듈이 소유한다 — RobotSession(session) · Owner(owner) ·
# Commands(commands) · TeachService(teach) · 어댑터(robot_adapter/).
import asyncio
import json
import os
import time
from pathlib import Path

import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import preflight
import safety
from commands import GRIPPER_FORCE_PCT, Commands
from owner import Owner
from robot_adapter import make_adapter
from session import RobotSession
from slots import SlotStore
from teach import TeachService, frame_mismatch, run_recording

HERE = Path(__file__).parent
CONFIG = yaml.safe_load((HERE / "config.yaml").read_text())
PROFILES = {r["robotId"]: r for r in CONFIG["robots"]}
SAMPLE_MS = CONFIG.get("sample_ms", 33)
# 검증이 사람의 진짜 데이터에 쓰지 않게 env 로 갈아 끼운다 (`FR5_DATA_DIR`).
# 운영에서는 안 쓴다 — 정본은 config.yaml 이다.
DATA_DIR = Path(os.environ.get("FR5_DATA_DIR") or CONFIG.get("data_dir", "~/fr5-data")).expanduser()
# 녹화 주기는 **폴링 주기의 절반**이다 (33ms 폴링 → 15fps). 같은 속도로 적으면 결손이
# 필연이다 — 상태 스트림 실측이 27Hz 남짓이라 30fps 격자에는 빈 칸이 생기고(검증에서 3칸),
# 그러면 `measure` 궤적이 전부 비교에서 빠진다. 표본보다 성기게 적어야 `fps` 가 참이 된다.
REC_FPS = max(1, round(1000 / SAMPLE_MS / 2))

app = FastAPI(title="fr5-bridge")


def log(event, detail=""):
    # 재연결·fail-closed·명령 기록 — stdout. 영속 기록은 사다리 4(History)에서 승격한다
    print(f"[fr5-bridge] {time.strftime('%H:%M:%S')} {event} {detail}", flush=True)


# 연결은 한 번에 하나 — 명령 주인이 한 명이듯 관문의 로봇도 하나다 (하드룰 4)
session = RobotSession(SAMPLE_MS, log)
cmds = Commands(session, log)
teach = TeachService(DATA_DIR, REC_FPS, log)
slots = SlotStore(DATA_DIR)
recordTask = None


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


def owner_gate(body):
    """조종권 확인. 통과하면 None, 아니면 거부 응답. **쓰기만 조종권** — 읽기는 누구나 (D44)."""
    b = body or {}
    if not owner.is_owner(b.get("who"), b.get("token")):
        return refuse([f"조종권이 없다 — 보유자 {owner.get() or '없음'}"], 403)
    return None


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
    await stop_recording("disconnect")     # 안 닫으면 프레임을 다 적고도 파일이 안 남는다
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

    try:
        reasons = await asyncio.to_thread(cmds.arm_sequence, SAMPLE_MS)
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


# ── Teach — 지점과 궤적 (API-CONTRACT §이동 지점 · §궤적 녹화 · D74) ──────────
@app.get("/points")
async def points_list():
    return await asyncio.to_thread(teach.points.list)


@app.post("/points")
async def points_capture(body: dict):
    if (bad := owner_gate(body)) is not None:
        return bad
    state, reasons = await asyncio.to_thread(session.fresh_state)
    if reasons:
        return refuse(reasons)
    point, reasons = await asyncio.to_thread(
        teach.points.capture, body.get("name"), state, (session.profile or {}).get("robotId"))
    if reasons:
        return refuse(reasons)
    log("point-capture", f"{point['name']} joints={[round(v, 2) for v in point['jointsDeg']]}")
    return {"ok": True, "point": point, "reasons": []}


@app.delete("/points/{name}")
async def points_delete(name: str, body: dict | None = None):
    if (bad := owner_gate(body)) is not None:
        return bad
    # 사다리 3 이 이 훅을 채웠다 — 참조하는 슬롯이 있으면 지우지 않는다 (감사 P1)
    refs = await asyncio.to_thread(slots.refs_to_point, name)
    ok, blocked = await asyncio.to_thread(teach.points.delete, name, refs)
    if blocked:
        return refuse([f"참조하는 슬롯이 있다 — {', '.join(blocked)}"], 409)
    if not ok:
        return refuse([f"없는 지점 — {name}"], 404)
    log("point-delete", name)
    return {"ok": True, "reasons": []}


async def goto_point(name):
    """지점으로 이동. **`moveJ` 로 번역해 같은 게이트를 처음부터 다시 태운다** —
    실기 명령 허용목록에 새 이름을 더하지 않는다 (VISION-CONTRACT 의 제안과 같은 규약).

    반환: `(사유목록, 상태코드)`. 비면 보냈다. **슬롯 실행도 이 함수를 지난다** —
    복붙하면 한쪽만 고쳐진다 (계약 `PROGRAM-CONTRACT.md` §step 4번).
    """
    point = await asyncio.to_thread(teach.points.get, name)
    if not point:
        return [f"없는 지점 — {name}"], 404
    here = (session.profile or {}).get("robotId")
    if point.get("capturedRobotId") != here:
        return [f"다른 개체에서 잰 지점이다 — {point.get('capturedRobotId')} · 지금 {here}"], 409
    reasons = frame_mismatch(point, (session.lastState or {}).get("coord"))
    if reasons:
        return reasons, 409
    # **경로를 먼저 훑는다** (D75) — 조그용 5° 상한을 빼는 대신 가는 길을 검사한다
    reasons = await asyncio.to_thread(cmds.motion, point["jointsDeg"], safety.SPEED_CAP_PCT, True)
    return reasons, 409


@app.post("/points/{name}/goto")
async def points_goto(name: str, body: dict):
    if (bad := owner_gate(body)) is not None:
        return bad
    if not session.armed:
        return refuse([f"ARMED 가 아니다 — phase={session.current_phase(owner.get())}"])
    reasons, code = await goto_point(name)
    if reasons:
        return refuse(reasons, code)
    return {"ok": True, "phase": session.current_phase(owner.get()), "reasons": []}


@app.get("/trajectories")
async def traj_list():
    return await asyncio.to_thread(teach.trajectories.list)


@app.get("/trajectories/{name}")
async def traj_get(name: str):
    traj = await asyncio.to_thread(teach.trajectories.get, name)
    return traj if traj else refuse([f"없는 궤적 — {name}"], 404)


def _read_for_record():
    """녹화 루프가 쓰는 읽기. **미연결이면 None** — 루프가 그걸로 끝을 판정한다."""
    return session.read_fresh_state() if session.adapter is not None else None


async def stop_recording(reason):
    """녹화를 닫는다. 중이 아니면 None — 두 번 불려도 안전하다."""
    global recordTask
    if recordTask:
        recordTask.cancel()
        recordTask = None
    return await asyncio.to_thread(teach.finish, reason)


@app.post("/trajectories/start")
async def traj_start(body: dict):
    global recordTask
    if (bad := owner_gate(body)) is not None:
        return bad
    st, reasons = await asyncio.to_thread(session.fresh_state)
    if reasons:
        return refuse(reasons)
    started, reasons = await asyncio.to_thread(
        teach.start, body.get("name"), body.get("purpose"), body.get("source"), session.stamp(GRIPPER_FORCE_PCT), st)
    if reasons:
        return refuse(reasons)
    recordTask = asyncio.create_task(
        run_recording(teach, _read_for_record, 1.0 / REC_FPS))
    return {"ok": True, **started, "reasons": []}


@app.post("/trajectories/stop")
async def traj_stop(body: dict):
    if (bad := owner_gate(body)) is not None:
        return bad
    name = teach.recording
    if not name:
        return refuse(["녹화 중이 아니다"])
    # 루프가 먼저 닫았을 수도 있다(상한·비상정지) — 그때는 저장된 것을 읽어 돌려준다
    traj = await stop_recording("done") or await asyncio.to_thread(teach.trajectories.get, name)
    if not traj:
        return refuse(["녹화를 저장하지 못했다"])
    return {"ok": True, "trajectory": TeachService.summary(traj), "reasons": []}


# ── 프로그램 슬롯 (PROGRAM-CONTRACT.md · 사다리 3) ───────────────────────────
def session_identity():
    """승인 당시와 지금을 대조할 정체. 슬롯은 이 셋이 다르면 실행하지 않는다."""
    coord = (session.lastState or {}).get("coord") or {}
    return {"robotId": (session.profile or {}).get("robotId"),
            "toolId": coord.get("toolId"), "userId": coord.get("userId"),
            "firmware": (session.version or {}).get("controller")}


@app.get("/slots")
async def slots_list():
    return await asyncio.to_thread(slots.list)


@app.post("/slots")
async def slots_save(body: dict):
    """만들거나 덮어쓴다. **항상 draft 로 돌아간다** — 목록이 바뀌면 옛 승인은 다른 프로그램의 승인이다."""
    if (bad := owner_gate(body)) is not None:
        return bad
    known = {p["name"] for p in await asyncio.to_thread(teach.points.list)}
    slot, reasons = await asyncio.to_thread(
        slots.save, body.get("name"), body.get("steps"), known)
    if reasons:
        return refuse(reasons)
    log("slot-save", f"{slot['name']} 단계={len(slot['steps'])}")
    return {"ok": True, "slot": slot, "reasons": []}


@app.delete("/slots/{name}")
async def slots_delete(name: str, body: dict | None = None):
    if (bad := owner_gate(body)) is not None:
        return bad
    if not await asyncio.to_thread(slots.delete, name):
        return refuse([f"없는 슬롯 — {name}"], 404)
    log("slot-delete", name)
    return {"ok": True, "reasons": []}


@app.post("/slots/{name}/approve")
async def slots_approve(name: str, body: dict):
    """**로봇을 움직이지 않는다** — 그래서 ARMED 를 요구하지 않는다.
    `arm` 과 같은 현장확인 관문을 지난다 (계획 §확인 절차는 한 모양으로)."""
    if (bad := owner_gate(body)) is not None:
        return bad
    if body.get("confirm") != "현장확인":
        return refuse(["현장확인이 없다 — 승인하면 이 목록이 실기에서 실행된다"])
    # **정체를 못 박으면 승인하지 않는다.** 미연결이면 tool/user 가 None 으로 박히고,
    # 나중에 연결해 실행할 때 전부 불일치가 돼 그 승인이 영영 안 먹는다 (제1원칙)
    ident = session_identity()
    if any(ident.get(k) is None for k in ("robotId", "toolId", "userId")):
        return refuse([f"연결하고 상태를 읽은 뒤에 승인한다 — 지금 정체를 못 박는다 {ident}"])
    slot, reasons = await asyncio.to_thread(
        slots.approve, name, body.get("who"), ident)
    if reasons:
        return refuse(reasons, 404)
    log("slot-approve", f"{name} by={body.get('who')} 정체={slot['approvedWith']}")
    return {"ok": True, "slot": slot, "reasons": []}


@app.post("/slots/{name}/step")
async def slots_step(name: str, body: dict):
    """**한 요청이 한 단계다.** 서버는 "다음 단계" 를 모른다 — 화면이 몇 번째인지 보낸다.
    그래서 중단해도 재개할 상태가 없고, 처음부터 다시 도는 사고도 구조적으로 없다 (D78)."""
    if (bad := owner_gate(body)) is not None:
        return bad
    # ARMED 를 여기서 명시적으로 본다 — 안쪽 게이트가 어차피 막지만, 사유가 phase 로 나와야
    # 화면이 "ARM 하세요" 를 말할 수 있다 (계약 §step 0번)
    if not session.armed:
        return refuse([f"ARMED 가 아니다 — phase={session.current_phase(owner.get())}"])
    point_name, reasons = await asyncio.to_thread(
        slots.step_target, name, body.get("index"), session_identity())
    if reasons:
        return refuse(reasons)
    reasons, code = await goto_point(point_name)      # goto 와 **같은 함수** — 게이트 전부 다시 탄다
    if reasons:
        return refuse(reasons, code)
    log("slot-step", f"{name}[{body.get('index')}] → {point_name}")
    return {"ok": True, "pointName": point_name,
            "phase": session.current_phase(owner.get()), "reasons": []}


# ── 명령 (API-CONTRACT §명령) — 실기에 닿는 이름은 다섯뿐이다 ────────────────
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
        reasons = await asyncio.to_thread(cmds.mode, msg.get("manual"))
        return {"ok": True} if not reasons else {"ok": False, "reason": " · ".join(reasons)}
    if not session.armed:
        return {"ok": False,
                "reason": f"ARMED 가 아니다 — phase={session.current_phase(owner.get())}"}

    if cmd == "jog":
        reasons = await asyncio.to_thread(cmds.jog, msg.get("joint"), msg.get("deltaDeg"))
    elif cmd == "moveJ":
        reasons = await asyncio.to_thread(
            cmds.motion, msg.get("jointsDeg"), msg.get("speedPct", safety.SPEED_CAP_PCT))
    elif cmd == "gripper":
        pct = msg.get("pct")
        if pct is None and isinstance(msg.get("open"), bool):
            pct = 100.0 if msg["open"] else 0.0     # open 은 pct 의 별칭 (계약 §그리퍼)
        reasons = await asyncio.to_thread(cmds.gripper, pct)
    elif cmd == "gripperActivate":
        reasons = await asyncio.to_thread(cmds.gripper_activate)
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
    await stop_recording("disconnect")
    if session.adapter:
        session.close()
        log("shutdown-disconnect", "세션 정리")


# ── 웹 정적 서빙 — 빌드가 있으면 같은 주소에서 화면을 낸다 (API 라우트가 먼저 매칭된다)
DIST = HERE.parent / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
