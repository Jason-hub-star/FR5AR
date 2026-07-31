// 수동 검증용 — 전 사이클(매핑→저장→활성→주행→녹화→기록). tb-dev.sh 후 실행.
// P3 검증 — 전 사이클: 매핑(live.png 성장) → 저장 → 활성화 → 주행 → 녹화 → 기록.
import { openPage } from '/Users/family/jason/FR5Web/.claude/skills/검증/references/cdp-harness.mjs';

const URL = 'http://localhost:5175/';
const OUT = process.env.TB_VERIFY_OUT ?? '/tmp';
const results = [];
const check = (name, ok, detail = '') => { results.push([ok ? 'PASS' : 'FAIL', name, detail]); };
const clickByText = (text, sel = 'button') =>
  `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.textContent.includes(${JSON.stringify(text)}))?.click() ?? 'notfound'`;
const fetchB64 = `fetch('/api/maps/live.png?robot=tb3_1&raw=' + Math.random())
  .then(r => r.arrayBuffer()).then(b => btoa(String.fromCharCode(...new Uint8Array(b))))`;

const p = await openPage(URL, { port: 9344, windowSize: '1280,900' });
try {
  await p.waitFor(`window.TB_TABS?.length === 3`);
  await p.setLocalStorage('tb-who', 'kim');
  await p.navigate(URL);
  await p.waitFor(`window.TB_TABS?.length === 3`);
  await p.waitFor(`document.querySelector('.source')?.textContent === 'adapter:mock'`, { timeoutMs: 5000 });

  // 1. 조종권 + 매핑 시작
  await p.eval(clickByText('내가 claim'));
  await p.waitFor(`document.body.textContent.includes('소유자 kim')`, { timeoutMs: 4000 });
  await p.eval(clickByText('매핑', 'nav button'));
  await p.waitFor(`document.body.textContent.includes('매핑 세션')`);
  await p.eval(clickByText('▶ 매핑 시작'));
  await p.waitFor(`document.body.textContent.includes('mode=mapping')`, { timeoutMs: 5000 });

  // 2. live.png 가 화면에 로드된다
  const imgLoaded = await p.waitFor(
    `(() => { const i = document.querySelector('img.livemap'); return i && i.complete && i.naturalWidth === 240; })()`,
    { timeoutMs: 6000 });
  check('live.png 화면 로드 (240px 격자)', !!imgLoaded);

  // 3. 매핑 중 teleop 로 몰면 탐색 영역이 자란다 (png 바이트 변화)
  const pngBefore = await p.eval(fetchB64);
  await p.eval(`window.__drive = setInterval(() => window.tbDatasource.teleop('tb3_1', 140, 10, 'kim'), 150)`);
  await new Promise((r) => setTimeout(r, 3000));
  await p.eval(`clearInterval(window.__drive)`);
  const pngAfter = await p.eval(fetchB64);
  check('live.png 성장 (teleop 주행 반영)', pngBefore !== pngAfter, `${pngBefore.length}b → ${pngAfter.length}b`);
  await p.screenshot(`${OUT}/p3-mapping.png`);

  // 4. 저장 → 맵 슬롯 등재
  await p.eval(`(() => {
    const input = document.querySelector('.side input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'lab-p3'); input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await p.eval(clickByText('현재 지도를 저장'));
  await p.waitFor(`document.querySelector('.logpanel-body')?.textContent.includes('map saved — lab-p3')`, { timeoutMs: 5000 });
  const maps = JSON.parse(await p.eval(`fetch('/api/maps').then(r => r.json()).then(m => JSON.stringify(m))`));
  check('맵 슬롯 lab-p3 등재', maps.some((m) => m.name === 'lab-p3'));

  // 5. 주행 탭 — 드롭다운으로 다른 맵 활성화 → nav 재기동 → activeMap 반영
  await p.eval(clickByText('주행', 'nav button'));
  await p.waitFor(`!!document.querySelector('.side select')`);
  await p.eval(`(() => {
    const sel = document.querySelector('.side select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'lab-p3'); sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  check('맵 활성화 → activeMap 배지', !!(await p.waitFor(
    `document.querySelector('.robot-card[aria-selected="true"]')?.textContent.includes('lab-p3')`, { timeoutMs: 5000 })));
  check('nav 재기동 완료 (starting→running)', !!(await p.waitFor(
    `document.body.textContent.includes('nav running')`, { timeoutMs: 5000 })));

  // 6. 슬롯 주행 + rosbag 녹화 → bagPath
  await p.eval(clickByText('example_patrol', '.slot-card'));
  await p.eval(clickByText('▶ 시작'));
  await p.waitFor(`document.querySelector('.robot-card[aria-selected="true"]')?.textContent.includes('slot')`, { timeoutMs: 4000 });
  const recBtn = await p.waitFor(`!([...document.querySelectorAll('button')].find(b => b.textContent.includes('rosbag'))?.disabled) && 'enabled'`, { timeoutMs: 3000 });
  check('rosbag 버튼 — run 진행 중에만 활성', recBtn === 'enabled');
  await p.eval(clickByText('● rosbag'));
  const bagged = await p.waitFor(
    `fetch('/api/runs').then(r => r.json()).then(rs => !!rs[0]?.bagPath)`, { timeoutMs: 5000 });
  check('run 에 bagPath 기록', !!bagged);

  // 7. 정지 → stopped 마감 → 기록 탭에 bag 표시
  await p.eval(clickByText('■ 정지'));
  await p.waitFor(`fetch('/api/runs').then(r => r.json()).then(rs => rs[0]?.result === 'stopped')`, { timeoutMs: 10000 });
  await p.eval(clickByText('기록', 'nav button'));
  // "기록이 없어요" 자리 행도 tr 이다 — 데이터 행(배지 있는 행)을 기다린다
  await p.waitFor(`!!document.querySelector('.runs-table tbody tr .badge')`, { timeoutMs: 6000 });
  const row = await p.eval(`document.querySelector('.runs-table tbody tr')?.textContent`);
  check('기록 최신 = stopped + 맵 lab-p3 + bag ▣', row.includes('stopped') && row.includes('lab-p3') && row.includes('▣'), row);

  check('콘솔 에러 0', p.consoleErrors.length === 0, JSON.stringify(p.consoleErrors.slice(0, 3)));
} finally {
  p.close();
}

let fail = 0;
for (const [v, name, detail] of results) {
  if (v === 'FAIL') fail += 1;
  console.log(`${v}  ${name}${detail ? `  — ${detail}` : ''}`);
}
console.log(fail === 0 ? '\n전체 PASS' : `\nFAIL ${fail}건`);
process.exit(fail === 0 ? 0 : 1);
