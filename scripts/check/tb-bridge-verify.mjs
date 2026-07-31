// 수동 검증용 — tb-bridge(:5055)+dev(:5175) 필요. bash scripts/dev/tb-dev.sh 후 실행.
// P2 왕복 검증 — 웹(http.js) ↔ tb-bridge ↔ mock 어댑터 + 진짜 슬롯 프로세스.
import { openPage, pixelChanged } from '/Users/family/jason/FR5Web/.claude/skills/검증/references/cdp-harness.mjs';

const URL = 'http://localhost:5175/';
const OUT = process.env.TB_VERIFY_OUT ?? '/tmp';
const results = [];
const check = (name, ok, detail = '') => { results.push([ok ? 'PASS' : 'FAIL', name, detail]); };
const clickByText = (text, sel = 'button') =>
  `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.textContent.includes(${JSON.stringify(text)}))?.click() ?? 'notfound'`;
const logHas = (text) =>
  `document.querySelector('.logpanel-body')?.textContent.includes(${JSON.stringify(text)})`;

const p = await openPage(URL, { port: 9342, windowSize: '1280,900' });
try {
  await p.waitFor(`window.TB_TABS?.length === 3`);
  await p.setLocalStorage('tb-who', 'kim');
  await p.navigate(URL);
  await p.waitFor(`window.TB_TABS?.length === 3`);

  // 1. 브리지 연결 — 배지가 상태의 adapter(mock)를 보여준다
  const badge = await p.waitFor(`document.querySelector('.source')?.textContent === 'adapter:mock' && 'adapter:mock'`, { timeoutMs: 5000 });
  check('WS 상태 수신 → 배지 adapter:mock (브리지 정본)', badge === 'adapter:mock');
  check('로봇 카드 2개 (브리지 config 기준)', (await p.eval(`document.querySelectorAll('.robot-card').length`)) === 2);
  check('로그 백로그 수신 (500줄 버퍼)', await p.waitFor(`document.querySelectorAll('.logline').length > 0`, { timeoutMs: 5000 }) !== null);

  // 2. 조종권 — REST 왕복
  await p.eval(clickByText('내가 claim'));
  check('claim → 소유자 kim', !!(await p.waitFor(`document.body.textContent.includes('소유자 kim')`, { timeoutMs: 4000 })));

  // 3. 슬롯 시작 — 진짜 파이썬 프로세스 stdout 이 로그로 흐른다
  await p.eval(clickByText('example_patrol', '.slot-card'));
  await p.eval(clickByText('▶ 시작'));
  check('mode=slot 배지', !!(await p.waitFor(`document.querySelector('.robot-card[aria-selected="true"]')?.textContent.includes('slot')`, { timeoutMs: 4000 })));
  check('슬롯 stdout → 로그 (patrol 시작)', !!(await p.waitFor(logHas('patrol 시작 — robot=tb3_1'), { timeoutMs: 5000 })));
  check('spawn 로그 (pid)', await p.eval(logHas('pid=')));
  const mapRect = await p.rect('.mapview canvas');
  const before = await p.screenshot(null, mapRect);
  await new Promise((r) => setTimeout(r, 2500));
  check('로봇 이동 (mock 어댑터 · 픽셀 diff)', pixelChanged(before, await p.screenshot(null, mapRect)));
  await p.screenshot(`${OUT}/p2-drive.png`);

  // 4. estop → 프로세스 SIGTERM · idle · run=estop
  await p.eval(clickByText('E-STOP'));
  check('estop → idle', !!(await p.waitFor(`document.querySelector('.robot-card[aria-selected="true"]')?.textContent.includes('idle')`, { timeoutMs: 8000 })));
  check('슬롯 프로세스 SIGTERM 정리 로그', !!(await p.waitFor(logHas('SIGTERM — 정리하고 종료해요'), { timeoutMs: 8000 })));

  // 5. 거부 사유가 로그로 온다 (WS 거부 응답 → 로그 패널)
  await p.eval(`window.tbDatasource.teleop('tb3_2', 100, 0, 'kim')`);
  check('조종권 없는 teleop → 사유 로그', !!(await p.waitFor(logHas('조종권이 없어요'), { timeoutMs: 4000 })));
  await p.eval(`window.tbDatasource.teleop('tb3_1', 999, 0, 'kim')`);
  check('상한 초과 → 사유 로그', !!(await p.waitFor(logHas('상한 초과'), { timeoutMs: 4000 })));

  // 6. 매핑 → 저장 → 맵 슬롯 등장
  await p.eval(clickByText('매핑', 'nav button'));
  await p.waitFor(`document.body.textContent.includes('매핑 세션')`);
  await p.eval(clickByText('▶ 매핑 시작'));
  check('mapping 시작 (202 비동기)', !!(await p.waitFor(`document.body.textContent.includes('mode=mapping')`, { timeoutMs: 5000 })));
  await p.eval(`(() => {
    const input = document.querySelector('.side input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'lab-p2'); input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await p.eval(clickByText('현재 지도를 저장'));
  check('맵 저장 로그', !!(await p.waitFor(logHas('map saved — lab-p2'), { timeoutMs: 5000 })));
  const mapsJson = await p.eval(`fetch('/api/maps').then(r => r.json()).then(m => JSON.stringify(m))`);
  check('맵 슬롯 등재 + mapToLab 메타', JSON.parse(mapsJson).some((m) => m.name === 'lab-p2' && m.mapToLab), mapsJson);

  // 7. 기록 — estop run + 1Hz 경로 + travelMm 자동.
  // 슬롯은 SIGTERM 후 잔여 sleep(≤2s)을 마치고 종료한다 — 종료 확정을 먼저 기다린다 (계약 §슬롯).
  const finalized = await p.waitFor(
    `fetch('/api/runs').then(r => r.json()).then(rs => rs[0]?.result === 'estop')`, { timeoutMs: 10000 });
  check('estop run 으로 마감됨 (프로세스 종료 → result 매핑)', !!finalized);
  await p.eval(clickByText('기록', 'nav button'));
  await p.waitFor(`document.querySelectorAll('.runs-table tbody tr').length >= 1`);
  const rowInfo = await p.eval(`JSON.stringify({
    rows: document.querySelectorAll('.runs-table tbody tr').length,
    badge: document.querySelector('.runs-table tbody tr .badge')?.textContent,
    firstRow: document.querySelector('.runs-table tbody tr')?.textContent,
  })`);
  check('estop run 최신 등재', JSON.parse(rowInfo).badge === 'estop', rowInfo);
  const run = JSON.parse(await p.eval(`fetch('/api/runs').then(r => r.json()).then(rs => JSON.stringify(rs[0]))`));
  check('run.metrics.travelMm 자동 기입', Number.isFinite(run?.metrics?.travelMm), JSON.stringify(run?.metrics));
  const realPath = JSON.parse(await p.eval(`fetch('/api/runs/${run.id}/path').then(r => r.json()).then(x => JSON.stringify(x))`));
  check('1Hz 경로 샘플 ≥ 2', Array.isArray(realPath) && realPath.length >= 2, `${realPath.length}점`);
  await p.eval(`document.querySelector('.runs-table tbody tr').click()`);
  check('run 상세', !!(await p.waitFor(`!!document.querySelector('.run-detail')`, { timeoutMs: 3000 })));
  await p.screenshot(`${OUT}/p2-runs.png`);

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
