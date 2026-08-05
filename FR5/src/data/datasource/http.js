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
// claim 이 발급한다. 조종권을 증명하는 것은 이름이 아니라 이것 (D55).
// **탭 저장소에 남긴다** — 메모리에만 두면 새로고침 한 번에 자기 조종권에서 잠긴다.
// 화면은 owner 이름만 보고 "내 것"이라 판단하는데 토큰이 없어 반납도 안 됐다 (2026-08-04 실측).
const TOKEN_KEY = 'fr5.ownerToken';
const store = (() => { try { return window.sessionStorage; } catch { return null; } })();
let ownerToken = store?.getItem(TOKEN_KEY) || null;

function setToken(v) {
  ownerToken = v || null;
  if (ownerToken) store?.setItem(TOKEN_KEY, ownerToken);
  else store?.removeItem(TOKEN_KEY);
}

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
  // 토큰이 바뀌면(재claim) 다시 보낸다 — 이름만 같고 세션이 다른 경우가 있다
  if (!who || ws?.readyState !== WebSocket.OPEN) return;
  if (sentWho === who + '\u0000' + (ownerToken ?? '')) return;
  ws.send(JSON.stringify({ cmd: 'hello', who, token: ownerToken }));
  sentWho = who + '\u0000' + (ownerToken ?? '');
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
  disconnect: (w) => api('POST', '/disconnect', { who: w, token: ownerToken }),  // 주인만 끊는다

  // 조종권은 이름이 아니라 토큰이 증명한다 (D55). 토큰은 이 모듈만 들고 화면은 모른다
  hasOwnerToken: () => ownerToken !== null,   // 이름만으로 "내 것"이라 하지 않는다
  claimOwner: async (w) => {
    const res = await api('POST', '/owner/claim', { who: w });
    if (res?.token) setToken(res.token);      // 같은 이름의 재claim 도 새 토큰을 준다 (owner.py)
    return res;
  },
  releaseOwner: async (w) => {
    const res = await api('POST', '/owner/release', { who: w, token: ownerToken });
    if (res?.ok !== false) setToken(null);
    return res;
  },
  arm: (w) => api('POST', '/arm', { who: w, token: ownerToken, confirm: '현장확인' }),
  disarm: (w) => api('POST', '/disarm', { who: w, token: ownerToken }),

  jog: (joint, deltaDeg) => sendCmd({ cmd: 'jog', joint, deltaDeg }),
  gripper: (pct) => sendCmd({ cmd: 'gripper', pct }),
  gripperActivate: () => sendCmd({ cmd: 'gripperActivate' }),
  setMode: (manual) => sendCmd({ cmd: 'mode', manual }),
  stop: () => sendCmd({ cmd: 'stop' }),          // 신원·조종권 없어도 항상 통과 (계약)
};
