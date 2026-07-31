// fr5-bridge 클라이언트 (API-CONTRACT.md 가 정본).
// dev 는 vite proxy(계약 경로 → :5055), 운영은 브리지가 같은 출처에서 서빙한다 — 주소가 코드에 없다.
const WS_BASE = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

const stateSubs = new Set();
const refusalSubs = new Set();     // 명령 거부 사유 — 조용히 버리지 않고 화면으로 흘린다
let ws = null;
let lastSnapshot = null;
let reconnects = -1;               // 첫 접속은 재연결이 아니다
let who = null;
let sentWho = null;

function ensureWs() {
  if (ws && ws.readyState <= WebSocket.OPEN) return;
  reconnects += 1;
  ws = new WebSocket(`${WS_BASE}/ws/state`);
  ws.onopen = () => { sentWho = null; sendHello(); };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.ok === false) {        // 거부 응답 — 상태 스냅샷이 아니다
      refusalSubs.forEach((cb) => cb(msg.reason ?? '거부됨'));
      return;
    }
    lastSnapshot = msg;
    stateSubs.forEach((cb) => cb(msg));
  };
  // 미연결에도 같은 스키마가 오므로(D40) 끊김 = 브리지 자체가 죽은 것 — 1초 후 재시도
  ws.onclose = () => setTimeout(ensureWs, 1000);
}

function sendHello() {
  if (!who || sentWho === who || ws?.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ cmd: 'hello', who }));
  sentWho = who;
}

function sendCmd(msg) {
  ensureWs();
  if (ws.readyState !== WebSocket.OPEN) return { ok: false, reason: '브리지 연결 대기 중' };
  sendHello();
  ws.send(JSON.stringify(msg));
  return { ok: true };             // 거부 사유는 WS 응답 → subscribeRefusals 로 온다
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
  setWho(name) { who = name || null; sendHello(); },
  subscribeState(cb) {
    ensureWs();
    stateSubs.add(cb);
    if (lastSnapshot) cb(lastSnapshot);
    return () => stateSubs.delete(cb);
  },
  subscribeRefusals(cb) {
    refusalSubs.add(cb);
    return () => refusalSubs.delete(cb);
  },
  wsReconnects: () => Math.max(0, reconnects),   // 재연결 기록 — V0 완료 증거의 일부

  getRobots: () => api('GET', '/robots'),
  getVersion: () => api('GET', '/version'),
  connect: (robotId) => api('POST', '/connect', { robotId, observeOnly: true }),
  disconnect: () => api('POST', '/disconnect', {}),

  claimOwner: (w) => api('POST', '/owner/claim', { who: w }),
  releaseOwner: (w) => api('POST', '/owner/release', { who: w }),
  arm: (w) => api('POST', '/arm', { who: w, confirm: '현장확인' }),
  disarm: (w) => api('POST', '/disarm', { who: w }),

  jog: (joint, deltaDeg) => sendCmd({ cmd: 'jog', joint, deltaDeg }),
  stop: () => sendCmd({ cmd: 'stop' }),          // 신원·조종권 없어도 항상 통과 (계약)
};
