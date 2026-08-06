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

// ── 글로벌 카메라 주소. **빌드에 박지 않는다** — 폰이 DHCP 라 IP 가 바뀐다
// (2026-08-06 실측: USB 세션의 폰이 WiFi 로 붙으며 `.10` 을 새로 받았다).
// `?cam=192.168.30.10:8080` 를 한 번 주면 기억한다. `?cam=` (빈 값) 이면 잊는다.
// **탭 저장소가 아니라 localStorage 다** — 조종권 토큰과 달리 이건 비밀이 아니고,
// 새로고침마다 주소를 다시 치게 만들 이유가 없다 (`AR/src/screens/cam.js` 와 같은 규약).
const CAM_KEY = 'fr5.camHost';
const camStore = (() => { try { return window.localStorage; } catch { return null; } })();
let camHost = (() => {
  const q = new URLSearchParams(location.search).get('cam');
  if (q === null) return camStore?.getItem(CAM_KEY) || null;
  const v = q.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (v) camStore?.setItem(CAM_KEY, v); else camStore?.removeItem(CAM_KEY);
  return v || null;
})();

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

  // 글로벌 카메라 MJPEG. **브리지를 거치지 않는다** — 중계를 만들면 계약·라우트·vite proxy
  // 세 곳이 늘고(`vite.config.js` §API_PATHS 는 손으로 미러링한다), 얻는 게 없다.
  // 브라우저가 폰을 직접 본다. 화면은 주소를 모르고 이 함수만 부른다 (`FR5/AGENTS.md`).
  cameraFeedUrl: () => (camHost ? `http://${camHost}/video` : null),
  cameraHost: () => camHost,

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

  // Teach — 지점(점)과 궤적(선). **좌표를 올리지 않는다** — 캡처의 정본은 서버가 읽은 상태다.
  // 읽기는 누구나, 쓰기는 조종권자만 (D44). goto 는 서버가 moveJ 로 번역해 같은 게이트를 탄다.
  getPoints: () => api('GET', '/points'),
  capturePoint: (w, name) => api('POST', '/points', { who: w, token: ownerToken, name }),
  deletePoint: (w, name) =>
    api('DELETE', `/points/${encodeURIComponent(name)}`, { who: w, token: ownerToken }),
  gotoPoint: (w, name) =>
    api('POST', `/points/${encodeURIComponent(name)}/goto`, { who: w, token: ownerToken }),

  getTrajectories: () => api('GET', '/trajectories'),
  getTrajectory: (name) => api('GET', `/trajectories/${encodeURIComponent(name)}`),
  // purpose — measure(조건 차단) / collect(일부러 랜덤화). 섞이면 둘 다 못 쓴다 (D74)
  startRecording: (w, name, purpose = 'measure', source = 'demo') =>
    api('POST', '/trajectories/start', { who: w, token: ownerToken, name, purpose, source }),
  stopRecording: (w) => api('POST', '/trajectories/stop', { who: w, token: ownerToken }),

  // Program — 지점을 순서로 엮어 승인한 것만 실행 (PROGRAM-CONTRACT.md).
  // **슬롯은 좌표를 안 보낸다** — 지점 이름만 올린다 (D78). step 은 서버가 goto 로 번역해
  // 같은 게이트를 처음부터 다시 태우므로, 실기 cmd 허용목록은 그대로다.
  getSlots: () => api('GET', '/slots'),
  saveSlot: (w, name, steps) => api('POST', '/slots', { who: w, token: ownerToken, name, steps }),
  deleteSlot: (w, name) =>
    api('DELETE', `/slots/${encodeURIComponent(name)}`, { who: w, token: ownerToken }),
  // 승인은 arm 과 같은 현장확인 관문을 탄다 (계획 §확인 절차는 한 모양으로)
  approveSlot: (w, name) => api('POST', `/slots/${encodeURIComponent(name)}/approve`,
    { who: w, token: ownerToken, confirm: '현장확인' }),
  // **한 요청이 한 단계다.** 몇 번째인지는 화면이 보낸다 — 서버는 커서를 안 든다
  slotStep: (w, name, index) => api('POST', `/slots/${encodeURIComponent(name)}/step`,
    { who: w, token: ownerToken, index }),

  jog: (joint, deltaDeg) => sendCmd({ cmd: 'jog', joint, deltaDeg }),
  gripper: (pct) => sendCmd({ cmd: 'gripper', pct }),
  gripperActivate: () => sendCmd({ cmd: 'gripperActivate' }),
  setMode: (manual) => sendCmd({ cmd: 'mode', manual }),
  stop: () => sendCmd({ cmd: 'stop' }),          // 신원·조종권 없어도 항상 통과 (계약)
};
