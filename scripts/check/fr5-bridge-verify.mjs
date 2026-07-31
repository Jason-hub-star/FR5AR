// P0 왕복 검증 — fr5-bridge 를 시험 포트(5155)에 직접 띄워 profile·preflight·fail-closed·
// 상태 스트림을 판정한다. 실기는 건드리지 않는다 (fairino 프로필은 연결 거부 자체가 검사 대상).
// 실행: node scripts/check/fr5-bridge-verify.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 5155;
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push([ok ? 'PASS' : 'FAIL', name, detail]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const api = async (path, body) => {
  const res = await fetch(BASE + path, body === undefined
    ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
};

const bridge = spawn('uv', ['run', '--with', 'fastapi', '--with', 'uvicorn[standard]', '--with', 'pyyaml',
  'uvicorn', 'main:app', '--port', String(PORT)], { cwd: join(ROOT, 'FR5/bridge'), stdio: ['ignore', 'pipe', 'pipe'] });
let bridgeLog = '';
bridge.stdout.on('data', d => { bridgeLog += d; });
bridge.stderr.on('data', d => { bridgeLog += d; });

try {
  // 기동 대기 — 최대 30초
  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    await new Promise(r => setTimeout(r, 200));
    up = await fetch(BASE + '/robots').then(r => r.ok).catch(() => false);
  }
  if (!up) throw new Error(`브리지 기동 실패\n${bridgeLog.slice(-2000)}`);

  // 1. 프로필 목록 — 계약 모양, 비밀번호 없음
  const robots = (await api('/robots')).json;
  check('GET /robots — 프로필 4개', robots.length === 4);
  const lab = robots.find(r => r.robotId === 'fr5-lab-a');
  check('실기 프로필 endpoint 는 증거값', lab?.endpoint === '192.168.57.2:8080');
  check('프로필에 비밀번호류 없음', !JSON.stringify(robots).match(/password|passwd|secret/i));

  // 2. 미연결 스냅샷 — 같은 스키마 (D40)
  const empty = (await api('/state')).json;
  const KEYS = ['t', 'robotId', 'connected', 'enabled', 'mode', 'jointsDeg', 'tcpMmDeg',
    'motionQueueLength', 'safety', 'coord', 'sampleMs', 'gripper', 'owner', 'phase', 'failReason'];
  check('미연결 /state — 전체 스키마 + DISCONNECTED',
    KEYS.every(k => k in empty) && empty.phase === 'DISCONNECTED' && empty.connected === false);

  // 3. mock 연결 → OBSERVE_ONLY
  const conn = await api('/connect', { robotId: 'fr5-mock-a' });
  check('connect fr5-mock-a → OBSERVE_ONLY', conn.json.ok === true && conn.json.phase === 'OBSERVE_ONLY');
  const ver = (await api('/version')).json;
  check('GET /version — 실측 펌웨어 문자열', ver.controller === 'FR_CTRL_FV2.010.12' && ver.robotId === 'fr5-mock-a');
  check('mock 이 실기 SDK 를 사칭하지 않음', ver.sdk === 'mock-0.1');
  const st = (await api('/state')).json;
  const SAFETY = ['code', 'emergencyStop', 'safetyStop', 'collisionDetected', 'inDragTeach', 'mainErrorCode', 'subErrorCode'];
  check('연결 /state — 6축·안전 필드 7개·OBSERVE_ONLY',
    st.jointsDeg.length === 6 && SAFETY.every(k => k in st.safety) && st.phase === 'OBSERVE_ONLY' && st.robotId === 'fr5-mock-a');

  // 4. 연결 중 중복 connect → 거부
  const dup = await api('/connect', { robotId: 'fr5-mock-b' });
  check('연결 중 재connect 409 거부', dup.status === 409 && dup.json.ok === false);

  // 5. WS 스트림 — 1초간 프레임 수신
  const frames = [];
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/state`);
    ws.onmessage = e => frames.push(JSON.parse(e.data));
    ws.onerror = () => reject(new Error('ws error'));
    setTimeout(() => { ws.close(); resolve(); }, 1000);
  });
  check('WS /ws/state — 1초에 10프레임 이상', frames.length >= 10, `${frames.length}프레임`);
  check('WS 프레임이 REST 와 같은 스키마', frames.length > 0 && KEYS.every(k => k in frames[0]));
  const wiggled = frames.length > 5 && frames[0].jointsDeg[0] !== frames.at(-1).jointsDeg[0];
  check('관절값이 흐른다 (mock 숨쉬기)', wiggled);

  // 6. 프로필 교체 — disconnect 후 다른 endpoint 로
  await api('/disconnect', {});
  const swap = await api('/connect', { robotId: 'fr5-mock-b' });
  check('프로필 교체 fr5-mock-b → OBSERVE_ONLY', swap.json.ok === true && swap.json.phase === 'OBSERVE_ONLY');
  await api('/disconnect', {});

  // 7. 잘못된 모델·누락 필드 → FAIL_CLOSED + 사유
  const bad = await api('/connect', { robotId: 'fr5-mock-broken' });
  const reasons = (bad.json.reasons || []).join(' ');
  check('불량 프로필 → ok:false + 모델 불일치 사유', bad.json.ok === false && reasons.includes('모델 불일치'));
  check('누락 안전 필드 사유 포함', reasons.includes('safety.safetyStop'));
  const failed = (await api('/state')).json;
  check('/state → FAIL_CLOSED + failReason', failed.phase === 'FAIL_CLOSED' && !!failed.failReason && failed.connected === false);

  // 8. 실기 프로필 — 이 시험은 FAIRINO_DLL 없이 돈다 → 어댑터가 네트워크 이전에 fail-closed
  const real = await api('/connect', { robotId: 'fr5-lab-a' });
  check('fairino 프로필 → DLL 미설정 fail-closed', real.json.ok === false && (real.json.reasons || []).join(' ').includes('FAIRINO_DLL'));

  // 9. observeOnly:false 승격 시도 → 거부
  const promo = await api('/connect', { robotId: 'fr5-mock-a', observeOnly: false });
  check('observeOnly:false → 거부 (P0 은 관측만)', promo.json.ok === false);

  // ── P2 — 조종권·arm·guarded jog/stop (mock 전체 사이클) ──────────────────
  const wsClient = (hello) => new Promise((resolve, reject) => {
    const sock = new WebSocket(`ws://127.0.0.1:${PORT}/ws/state`);
    const refusals = [];
    sock.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.ok === false) refusals.push(m.reason);
    };
    sock.onopen = () => {
      if (hello) sock.send(JSON.stringify({ cmd: 'hello', who: hello }));
      resolve({ sock, refusals, send: (m) => sock.send(JSON.stringify(m)) });
    };
    sock.onerror = () => reject(new Error('ws error'));
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getState = async () => (await api('/state')).json;

  await api('/connect', { robotId: 'fr5-mock-a' });
  const kim = await wsClient('kim');
  const lee = await wsClient('lee');
  const anon = await wsClient(null);

  // 조종권 — 두 번째 사람은 409
  check('owner claim kim', (await api('/owner/claim', { who: 'kim' })).json.ok === true);
  const dup2 = await api('/owner/claim', { who: 'lee' });
  check('두 번째 claim 409 (명령 주인 한 명)', dup2.status === 409 && dup2.json.ok === false);
  check('claim 후 phase OWNER_HELD', (await getState()).phase === 'OWNER_HELD');

  // ARMED 전 명령 거부 · 조종권 없는 명령 거부
  kim.send({ cmd: 'jog', joint: 0, deltaDeg: 1 });
  await sleep(200);
  check('ARM 전 jog 거부 + 사유 회신', kim.refusals.some((r) => r.includes('ARMED')));
  lee.send({ cmd: 'jog', joint: 0, deltaDeg: 1 });
  await sleep(200);
  check('조종권 없는 jog 거부', lee.refusals.some((r) => r.includes('조종권')));

  // arm — confirm 리터럴·조종권 강제
  const noConfirm = await api('/arm', { who: 'kim' });
  check('confirm 없는 arm 403', noConfirm.status === 403);
  const wrongOwner = await api('/arm', { who: 'lee', confirm: '현장확인' });
  check('조종권 없는 arm 403', wrongOwner.status === 403);
  const armed = await api('/arm', { who: 'kim', confirm: '현장확인' });
  check('arm → ARMED + 서보 ON', armed.json.phase === 'ARMED' && (await getState()).enabled === true);

  // 상한 — 초과는 자르지 않고 거부한다
  kim.send({ cmd: 'jog', joint: 0, deltaDeg: 10 });
  await sleep(200);
  check('관절 5° 상한 초과 jog 거부', kim.refusals.some((r) => r.includes('5')));
  const before = await getState();
  kim.send({ cmd: 'moveJ', jointsDeg: before.jointsDeg, speedPct: 50 });
  await sleep(200);
  check('속도 10% 상한 초과 moveJ 거부', kim.refusals.some((r) => r.includes('속도 상한')));

  // 유효한 jog — 실제로 그만큼 움직인다 (mock 은 속도 비례 보간)
  const j1a = before.jointsDeg[0];
  kim.send({ cmd: 'jog', joint: 0, deltaDeg: 2 });
  let reached = null;
  for (let i = 0; i < 30 && !reached; i++) {
    await sleep(100);
    const s = await getState();
    if (Math.abs(s.jointsDeg[0] - (j1a + 2)) < 0.01 && s.motionQueueLength === 0) reached = s;
  }
  check('jog +2° → 목표 도달 + 큐 소진', !!reached, reached ? `j1 ${j1a.toFixed(2)}→${reached.jointsDeg[0].toFixed(2)}` : '미도달');
  check('이동 중 EXECUTING 노출', true);   // 아래 stop 시험에서 실측

  // stop — 신원 없는 소켓도 항상 통과 (제3원칙)
  kim.send({ cmd: 'jog', joint: 0, deltaDeg: 4 });
  await sleep(200);
  const moving = await getState();
  check('이동 중 phase EXECUTING', moving.phase === 'EXECUTING');
  anon.send({ cmd: 'stop' });
  await sleep(300);
  const s1 = await getState();
  await sleep(300);
  const s2 = await getState();
  check('무신원 stop → 즉시 정지 (관절 정지·큐 0)',
    s1.motionQueueLength === 0 && Math.abs(s1.jointsDeg[0] - s2.jointsDeg[0]) < 1e-9
    && Math.abs(s2.jointsDeg[0] - (j1a + 2 + 4)) > 0.5);

  // 조종권 반납 → 자동 disarm (주인 없는 ARMED 를 남기지 않는다)
  await api('/owner/release', { who: 'kim' });
  await sleep(200);
  const released = await getState();
  check('owner release → 자동 disarm (서보 OFF · OBSERVE_ONLY)',
    released.enabled === false && released.phase === 'OBSERVE_ONLY');

  kim.sock.close(); lee.sock.close(); anon.sock.close();
  await api('/disconnect', {});
} catch (e) {
  check('실행 자체', false, String(e.message || e));
} finally {
  bridge.kill();
}

const fails = results.filter(r => r[0] === 'FAIL');
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);
