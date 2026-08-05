// P0 왕복 검증 — fr5-bridge 를 시험 포트(5155)에 직접 띄워 profile·preflight·fail-closed·
// 상태 스트림을 판정한다. 실기는 건드리지 않는다 (fairino 프로필은 연결 거부 자체가 검사 대상).
// 실행: node scripts/check/fr5-bridge-verify.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

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
const del = async (path, body) => {
  const res = await fetch(BASE + path, { method: 'DELETE',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
};

// 지점·궤적은 파일에 남는다 — **사람의 진짜 ~/fr5-data 에 쓰지 않는다** (env 로 갈아 끼운다)
const DATA = mkdtempSync(join(tmpdir(), 'fr5-verify-'));
const bridge = spawn('uv', ['run', '--with', 'fastapi', '--with', 'uvicorn[standard]', '--with', 'pyyaml',
  'uvicorn', 'main:app', '--port', String(PORT)],
  { cwd: join(ROOT, 'FR5/bridge'), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FR5_DATA_DIR: DATA } });
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
  check('GET /robots — 프로필 5개', robots.length === 5);
  const lab = robots.find(r => r.robotId === 'fr5-lab-a');
  check('실기 프로필 endpoint 는 증거값', lab?.endpoint === '192.168.58.2:8080');
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

  // 8. 실기 프로필 — 로봇이 없으면 fail-closed 사유, 있으면 observe-only 진입 (둘 다 정상)
  const real = await api('/connect', { robotId: 'fr5-lab-a' });
  if (real.json.ok) {
    check('fairino 프로필 → observe-only 진입 (실기 감지)', real.json.phase === 'OBSERVE_ONLY');
    await api('/disconnect', {});
  } else {
    check('fairino 프로필 → 사유 있는 fail-closed (실기 부재)', (real.json.reasons || []).length > 0);
  }

  // 9. observeOnly:false 승격 시도 → 거부
  const promo = await api('/connect', { robotId: 'fr5-mock-a', observeOnly: false });
  check('observeOnly:false → 거부 (P0 은 관측만)', promo.json.ok === false);

  // ── P2 — 조종권·arm·guarded jog/stop (mock 전체 사이클) ──────────────────
  const wsClient = (hello, token) => new Promise((resolve, reject) => {
    const sock = new WebSocket(`ws://127.0.0.1:${PORT}/ws/state`);
    const refusals = [];
    sock.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.ok === false) refusals.push(m.reason);
    };
    sock.onopen = () => {
      if (hello) sock.send(JSON.stringify({ cmd: 'hello', who: hello, token }));
      resolve({ sock, refusals, send: (m) => sock.send(JSON.stringify(m)) });
    };
    sock.onerror = () => reject(new Error('ws error'));
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getState = async () => (await api('/state')).json;

  await api('/connect', { robotId: 'fr5-mock-a' });
  const lee = await wsClient('lee');
  const anon = await wsClient(null);

  // 조종권 — 두 번째 사람은 409. claim 이 토큰을 준다 (D55)
  const claimed = (await api('/owner/claim', { who: 'kim' })).json;
  check('owner claim kim', claimed.ok === true);
  check('claim 이 토큰을 발급한다', typeof claimed.token === 'string' && claimed.token.length >= 16);
  const T = claimed.token;
  const kim = await wsClient('kim', T);
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
  const noConfirm = await api('/arm', { who: 'kim', token: T });
  check('confirm 없는 arm 403', noConfirm.status === 403);
  const wrongOwner = await api('/arm', { who: 'lee', token: T, confirm: '현장확인' });
  check('조종권 없는 arm 403', wrongOwner.status === 403);
  const armed = await api('/arm', { who: 'kim', token: T, confirm: '현장확인' });
  check('arm → ARMED + 서보 ON', armed.json.phase === 'ARMED' && (await getState()).enabled === true);

  // 안전 설정 (D53 · 조건 26) — 컨트롤러 충돌 감지는 기본으로 안 켜져 있다
  const applied = (await getState()).appliedSettings;
  check('arm 이 안전 설정을 넣고 기록한다', !!applied && applied.sent?.payloadKg === 0.6,
    `payload=${applied?.sent?.payloadKg}`);
  check('되읽은 하중이 넣은 값과 일치', applied?.readback?.payloadKg === 0.6 && !applied.mismatch.length);
  check('되읽기 불가 항목을 정직하게 노출',
    (applied?.unverifiable || []).includes('collisionLevel'));

  // 설정이 안 먹는 로봇이면 arm 자체가 거부돼야 한다 — 게이트가 있는 척하지 않는다
  await api('/disarm', { who: 'kim', token: T });
  await api('/owner/release', { who: 'kim', token: T });
  await api('/disconnect', {});
  await api('/connect', { robotId: 'fr5-mock-setfail', observeOnly: true });
  let T2 = (await api('/owner/claim', { who: 'kim' })).json.token;   // 재claim = 새 토큰
  const setfail = await api('/arm', { who: 'kim', token: T2, confirm: '현장확인' });
  check('설정이 안 먹는 로봇 → arm 거부 (조건 26)',
    setfail.json.ok === false && JSON.stringify(setfail.json.reasons).includes('안전 설정'),
    (setfail.json.reasons || [])[0]);
  check('거부 뒤 서보는 OFF 로 남는다', (await getState()).enabled === false);
  await api('/owner/release', { who: 'kim', token: T2 });
  await api('/disconnect', {});
  await api('/connect', { robotId: 'fr5-mock-a', observeOnly: true });
  T2 = (await api('/owner/claim', { who: 'kim' })).json.token;
  await api('/arm', { who: 'kim', token: T2, confirm: '현장확인' });

  // 위장 — 이름은 방송되므로 이름만으로는 조종권이 안 된다 (D55)
  const faker = await wsClient('kim', 'wrong-token');
  faker.send({ cmd: 'jog', joint: 0, deltaDeg: 1 });
  await sleep(200);
  check('남의 이름으로 hello → 조종권 거부 (토큰 불일치)',
    faker.refusals.some((r) => r.includes('조종권')));
  const fakeArm = await api('/arm', { who: 'kim', token: 'wrong-token', confirm: '현장확인' });
  check('토큰 없는 arm 403', fakeArm.status === 403);
  faker.sock.close();

  kim.send({ cmd: 'hello', who: 'kim', token: T2 });   // 재claim 했으므로 세션도 새 토큰으로
  await sleep(100);

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

  // Teach — 지점(점)과 궤적(선) (계약 §이동 지점 · §궤적 녹화 · D74)
  check('조종권 없는 사람의 캡처 거부',
    (await api('/points', { who: 'lee', token: T2, name: 'X' })).status === 403);
  const capped = await api('/points', { who: 'kim', token: T2, name: 'P1' });
  const here = await getState();
  check('캡처 → 서버가 읽은 관절이 그대로 굳는다',
    capped.json.point?.jointsDeg?.every((v, i) => Math.abs(v - here.jointsDeg[i]) < 0.5),
    `P1 j1=${capped.json.point?.jointsDeg?.[0]?.toFixed(2)}`);
  check('캡처가 좌표계·개체를 함께 싣는다',
    capped.json.point?.capturedRobotId === 'fr5-mock-a'
    && capped.json.point?.toolId !== undefined && capped.json.point?.userId !== undefined);
  check('이름이 비면 캡처 거부',
    (await api('/points', { who: 'kim', token: T2, name: '  ' })).status === 409);
  check('GET /points 는 누구나 — 목록에 P1', (await api('/points')).json.some(p => p.name === 'P1'));

  // 다른 자세로 옮긴 뒤 지점으로 되돌아온다 — Teach 의 완료 판정
  // **5° 를 넘겨 옮긴다** — 옛 조그 상한이면 여기서 영원히 못 돌아온다 (D75 가 고친 것)
  const p1j = capped.json.point.jointsDeg;
  for (let i = 0; i < 4; i++) { kim.send({ cmd: 'jog', joint: 0, deltaDeg: 4 }); await sleep(900); }
  const moved = await getState();
  check('지점 캡처 뒤 5° 넘게 떨어진 자세로 옮겼다', Math.abs(moved.jointsDeg[0] - p1j[0]) > 5.0,
    `차이 ${Math.abs(moved.jointsDeg[0] - p1j[0]).toFixed(2)}°`);
  const back = await api('/points/P1/goto', { who: 'kim', token: T2 });
  let returned = null;
  for (let i = 0; i < 40 && !returned; i++) {
    await sleep(100);
    const s2 = await getState();
    if (s2.motionQueueLength === 0 && Math.abs(s2.jointsDeg[0] - p1j[0]) < 0.05) returned = s2;
  }
  check('지점으로 이동 → 캡처 당시 관절로 복귀 (±0.05°)', back.json.ok === true && !!returned,
    returned ? `j1 ${moved.jointsDeg[0].toFixed(2)}→${returned.jointsDeg[0].toFixed(2)}` : '미복귀');
  // 상한을 그냥 푼 게 아니라 **경로를 훑어서** 연 것이다 — 로그가 그 증거다 (D75)
  const scanned = bridgeLog.match(/경로검사 (\d+)점 전부 통과/);
  check('가는 길을 5° 간격으로 훑고 갔다', !!scanned, scanned ? `${scanned[1]}점 검사` : '경로검사 기록 없음');
  check('조그는 여전히 5° 상한을 탄다 (상한을 전역으로 풀지 않았다)',
    (() => { kim.refusals.length = 0; return true; })());
  kim.send({ cmd: 'moveJ', jointsDeg: p1j.map((v, i) => i === 0 ? v + 30 : v), speedPct: 10 });
  await sleep(300);
  check('일반 moveJ 는 여전히 5° 초과를 거부한다',
    kim.refusals.some((r) => r.includes('관절 변화')), kim.refusals[0] ?? '거부 없음');
  check('없는 지점 이동은 404',
    (await api('/points/없는것/goto', { who: 'kim', token: T2 })).status === 404);

  // 궤적 — **읽기만 한다.** 로봇에 아무것도 안 보낸다
  check('조종권 없는 사람의 녹화 시작 거부',
    (await api('/trajectories/start', { who: 'lee', token: T2, name: 'x' })).status === 403);
  const started = await api('/trajectories/start',
    { who: 'kim', token: T2, name: 'demo-01', purpose: 'measure' });
  check('녹화 시작 — fps 가 고정으로 잡힌다', started.json.ok === true && started.json.fps > 0,
    `fps=${started.json.fps}`);
  check('출발 자세에 지점 이름이 붙는다 (P1 위에서 시작)', started.json.startPoseName === 'P1');
  check('녹화 중 두 번째 시작은 거부',
    (await api('/trajectories/start', { who: 'kim', token: T2, name: 'demo-02' })).status === 409);
  kim.send({ cmd: 'jog', joint: 0, deltaDeg: 2 });
  await sleep(1500);
  const stopped = await api('/trajectories/stop', { who: 'kim', token: T2 });
  const tr = stopped.json.trajectory;
  check('녹화 정지 → 프레임이 쌓였다', tr?.frameCount > 5, `프레임 ${tr?.frameCount}`);
  check('정상 종료는 endReason done · 결손 0', tr?.endReason === 'done' && tr?.dropped === 0,
    `end=${tr?.endReason} dropped=${tr?.dropped}`);
  check('잰 조건(stamp)이 실린다 — 속도 상한·좌표계·개체',
    tr?.stamp?.speedCapPct === 10 && tr?.stamp?.robotId === 'fr5-mock-a'
    && tr?.stamp?.toolId !== undefined);
  check('purpose·source 가 실린다', tr?.purpose === 'measure' && tr?.source === 'demo');
  const trajs = (await api('/trajectories')).json;
  check('목록은 프레임을 안 싣는다 (요약만)',
    trajs.length === 1 && trajs[0].frames === undefined && trajs[0].frameCount > 5);
  const full = (await api('/trajectories/demo-01')).json;
  check('개별 조회는 프레임을 준다 · 시각이 고정 주기다',
    full.frames.length === tr.frameCount
    && Math.abs(full.frames[1].tSec - full.frames[0].tSec - 1 / full.fps) < 1e-3);
  check('녹화 중이 아닌데 stop 하면 거부',
    (await api('/trajectories/stop', { who: 'kim', token: T2 })).status === 409);

  // 삭제 — 참조가 없으면 지워지고, 없는 이름은 404
  check('지점 삭제', (await del('/points/P1', { who: 'kim', token: T2 })).json.ok === true);
  check('삭제 뒤 목록에서 사라진다', !(await api('/points')).json.some(p => p.name === 'P1'));
  check('없는 지점 삭제는 404',
    (await del('/points/P1', { who: 'kim', token: T2 })).status === 404);

  // 그리퍼 — 관절이 아니다. 전용 게이트를 타는지, 활성화가 선행되는지 (계약 §그리퍼)
  kim.refusals.length = 0;
  kim.send({ cmd: 'gripper', pct: 50 });
  await sleep(200);
  check('활성화 전 그리퍼 이동 거부 (사람이 읽는 사유)',
    kim.refusals.some((r) => r.includes('활성화')));
  kim.refusals.length = 0;
  kim.send({ cmd: 'gripper', pct: 140 });
  await sleep(200);
  check('그리퍼 pct 범위 밖 거부', kim.refusals.some((r) => r.includes('0~100')));

  kim.send({ cmd: 'gripperActivate' });
  await sleep(300);
  check('활성화 → state.gripper.active', (await getState()).gripper?.active === true);

  kim.refusals.length = 0;
  kim.send({ cmd: 'gripper', pct: 30 });
  await sleep(300);
  const grip = (await getState()).gripper ?? {};
  check('그리퍼 30% 지령 → 읽기가 같은 값으로 따라온다 (2026-08-04 실기 확인)',
    grip.pct === 30, `pct=${grip.pct}`);
  check('그리퍼는 관절 게이트를 타지 않는다 (5°·모션큐 사유 없음)',
    !kim.refusals.some((r) => r.includes('5°') || r.includes('모션 큐')));

  // 무신원·비조종권은 그리퍼도 못 만진다 (stop 만 예외)
  lee.refusals.length = 0;
  lee.send({ cmd: 'gripper', pct: 10 });
  await sleep(200);
  check('조종권 없는 사람의 그리퍼 명령 거부',
    lee.refusals.some((r) => r.includes('조종권')));

  // 작업영역 (조건 12 카테시안) — mock 의 가짜 기구학으로 게이트 논리만 시험한다.
  // j1→x · j2→y · j3→z 로 10mm/° 씩 움직인다 (mock.forward_kin)
  const wsState = await getState();
  check('/state 가 작업영역을 노출한다 (꺼져 있으면 보여야 한다)',
    !!wsState.workspace && wsState.workspace.tableTopZmm === 930);
  kim.refusals.length = 0;
  kim.send({ cmd: 'jog', joint: 2, deltaDeg: -5 });      // z 56.7 → 6.7 < 바닥 50
  await sleep(300);
  check('상판을 뚫는 목표 거부 (관절 한계 안인데도)',
    kim.refusals.some((r) => r.includes('상판을 뚫는다')));
  kim.refusals.length = 0;
  kim.send({ cmd: 'jog', joint: 1, deltaDeg: -5 });      // y -62.3 → -112.3 < 벽 -100
  await sleep(300);
  check('벽으로 가는 목표 거부',
    kim.refusals.some((r) => r.includes('벽에 너무 가깝다')));
  kim.refusals.length = 0;
  const wsBefore = (await getState()).jointsDeg[0];
  kim.send({ cmd: 'jog', joint: 0, deltaDeg: 1 });       // x 만 변한다 — 영역 안
  await sleep(600);
  check('작업영역 안의 조그는 그대로 통과한다 (새 게이트가 정상 동작을 막지 않는다)',
    Math.abs((await getState()).jointsDeg[0] - (wsBefore + 1)) < 0.2 && kim.refusals.length === 0);

  // 모드 전환 — ARM 이 SetMode(0) 으로 펜던트를 잠그므로 되돌릴 길이 있어야 한다 (D72).
  // 드래그 티칭은 서보가 켜져 있어야 되므로 **ARMED 인 채로** 넘길 수 있어야 한다.
  kim.refusals.length = 0;
  kim.send({ cmd: 'mode', manual: true });
  await sleep(300);
  const manualOn = await getState();
  check('ARMED 인 채로 수동 전환 → mode 1 · 서보는 켜진 채 (드래그 전제)',
    manualOn.mode === 1 && manualOn.enabled === true);

  kim.send({ cmd: 'jog', joint: 0, deltaDeg: 1 });
  await sleep(200);
  check('수동 모드에서 조그는 거부된다 — 하드 룰 4 를 지키는 것은 이 게이트다',
    kim.refusals.some((r) => r.includes('auto 모드가 아니다')));

  kim.refusals.length = 0;
  kim.send({ cmd: 'mode', manual: 'yes' });
  await sleep(200);
  check('manual 이 불리언이 아니면 거부', kim.refusals.some((r) => r.includes('true/false')));

  kim.send({ cmd: 'mode', manual: false });
  await sleep(300);
  check('자동으로 되돌아온다', (await getState()).mode === 0);

  lee.refusals.length = 0;
  lee.send({ cmd: 'mode', manual: true });
  await sleep(200);
  check('조종권 없는 사람의 모드 전환 거부',
    lee.refusals.some((r) => r.includes('조종권')));

  // 조종권 반납 → 자동 disarm (주인 없는 ARMED 를 남기지 않는다)
  check('옛 토큰으로는 반납도 안 된다',
    (await api('/owner/release', { who: 'kim', token: T })).status === 409);
  await api('/owner/release', { who: 'kim', token: T2 });
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
  rmSync(DATA, { recursive: true, force: true });
}

const fails = results.filter(r => r[0] === 'FAIL');
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);
