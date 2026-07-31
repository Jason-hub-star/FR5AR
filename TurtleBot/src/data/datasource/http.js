// 진짜 tb-bridge 클라이언트 — mock.js 와 같은 얼굴 (TB-CONTRACT.md).
// dev 는 vite proxy(/api·/ws → :5055), 운영은 브리지가 같은 출처에서 서빙한다 — 주소가 코드에 없다.
import { MAP_GEOMETRY } from '../mapGeometry.js';

const WS_BASE = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
const TRAIL_MAX = 400;

const stateSubs = new Set();
const logSubs = new Set();
const trails = {};                 // 화면용 궤적은 클라이언트가 쌓는다 — 계약엔 없다
let stateWs = null;
let sentWho = null;
let lastSnapshot = null;

function ensureStateWs() {
  if (stateWs && stateWs.readyState <= WebSocket.OPEN) return;
  stateWs = new WebSocket(`${WS_BASE}/ws/state`);
  stateWs.onopen = () => { sentWho = null; };
  stateWs.onmessage = (e) => {
    const snap = JSON.parse(e.data);
    if (!snap.robots) {            // 명령 거부 응답 — 조용히 버리지 않고 로그 패널로 흘린다
      if (snap.ok === false) logSubs.forEach((cb) => cb({
        t: Date.now() / 1000, robot: '—', source: 'bridge', level: 'warn', line: snap.reason,
      }));
      return;
    }
    for (const [id, r] of Object.entries(snap.robots)) {
      const t = (trails[id] ??= []);
      if (r.velocity.linearMmS !== 0 || r.velocity.angularDegS !== 0) {
        t.push([r.pose.xMm, r.pose.yMm]);
        if (t.length > TRAIL_MAX) t.shift();
      }
      r.trail = t;
    }
    lastSnapshot = snap;
    stateSubs.forEach((cb) => cb(snap));
  };
  stateWs.onclose = () => setTimeout(ensureStateWs, 1000);   // 전체 스냅샷이라 재접속이 곧 복구
}

function hello(who) {
  if (!who || sentWho === who || stateWs?.readyState !== WebSocket.OPEN) return;
  stateWs.send(JSON.stringify({ cmd: 'hello', who }));
  sentWho = who;
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ ok: res.ok }));
}

export const datasource = {
  adapter: 'real-bridge',          // 실제 표기는 상태의 adapter 필드가 이긴다 (mock|real)
  mapGeometry: MAP_GEOMETRY,

  subscribeState(cb) {
    ensureStateWs();
    stateSubs.add(cb);
    if (lastSnapshot) cb(lastSnapshot);
    return () => stateSubs.delete(cb);
  },
  subscribeLogs(cb) {
    if (logSubs.size === 0) {
      const ws = new WebSocket(`${WS_BASE}/ws/logs`);
      ws.onmessage = (e) => logSubs.forEach((s) => s(JSON.parse(e.data)));
      this._logWs = ws;
    }
    logSubs.add(cb);
    return () => logSubs.delete(cb);
  },

  getSlots: () => api('GET', '/api/slots'),
  getMaps: () => api('GET', '/api/maps'),
  getRuns: () => api('GET', '/api/runs'),
  getRun: (id) => api('GET', `/api/runs/${id}`),
  getRunPath: (id) => api('GET', `/api/runs/${id}/path`),
  patchRun: (id, patch) => api('PATCH', `/api/runs/${id}`, patch),

  liveMapUrl: (robot) => `/api/maps/live.png?robot=${robot}`,
  activateMap: (name, robot) => api('POST', `/api/maps/${name}/activate`, { robot }),
  recordStart: (robot) => api('POST', '/api/record/start', { robot }),
  recordStop: (robot) => api('POST', '/api/record/stop', { robot }),

  claimOwner: (robot, who) => api('POST', '/api/owner/claim', { robot, who }),
  releaseOwner: (robot, who) => api('POST', '/api/owner/release', { robot, who }),
  startSlot: (name, robot, who) => api('POST', `/api/slots/${name}/start`, { robot, who }),
  stopRobot: (robot) => api('POST', `/api/robots/${robot}/stop`, {}),
  startMapping: (robot, who) => api('POST', '/api/mapping/start', { robot, who }),
  saveMap: (robot, name) => api('POST', '/api/mapping/save', { robot, name }),
  stopMapping: (robot) => api('POST', '/api/mapping/stop', { robot }),

  teleop(robot, linearMmS, angularDegS, who) {
    ensureStateWs();
    if (stateWs.readyState !== WebSocket.OPEN) return { ok: false, reason: '브리지 연결 대기 중' };
    hello(who);
    stateWs.send(JSON.stringify({ cmd: 'teleop', robot, linearMmS, angularDegS }));
    return { ok: true };           // 거부 사유는 WS 응답 → 콘솔이 아니라 로그 패널로 온다 (bridge 로그)
  },
  async estop(robot) {
    ensureStateWs();
    if (stateWs.readyState === WebSocket.OPEN) {
      stateWs.send(JSON.stringify({ cmd: 'estop', robot }));
      return { ok: true };
    }
    return { ok: false, reason: '브리지 연결이 없어요' };
  },
};
