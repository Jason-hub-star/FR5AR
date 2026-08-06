# tb-bridge — 터틀봇의 유일한 관문 (TB-CONTRACT.md 가 정본이다. 어긋나면 문서부터 고친다).
# 실행: uv run --with fastapi --with uvicorn --with pyyaml uvicorn main:app --host 0.0.0.0 --port 5055
import asyncio
import json
import shutil
import time
from pathlib import Path

import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

import map_image

import safety
import slots as slot_scan
from log_stream import LogStream
from maps import MapStore
from owner import OwnerRegistry
from process_runner import ProcessRunner
from ros_adapter import make_adapter
from runs import RunStore

HERE = Path(__file__).parent
CONFIG = yaml.safe_load((HERE / "config.yaml").read_text())
ROBOT_IDS = [r["id"] for r in CONFIG["robots"]]

logs = LogStream()
adapter, ADAPTER_KIND = make_adapter(ROBOT_IDS, logs.emit)
runs = RunStore(logs.emit)
maps = MapStore()
owners = OwnerRegistry(ROBOT_IDS, lambda robot, who: adapter.patch(robot, owner=who), logs.emit)


def _slot_exited(robot, run_id, result):
    # 어떤 이유로든 프로세스가 죽으면 — 브리지가 정지를 보장한다 (감사 R1)
    adapter.stop(robot)
    adapter.patch(robot, activeSlot=None, activeRunId=None)
    runs.end(run_id, result)


procs = ProcessRunner(logs.emit, _slot_exited)

# 기동 한 줄을 버퍼에 남긴다. 없으면 갓 뜬 브리지의 로그 패널이 **빈 채로 열려**, 보는 사람이
# "로그가 안 오나" 와 "아직 아무 일도 없었나" 를 못 가른다 (2026-08-06). 계약 §로그의
# "새 접속에 백로그 먼저" 도 버퍼가 비면 줄 게 없다. adapter 종류를 여기 남기면 나중에
# 기록을 되짚을 때 **그 세션이 mock 이었는지 실기였는지**가 로그만으로 판별된다 (SR_24).
logs.emit("—", "bridge", "info",
          f"tb-bridge 기동 · adapter={ADAPTER_KIND} · 로봇 {', '.join(ROBOT_IDS)}")

app = FastAPI(title="tb-bridge")


def ok(**extra):
    return {"ok": True, **extra}


def refuse(reason, status=400):
    return JSONResponse({"ok": False, "reason": reason}, status_code=status)


def snapshot():
    return {"t": time.time(), "adapter": ADAPTER_KIND, "robots": adapter.robots()}


# ── WebSocket /ws/state — 상태 브로드캐스트 + hello·teleop·estop ────────────
@app.websocket("/ws/state")
async def ws_state(ws: WebSocket):
    await ws.accept()
    who = None

    async def sender():
        while True:
            await ws.send_text(json.dumps(snapshot()))
            await asyncio.sleep(0.1)                      # 100ms 목표 (계약)

    send_task = asyncio.create_task(sender())
    try:
        while True:
            msg = json.loads(await ws.receive_text())
            cmd = msg.get("cmd")
            if cmd == "estop":                            # 신원·조종권 무관 항상 통과
                do_estop(msg.get("robot"))
                continue
            if cmd == "hello":
                if who:
                    owners.session_close(who)
                who = str(msg.get("who") or "")
                owners.session_open(who)
                continue
            if not who:                                   # hello 없는 세션 — estop 빼고 거부
                await ws.send_text(json.dumps({"ok": False, "reason": "hello 로 신원을 먼저 묶어요"}))
                continue
            if cmd == "teleop":
                robot = msg.get("robot")
                if robot not in ROBOT_IDS:
                    continue
                res = do_teleop(robot, msg.get("linearMmS"), msg.get("angularDegS"), who)
                if not res["ok"]:
                    await ws.send_text(json.dumps(res))
    except WebSocketDisconnect:
        pass
    finally:
        send_task.cancel()
        if who:
            owners.session_close(who)


def do_teleop(robot, linear, angular, who):
    if not owners.is_owner(robot, who):
        return {"ok": False, "reason": "조종권이 없어요"}
    mode = adapter.robots()[robot]["mode"]
    if mode not in ("idle", "teleop", "mapping"):         # 전이 규칙 — mapping 은 예외 수락
        return {"ok": False, "reason": f"mode={mode} — teleop 거부"}
    reason = safety.check_teleop(linear, angular)
    if reason:
        return {"ok": False, "reason": reason}
    adapter.set_velocity(robot, linear, angular)
    return {"ok": True}


def do_estop(robot=None):
    targets = [robot] if robot in ROBOT_IDS else ROBOT_IDS
    for rid in targets:
        logs.emit(rid, "bridge", "warn", "E-STOP — 즉시 정지 + 슬롯 종료 (owner 유지)")
        if not procs.stop(rid, reason="estop"):
            adapter.stop(rid)                             # 슬롯 없으면 즉시. 있으면 exit 콜백이 정지


@app.websocket("/ws/logs")
async def ws_logs(ws: WebSocket):
    await ws.accept()
    queue = asyncio.Queue()
    logs.subscribe(queue)
    try:
        while True:
            await ws.send_text(json.dumps(await queue.get()))
    except WebSocketDisconnect:
        pass
    finally:
        logs.unsubscribe(queue)


# ── 조종권 ──────────────────────────────────────────────────────────────────
@app.post("/api/owner/claim")
async def owner_claim(body: dict):
    okey, reason = owners.claim(body.get("robot"), body.get("who"))
    return ok() if okey else refuse(reason, 409)


@app.post("/api/owner/release")
async def owner_release(body: dict):
    okey, reason = owners.release(body.get("robot"), body.get("who"))
    return ok() if okey else refuse(reason, 409)


# ── 슬롯 ────────────────────────────────────────────────────────────────────
@app.get("/api/slots")
async def get_slots():
    return slot_scan.list_slots()


@app.post("/api/slots/{name}/start")
async def start_slot(name: str, body: dict):
    robot, who = body.get("robot"), body.get("who")
    if safety.check_name(name):
        return refuse(safety.check_name(name))
    if robot not in ROBOT_IDS:
        return refuse("없는 로봇")
    if not owners.is_owner(robot, who):
        return refuse("조종권이 없어요", 403)
    if adapter.robots()[robot]["mode"] != "idle":
        return refuse(f"mode={adapter.robots()[robot]['mode']} — 시작은 idle 에서만 (TB-CONTRACT §모드 전이)")
    f = slot_scan.slot_file(name)
    if not f:
        return refuse("없는 슬롯", 404)
    params = body.get("params") or {}
    if len(json.dumps(params)) > safety.PARAMS_MAX:
        return refuse("params 4KB 상한 초과")
    active_map = adapter.robots()[robot]["activeMap"]
    run = runs.create(robot, active_map, name, params)
    adapter.patch(robot, mode="slot", activeSlot=name, activeRunId=run["id"])
    procs.start(robot, name, f, run["id"], maps.yaml_path(active_map) if active_map else "", params)
    return JSONResponse(ok(runId=run["id"]), status_code=202)   # spawn 성공만 뜻한다 (계약)


@app.post("/api/robots/{robot}/stop")
async def stop_robot(robot: str):
    if robot not in ROBOT_IDS:
        return refuse("없는 로봇")
    if not procs.stop(robot, reason="stopped"):
        adapter.stop(robot)
    return ok()


# ── 맵·매핑 ─────────────────────────────────────────────────────────────────
@app.get("/api/maps")
async def get_maps():
    return maps.list()


@app.post("/api/maps/{name}/activate")
async def activate_map(name: str, body: dict):
    robot = body.get("robot")
    if robot not in ROBOT_IDS or not maps.exists(name):
        return refuse("없는 로봇 또는 맵", 404)
    adapter.patch(robot, nav="starting")
    adapter.set_active_map(robot, name)

    async def settle():                                   # 재기동은 비동기 — nav 필드로 본다 (감사 O1)
        await asyncio.sleep(1.0)
        adapter.patch(robot, nav="running")
        logs.emit(robot, "nav", "info", f"map activate — {name} · AMCL 재기동")
    asyncio.get_event_loop().create_task(settle())
    return JSONResponse(ok(), status_code=202)


@app.get("/api/maps/live.png")
async def live_png(robot: str):
    if robot not in ROBOT_IDS:
        return refuse("없는 로봇", 404)
    r = adapter.robots()[robot]
    png = map_image.render(adapter.trail(robot), r["pose"])
    return Response(png, media_type="image/png", headers={"Cache-Control": "no-store"})


@app.patch("/api/maps/{name}")
async def patch_map(name: str, body: dict):
    meta = maps.patch(name, body.get("mapToLab") or {})
    return meta if meta else refuse("없는 맵", 404)


@app.post("/api/mapping/start")
async def mapping_start(body: dict):
    robot, who = body.get("robot"), body.get("who")
    if not owners.is_owner(robot, who):
        return refuse("조종권이 없어요", 403)
    if adapter.robots()[robot]["mode"] != "idle":
        return refuse(f"mode={adapter.robots()[robot]['mode']} — 시작은 idle 에서만")
    adapter.patch(robot, mode="mapping", nav="starting", _trail=[])   # 새 맵 — 탐색 흔적 리셋

    async def settle():
        await asyncio.sleep(0.8)
        adapter.patch(robot, nav="running")
        logs.emit(robot, "nav", "info", "SLAM 기동 (mock)")
    asyncio.get_event_loop().create_task(settle())
    logs.emit(robot, "bridge", "info", "mapping start")
    return JSONResponse(ok(), status_code=202)


@app.post("/api/mapping/save")
async def mapping_save(body: dict):
    robot, name = body.get("robot"), body.get("name")
    if safety.check_name(name):
        return refuse(safety.check_name(name))
    if adapter.robots()[robot]["mode"] != "mapping":
        return refuse("매핑 중이 아니에요")
    meta = maps.save(name)
    adapter.stop(robot)
    adapter.set_active_map(robot, name)
    logs.emit(robot, "bridge", "info", f"map saved — {name}")
    return ok(map=meta)


@app.post("/api/mapping/stop")
async def mapping_stop(body: dict):
    robot = body.get("robot")
    if adapter.robots()[robot]["mode"] != "mapping":
        return refuse("매핑 중이 아니에요")
    adapter.stop(robot)
    logs.emit(robot, "bridge", "info", "mapping stop (저장 없음)")
    return ok()


# ── 기록 ────────────────────────────────────────────────────────────────────
@app.get("/api/runs")
async def get_runs(robot: str | None = None, slot: str | None = None, limit: int = 100):
    return runs.list(robot, slot, limit)


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    run = runs.get(run_id)
    return run if run else refuse("없는 run", 404)


@app.get("/api/runs/{run_id}/path")
async def get_run_path(run_id: str):
    return runs.get_path(run_id)


@app.patch("/api/runs/{run_id}")
async def patch_run(run_id: str, body: dict):
    run, reason = runs.patch(run_id, body)
    return run if run else refuse(reason)


@app.post("/api/record/start")
async def record_start(body: dict):
    robot = body.get("robot")
    free_gb = shutil.disk_usage(HERE).free / 1e9
    if free_gb < CONFIG.get("disk_min_free_gb", 2):       # 감사 R5 — 자동 삭제 대신 거부
        return refuse(f"디스크 여유 {free_gb:.1f}GB — 임계 미만이라 녹화를 거부해요")
    run_id = adapter.robots().get(robot, {}).get("activeRunId")
    if not run_id:
        return refuse("진행 중인 run 이 없어요")
    bag = f"data/bags/{run_id}"
    runs.set_bag(run_id, bag)
    logs.emit(robot, "bridge", "info", f"rosbag record → {bag} (mock 은 경로만)")
    return ok(bagPath=bag)


@app.post("/api/record/stop")
async def record_stop(body: dict):
    logs.emit(body.get("robot"), "bridge", "info", "rosbag stop")
    return ok()


# ── 1Hz pose 샘플러 — run 경로 (감사 F2) ────────────────────────────────────
@app.on_event("startup")
async def start_sampler():
    async def sample():
        while True:
            for rid, r in adapter.robots().items():
                if r["activeRunId"]:
                    runs.sample_pose(r["activeRunId"], r["pose"])
            await asyncio.sleep(1.0)
    asyncio.get_event_loop().create_task(sample())


# ── 정적 서빙 — 빌드된 웹앱. 팀원은 이 주소 하나만 연다 (D29) ────────────────
DIST = HERE.parent / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
