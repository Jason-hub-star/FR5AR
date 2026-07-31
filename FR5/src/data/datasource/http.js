// fr5-bridge 클라이언트 (API-CONTRACT.md 가 정본).
// dev 는 vite proxy(계약 경로 → :5055), 운영은 브리지가 같은 출처에서 서빙한다 — 주소가 코드에 없다.
const WS_BASE = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

const stateSubs = new Set();
let ws = null;
let lastSnapshot = null;
let reconnects = -1;               // 첫 접속은 재연결이 아니다

function ensureWs() {
  if (ws && ws.readyState <= WebSocket.OPEN) return;
  reconnects += 1;
  ws = new WebSocket(`${WS_BASE}/ws/state`);
  ws.onmessage = (e) => {
    lastSnapshot = JSON.parse(e.data);
    stateSubs.forEach((cb) => cb(lastSnapshot));
  };
  // 미연결에도 같은 스키마가 오므로(D40) 끊김 = 브리지 자체가 죽은 것 — 1초 후 재시도
  ws.onclose = () => setTimeout(ensureWs, 1000);
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
  subscribeState(cb) {
    ensureWs();
    stateSubs.add(cb);
    if (lastSnapshot) cb(lastSnapshot);
    return () => stateSubs.delete(cb);
  },
  wsReconnects: () => Math.max(0, reconnects),   // 재연결 기록 — V0 완료 증거의 일부

  getRobots: () => api('GET', '/robots'),
  getVersion: () => api('GET', '/version'),
  connect: (robotId) => api('POST', '/connect', { robotId, observeOnly: true }),
  disconnect: () => api('POST', '/disconnect', {}),
};
