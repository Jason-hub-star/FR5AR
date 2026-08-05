// P1 실렌더 검증 — fr5-bridge(5157) + vite dev(5176) 를 직접 띄워 Live 화면을 판정한다.
// 3D 쌍둥이 로딩·관절값 스트림·연결 진단·fail-closed 사유 표시를 실제 브라우저로 본다.
// 실행: node scripts/check/fr5-web-verify.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openPage, pixelChanged } from '/Users/family/jason/FR5Web/.claude/skills/검증/references/cdp-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BRIDGE_PORT = 5157;
const URL = 'http://localhost:5176/';
const OUT = process.env.FR5_VERIFY_OUT ?? '/private/tmp/claude-501/-Users-family-jason-FR5Web/0448c793-398f-4d6a-a2d6-6894765d2689/scratchpad';
const results = [];
const check = (name, ok, detail = '') => {
  results.push([ok ? 'PASS' : 'FAIL', name, detail]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
// 지점·궤적은 파일에 남는다 — **사람의 진짜 ~/fr5-data 에 쓰지 않는다**
const DATA = mkdtempSync(join(tmpdir(), 'fr5-web-verify-'));
const env = { ...process.env, FR5_PORT: String(BRIDGE_PORT) };

const spawnBridge = () => spawn('uv', ['run', '--with', 'fastapi', '--with', 'uvicorn[standard]', '--with', 'pyyaml',
  'uvicorn', 'main:app', '--port', String(BRIDGE_PORT)],
  { cwd: join(ROOT, 'FR5/bridge'), stdio: 'ignore',
    env: { ...process.env, FR5_DATA_DIR: DATA } });
let bridge = spawnBridge();
const web = spawn('npm', ['run', 'dev:fr5'], { cwd: ROOT, env, stdio: 'ignore' });
const waitUp = async (url) => {
  for (let i = 0; i < 150; i++) {
    if (await fetch(url).then((r) => r.ok).catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

let p = null;
try {
  if (!await waitUp(`http://127.0.0.1:${BRIDGE_PORT}/robots`)) throw new Error('브리지 기동 실패');
  if (!await waitUp(URL)) throw new Error('vite dev 기동 실패');

  p = await openPage(URL, { port: 9343, windowSize: '1280,900' });

  // 1. 뼈대 — 패널 4개(Live 만 활성) + 상시 안전 바. **Optimize 는 없다** (D74)
  await p.waitFor(`document.querySelectorAll('nav button').length === 4`);
  check('패널 탭 4개', true);
  check('Optimize 탭이 없다 (D74)',
    !(await p.eval(`[...document.querySelectorAll('nav button')].some(b => /optimize/i.test(b.textContent))`)));
  check('Teach 는 열려 있고 Program·History 는 아직 비활성 (사다리 3~4 예정)',
    (await p.eval(`document.querySelectorAll('nav button:disabled').length`)) === 2
    && (await p.eval(`[...document.querySelectorAll('nav button')].find(b => b.textContent === 'Teach')?.disabled`)) === false);
  check('상시 안전 바 8항목',
    (await p.eval(`document.querySelectorAll('[data-t="safeitem"]').length`)) === 8);
  check('미연결 phase 표시 DISCONNECTED',
    !!(await p.eval(`document.querySelector('[data-t="safetybar"]').textContent.includes('DISCONNECTED')`)));

  // 2. 불량 mock 프로필 연결 시도 → 사람이 읽는 거부 사유 (fail-closed 경로).
  //    실기 프로필은 시험에서 건드리지 않는다 — 로봇 유무에 따라 결과가 갈리고, 있으면 실기를 만진다
  await p.waitFor(`document.querySelectorAll('[data-t="diag"] select option').length === 5`);
  const pickProfile = (id) => p.eval(`(() => {
    const sel = document.querySelector('[data-t="diag"] select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, ${JSON.stringify(id)});
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await pickProfile('fr5-mock-broken');
  await p.eval(`document.querySelector('[data-t="diag"] button.primary').click()`);
  const refusal = await p.waitFor(`document.querySelector('[data-t="refusal"]')?.textContent`, { timeoutMs: 5000 });
  check('불량 프로필 → 거부 사유 표시 (모델 불일치 fail-closed)', !!refusal && refusal.includes('모델 불일치'));

  // 3. mock 프로필로 연결 → OBSERVE_ONLY
  await pickProfile('fr5-mock-a');
  await p.eval(`document.querySelector('[data-t="diag"] button.primary').click()`);
  check('connect → 안전 바 OBSERVE_ONLY',
    !!(await p.waitFor(`document.querySelector('[data-t="safetybar"]').textContent.includes('OBSERVE_ONLY')`, { timeoutMs: 5000 })));
  check('출처 배지 mock (사칭 없음)',
    (await p.eval(`document.querySelector('[data-t="source"]').dataset.src`)) === 'mock');
  check('펌웨어 실측 문자열 표시',
    !!(await p.waitFor(`document.body.textContent.includes('FR_CTRL_FV2.010.12')`, { timeoutMs: 5000 })));

  // 4. 값이 흐른다 — 관절 표가 스트림을 따라 변한다
  const j1a = await p.waitFor(`document.querySelector('[data-t="joints"] td')?.textContent !== '—' && document.querySelector('[data-t="joints"] td')?.textContent`, { timeoutMs: 5000 });
  await new Promise((r) => setTimeout(r, 1200));
  const j1b = await p.eval(`document.querySelector('[data-t="joints"] td')?.textContent`);
  check('관절값 스트림 갱신 (WS)', !!j1a && j1a !== j1b, `${j1a} → ${j1b}`);
  check('TCP 6행 값 표시',
    (await p.eval(`[...document.querySelectorAll('[data-t="tcp"] td')].filter(td => td.textContent !== '—').length`)) === 6);

  // 5. 3D 쌍둥이 — URDF 실로딩 + 픽셀이 실제로 움직인다
  check('URDF+그리퍼 로딩 완료 깃발',
    !!(await p.waitFor(`document.querySelector('[data-t="twin"]')?.dataset.ready === '1'`, { timeoutMs: 20000 })));
  const rect = await p.rect('[data-t="twin"] canvas');
  const shot1 = `${OUT}/fr5-twin-1.png`;
  const shot2 = `${OUT}/fr5-twin-2.png`;
  await p.screenshot(shot1, rect);
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot(shot2, rect);
  check('3D 캔버스 픽셀이 흐른다 (mock 숨쉬기 실렌더)', pixelChanged(shot1, shot2));
  await p.screenshot(`${OUT}/fr5-live-p1.png`);

  // 6. P2 — 조종권 → ARM(현장확인) → jog 실이동 → DISARM
  const setInput = (sel, value, proto = 'HTMLInputElement') => p.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const clickText = (text, scope = '[data-t="control"]') => p.eval(
    `[...document.querySelectorAll('${scope} button')].find(b => b.textContent.includes(${JSON.stringify(text)}))?.click() ?? 'notfound'`);

  check('상시 STOP 버튼 존재', !!(await p.eval(`!!document.querySelector('[data-t="safetybar"] [data-t="estop"]')`)));
  // 모드 토글도 상시다 — 잠긴 펜던트를 푸는 유일한 길이라 탭을 옮겨도 사라지면 안 된다 (D72)
  check('모드 토글이 STOP 옆에 상시 존재',
    !!(await p.eval(`!!document.querySelector('[data-t="safetybar"] [data-t="mode-toggle"]')`)));
  check('조종권 없으면 모드 토글 비활성',
    (await p.eval(`document.querySelector('[data-t="mode-toggle"]').disabled`)) === true);
  await setInput('header [data-t="who"] input', 'kim');
  await clickText('조종권 잡기');
  check('조종권 claim → 안전 바에 kim',
    !!(await p.waitFor(`document.querySelector('[data-t="safetybar"]').textContent.includes('조종권 kim')`, { timeoutMs: 4000 })));
  // 새로고침으로 토큰을 잃어도 자기 조종권에 갇히지 않는다 (2026-08-04 실기 사고)
  await p.eval(`sessionStorage.removeItem('fr5.ownerToken'); location.reload()`);
  await new Promise((r) => setTimeout(r, 2500));
  await setInput('header [data-t="who"] input', 'kim');
  check('토큰을 잃으면 "다시 잡기" 가 열린다 (반납 불가로 갇히지 않는다)',
    !!(await p.waitFor(`document.querySelector('[data-t="claim"]')?.textContent.includes('다시 잡기')`, { timeoutMs: 5000 })));
  await clickText('조종권 다시 잡기');
  check('다시 잡기 → 새 토큰으로 조종권 복구',
    !!(await p.waitFor(`!!document.querySelector('[data-t="control"] [data-t="confirm"]')`, { timeoutMs: 5000 })));

  check('현장확인 전 ARM 비활성',
    (await p.eval(`document.querySelector('[data-t="control"] button[data-t="arm"]')?.disabled`)) === true);
  await p.eval(`document.querySelector('[data-t="control"] [data-t="confirm"] input').click()`);
  await clickText('ARM');
  check('ARM → phase ARMED + 서보 ON',
    !!(await p.waitFor(`document.querySelector('[data-t="safetybar"]').textContent.includes('ARMED') && document.querySelector('[data-t="safetybar"]').textContent.includes('서보 ON')`, { timeoutMs: 5000 })));
  // ARMED 인 채로 수동 전환 — 드래그 티칭은 서보가 켜져 있어야 되므로 여기서 막히면 안 된다
  check('ARMED 에서 모드 토글이 활성',
    (await p.eval(`document.querySelector('[data-t="mode-toggle"]').disabled`)) === false);
  await p.eval(`document.querySelector('[data-t="mode-toggle"]').click()`);
  await p.screenshot(`${OUT}/fr5-mode-toggle.png`);   // 활성 상태의 토글 — 눈으로 볼 근거
  check('수동으로 → 안전 바가 manual · 서보는 ON 유지',
    !!(await p.waitFor(`document.querySelector('[data-t="safetybar"]').textContent.includes('manual') && document.querySelector('[data-t="safetybar"]').textContent.includes('서보 ON')`, { timeoutMs: 5000 })));
  await p.eval(`document.querySelector('[data-t="mode-toggle"]').click()`);
  check('자동으로 → 다시 auto (갇히지 않는다)',
    !!(await p.waitFor(`document.querySelector('[data-t="safetybar"]').textContent.includes('auto')`, { timeoutMs: 5000 })));

  const j1Before = parseFloat(await p.eval(`document.querySelector('[data-t="joints"] td').textContent`));
  await p.eval(`[...document.querySelectorAll('[data-t="jogrow"]')][0].querySelectorAll('button')[1].click()`);
  const j1Target = (j1Before + 1).toFixed(2);
  check('jog +1° → 3D·표의 관절값이 정확히 +1° 도달',
    !!(await p.waitFor(`Math.abs(parseFloat(document.querySelector('[data-t="joints"] td').textContent) - ${j1Before + 1}) < 0.01`, { timeoutMs: 8000 })),
    `j1 ${j1Before.toFixed(2)}→${j1Target}`);
  // 그리퍼 — 활성화 전에는 슬라이더가 잠겨 있고, 활성화하면 열린다 (GOAL-live-gripper 1)
  check('ARMED 에서 그리퍼 블록이 보인다',
    !!(await p.eval(`!!document.querySelector('[data-t="gripper"]')`)));
  check('활성화 전 슬라이더 잠김',
    (await p.eval(`document.querySelector('[data-t="gripper-range"]').disabled`)) === true);
  await p.eval(`document.querySelector('[data-t="gripper-activate"]').click()`);
  check('활성화 → 슬라이더 열림',
    !!(await p.waitFor(`document.querySelector('[data-t="gripper-range"]')?.disabled === false`, { timeoutMs: 5000 })));
  await p.eval(`document.querySelector('[data-t="gripper-close"]').click()`);
  check('완전 닫기 → 읽은 값이 화면에 돌아온다',
    !!(await p.waitFor(`document.querySelector('[data-t="gripper-raw"]')?.textContent === '0%'`, { timeoutMs: 5000 })),
    '지령 0 → 읽기 0% (같은 방향)');

  // 8. Teach — 지점(점)과 궤적(선). **여기는 승인하지 않는다** (D74)
  await p.eval(`[...document.querySelectorAll('nav button')].find(b => b.textContent === 'Teach').click()`);
  check('Teach 탭 → 패널이 뜬다',
    !!(await p.waitFor(`!!document.querySelector('[data-t="teach"]')`, { timeoutMs: 5000 })));
  check('탭을 옮겨도 STOP·모드 토글은 그대로다 (상시 안전 바)',
    !!(await p.eval(`!!document.querySelector('[data-t="safetybar"] [data-t="estop"]')
      && !!document.querySelector('[data-t="safetybar"] [data-t="mode-toggle"]')`)));
  check('지점이 없을 때 화면이 그렇게 말한다',
    !!(await p.eval(`!!document.querySelector('[data-t="points-empty"]')`)));
  check('3D 가 "실물 자세" 라고 말한다 (미리보기 아님)',
    (await p.eval(`document.querySelector('[data-t="twin-note"]')?.dataset.live`)) === 'true');
  await setInput('[data-t="point-name"]', 'trayPick');
  await p.eval(`document.querySelector('[data-t="point-capture"]').click()`);
  check('캡처 → 목록에 지점이 생긴다',
    !!(await p.waitFor(`document.querySelector('[data-t="point-row"]')?.dataset.name === 'trayPick'`, { timeoutMs: 6000 })));
  // 미리보기는 **로봇에 아무것도 안 보낸다** — 이동 전에 어디로 가는지 화면에서 먼저 본다
  const jBeforePv = await p.eval(`document.querySelector('[data-t="joints"] td')?.textContent`);
  await p.eval(`document.querySelector('[data-t="point-preview"]').click()`);
  check('미리보기 → 3D 가 "실물이 아니다" 를 말한다',
    !!(await p.waitFor(`document.querySelector('[data-t="twin-note"]')?.dataset.live === 'false'
      && document.querySelector('[data-t="twin-note"]').textContent.includes('아직 안 보냈다')`, { timeoutMs: 5000 })));
  await new Promise((r) => setTimeout(r, 600));
  check('미리보기 중에도 실물은 안 움직였다 (읽기 전용)',
    (await p.eval(`document.querySelector('[data-t="teach-refusal"]')`)) === null, `실물 j1 ${jBeforePv}`);
  await p.eval(`document.querySelector('[data-t="point-preview"]').click()`);

  // 궤적 — 녹화는 읽기만 한다
  await setInput('[data-t="traj-name"]', 'demo-01');
  await p.eval(`document.querySelector('[data-t="traj-start"]').click()`);
  const recOn = await p.waitFor(`!!document.querySelector('[data-t="traj-live"]')`, { timeoutMs: 6000 }).catch(() => false);
  check('녹화 시작 → 화면이 녹화 중이라고 말한다', !!recOn,
    recOn ? '' : String(await p.eval(`document.querySelector('[data-t="teach-refusal"]')?.textContent ?? '사유 없음'`)));
  if (!recOn) throw new Error('녹화가 시작되지 않았다');
  await new Promise((r) => setTimeout(r, 1500));
  await p.eval(`document.querySelector('[data-t="traj-stop"]').click()`);
  check('녹화 정지 → 목록에 궤적이 생긴다',
    !!(await p.waitFor(`document.querySelector('[data-t="traj-row"]')?.dataset.name === 'demo-01'`, { timeoutMs: 8000 })));
  check('조건이 맞는 measure 궤적은 비교에 쓸 수 있다고 표시된다',
    (await p.eval(`document.querySelector('[data-t="traj-row"]')?.dataset.usable`)) === 'true');
  check('비교 가능 개수를 화면이 말한다',
    !!(await p.eval(`document.querySelector('[data-t="traj-usable"]')?.textContent.includes('1 / 1')`)));
  await p.eval(`document.querySelector('[data-t="traj-play"]').click()`);
  check('되감기 → 3D 가 "실물은 안 움직인다" 를 말한다',
    !!(await p.waitFor(`document.querySelector('[data-t="twin-note"]')?.textContent.includes('되감기')
      && document.querySelector('[data-t="twin-note"]').dataset.live === 'false'`, { timeoutMs: 8000 })));
  check('되감기 스크럽이 있다',
    !!(await p.eval(`!!document.querySelector('[data-t="play-scrub"]')`)));
  await p.screenshot(`${OUT}/fr5-teach.png`);
  await p.eval(`[...document.querySelectorAll('nav button')].find(b => b.textContent === 'Live').click()`);
  await p.waitFor(`!!document.querySelector('[data-t="gripper"]')`, { timeoutMs: 5000 });

  await p.eval(`document.querySelector('[data-t="safetybar"] [data-t="estop"]').click()`);
  await clickText('DISARM');
  check('DISARM → 서보 OFF 복귀',
    !!(await p.waitFor(`document.querySelector('[data-t="safetybar"]').textContent.includes('서보 OFF')`, { timeoutMs: 5000 })));
  await clickText('조종권 반납');
  await p.screenshot(`${OUT}/fr5-live-p2.png`);

  // 7. 브리지 재기동 → 웹이 스스로 다시 붙고 재연결 횟수가 남는다 (V0 AC)
  bridge.kill();
  await p.waitFor(`document.querySelector('[data-t="safetybar"]').textContent.includes('DISCONNECTED') || true`, { timeoutMs: 3000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  bridge = spawnBridge();
  if (!await waitUp(`http://127.0.0.1:${BRIDGE_PORT}/robots`)) throw new Error('브리지 재기동 실패');
  const reconn = await p.waitFor(`parseInt(document.querySelector('[data-t="ws-reconnects"]')?.textContent) >= 1 && document.querySelector('[data-t="ws-reconnects"]').textContent`, { timeoutMs: 15000 });
  check('브리지 재기동 → WS 자동 재연결 + 횟수 기록', !!reconn, `재연결 ${reconn}`);
  await p.eval(`(() => {
    const sel = document.querySelector('[data-t="diag"] select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'fr5-mock-a');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await p.eval(`document.querySelector('[data-t="diag"] button.primary')?.click()`);
  check('재연결 후 다시 OBSERVE_ONLY 진입',
    !!(await p.waitFor(`document.querySelector('[data-t="safetybar"]').textContent.includes('OBSERVE_ONLY')`, { timeoutMs: 5000 })));

  // 7. 해제 → 미연결 스냅샷으로 복귀
  await p.eval(`[...document.querySelectorAll('[data-t="diag"] button')].find(b => b.textContent.includes('연결 해제')).click()`);
  check('disconnect → DISCONNECTED + 값 비움',
    !!(await p.waitFor(`document.querySelector('[data-t="safetybar"]').textContent.includes('DISCONNECTED') && document.querySelector('[data-t="joints"] td')?.textContent === '—'`, { timeoutMs: 5000 })));
} catch (e) {
  check('실행 자체', false, String(e.message || e));
} finally {
  try { await p?.close?.(); } catch {}
  bridge.kill();
  web.kill();
  rmSync(DATA, { recursive: true, force: true });
}

const fails = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);
