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

  // 8. 실기 프로필 — Python SDK 미확인이므로 연결 거부 (네트워크를 건드리지 않는다)
  const real = await api('/connect', { robotId: 'fr5-lab-a' });
  check('fairino 프로필 → 미구현 fail-closed', real.json.ok === false && (real.json.reasons || []).join(' ').includes('미구현'));

  // 9. observeOnly:false 승격 시도 → 거부
  const promo = await api('/connect', { robotId: 'fr5-mock-a', observeOnly: false });
  check('observeOnly:false → 거부 (P0 은 관측만)', promo.json.ok === false);
} catch (e) {
  check('실행 자체', false, String(e.message || e));
} finally {
  bridge.kill();
}

const fails = results.filter(r => r[0] === 'FAIL');
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);
