# fr5-bridge — FAIRINO FR5 의 유일한 관문 (API-CONTRACT.md 가 정본이다. 어긋나면 문서부터 고친다).
# 실행: uv run --with fastapi --with 'uvicorn[standard]' --with pyyaml uvicorn main:app --host 0.0.0.0 --port 5055
# P0 범위: robot profile · observe-only preflight · 상태 스트림. 명령·조종권은 P2 에서 얹는다.
import asyncio
import json
import time
from pathlib import Path

import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

import preflight
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
}


def log(event, detail=""):
    # 재연결·fail-closed 기록 — P0 은 stdout. 영속 기록은 P6(History)에서 승격한다
    print(f"[fr5-bridge] {time.strftime('%H:%M:%S')} {event} {detail}", flush=True)


def refuse(reasons, status=409):
    return JSONResponse(
        {"ok": False, "phase": session["phase"], "reasons": reasons}, status_code=status
    )


def fail_closed(reason):
    if session["adapter"]:
        try:
            session["adapter"].disconnect()
        except Exception:
            pass
    session.update(profile=None, adapter=None, phase="FAIL_CLOSED", failReason=reason)
    log("FAIL_CLOSED", reason)


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
        "owner": None,
        "phase": session["phase"], "failReason": session["failReason"],
    }
    if session["adapter"] is None:
        return base
    try:
        state = session["adapter"].read_state()
    except Exception as e:                      # 읽기 실패 = 연결 손실 — fail-closed (계약 §안전)
        fail_closed(f"상태 읽기 실패 — {e}")
        base.update(phase="FAIL_CLOSED", failReason=session["failReason"])
        return base
    base.update(state)
    base.update(robotId=session["profile"]["robotId"], connected=True)
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
        return refuse(["명령 승격은 조종권·안전 게이트 뒤다 — P0 은 observe-only 만 받는다"])
    if session["adapter"] is not None:
        return refuse([f"이미 {session['profile']['robotId']} 에 연결 — 먼저 disconnect"])

    session.update(phase="PREFLIGHT", failReason=None)
    log("PREFLIGHT", f"robotId={robot_id} endpoint={profile['endpoint']}")
    adapter = make_adapter(profile)
    try:
        adapter.connect()
        version = adapter.get_version()
        state = adapter.read_state()
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
                   version=version, observedAt=time.time())
    log("OBSERVE_ONLY", f"robotId={robot_id} model={version['model']}")
    return {"ok": True, "phase": "OBSERVE_ONLY", "reasons": []}


@app.get("/version")
async def version():
    if session["version"] is None:
        return refuse(["미연결 — 관측된 버전이 없다"])
    v = session["version"]
    return {"robotId": session["profile"]["robotId"], "controller": v["controller"],
            "servo": v["servo"], "end": v.get("end"), "sdk": v["sdk"],
            "web": v.get("web"), "observedAt": session["observedAt"]}


@app.post("/disconnect")
async def disconnect():
    if session["adapter"]:
        try:
            session["adapter"].disconnect()
        except Exception:
            pass
        log("DISCONNECTED", session["profile"]["robotId"])
    session.update(profile=None, adapter=None, phase="DISCONNECTED",
                   failReason=None, version=None)
    return {"ok": True, "phase": "DISCONNECTED", "reasons": []}


# ── 상태 (API-CONTRACT §상태값) ──────────────────────────────────────────────
@app.get("/state")
async def state():
    return snapshot()


@app.websocket("/ws/state")
async def ws_state(ws: WebSocket):
    await ws.accept()
    log("ws-open", str(ws.client))

    async def sender():
        # ponytail: 접속마다 snapshot() = 접속마다 read_state(). mock 은 무해하지만 실기 SDK 는
        # 다중 접속 시 중복 폴링이 된다 — V0 실기 어댑터 때 단일 샘플러 태스크 + 팬아웃으로 승격.
        while True:
            await ws.send_text(json.dumps(snapshot()))
            await asyncio.sleep(SAMPLE_MS / 1000)

    send_task = asyncio.create_task(sender())
    try:
        while True:
            await ws.receive_text()             # P0 은 수신 명령 없음 — 끊김 감지용
    except WebSocketDisconnect:
        pass
    finally:
        send_task.cancel()
        log("ws-close", str(ws.client))
