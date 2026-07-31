// 수동 검증용 — all.sh 가 자동으로 돌리지 않는다 (.sh 아님). dev 서버(:5175) 필요.
// P1 골격 실렌더 검증 — 탭 3개 + 조종권→슬롯→이동→estop 왕복. ground truth 로만 판정한다.
import { openPage, pixelChanged } from '/Users/family/jason/FR5Web/.claude/skills/검증/references/cdp-harness.mjs';

const URL = 'http://localhost:5175/';
const OUT = process.env.TB_VERIFY_OUT ?? '/tmp';
const results = [];
const check = (name, ok, detail = '') => { results.push([ok ? 'PASS' : 'FAIL', name, detail]); };
const clickByText = (text, sel = 'button') =>
  `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.textContent.includes(${JSON.stringify(text)}))?.click() ?? 'notfound'`;

const p = await openPage(URL, { port: 9340, windowSize: '1280,900' });
try {
  await p.waitFor(`window.TB_TABS?.length === 3`);
  await p.setLocalStorage('tb-who', 'kim');
  await p.navigate(URL);
  await p.waitFor(`window.TB_TABS?.length === 3`);

  // 1. 골격
  check('탭 3개 노출', (await p.eval(`window.TB_TABS.join(',')`)) === 'drive,mapping,runs');
  check('adapter=mock 배지', (await p.eval(`document.querySelector('.source')?.textContent`)) === 'adapter:mock');
  check('로봇 카드 2개', (await p.eval(`document.querySelectorAll('.robot-card').length`)) === 2);
  check('맵 캔버스 존재', await p.eval(`!!document.querySelector('.mapview canvas')`));

  // 2. 조종권 claim
  await p.eval(clickByText('내가 claim'));
  const ownerShown = await p.waitFor(`document.body.textContent.includes('소유자 kim')`, { timeoutMs: 3000 });
  check('조종권 claim → 소유자 kim 표시', !!ownerShown);

  // 3. 슬롯 시작 → 로봇이 실제로 움직인다 (캔버스 픽셀 diff)
  await p.eval(clickByText('patrol', '.slot-card'));
  await p.eval(clickByText('▶ 시작'));
  const modeSlot = await p.waitFor(
    `document.querySelector('.robot-card[aria-selected="true"]')?.textContent.includes('slot')`, { timeoutMs: 3000 });
  check('슬롯 시작 → mode=slot 배지', !!modeSlot);
  const mapRect = await p.rect('.mapview canvas');
  const before = await p.screenshot(null, mapRect);
  await new Promise((r) => setTimeout(r, 2500));
  const after = await p.screenshot(null, mapRect);
  check('로봇 이동 (캔버스 픽셀 변화)', pixelChanged(before, after));
  await p.screenshot(`${OUT}/p1-drive.png`);

  // 4. estop → idle 복귀 + 로그
  await p.eval(clickByText('E-STOP'));
  const idleAgain = await p.waitFor(
    `document.querySelector('.robot-card[aria-selected="true"]')?.textContent.includes('idle')`, { timeoutMs: 3000 });
  check('E-STOP → idle 복귀', !!idleAgain);
  check('E-STOP 로그 흐름', await p.eval(`document.querySelector('.logpanel-body').textContent.includes('E-STOP')`));

  // 5. 규칙 거부 — 조종권 없는 로봇 · 상한 초과 (datasource 경유 ground truth)
  const noOwner = await p.eval(`JSON.stringify(window.tbDatasource.teleop('tb3_2', 100, 0, 'kim'))`);
  check('조종권 없는 teleop 거부', JSON.parse(noOwner).ok === false, noOwner);
  const overCap = await p.eval(`JSON.stringify(window.tbDatasource.teleop('tb3_1', 999, 0, 'kim'))`);
  check('상한 초과 teleop 거부', JSON.parse(overCap).ok === false, overCap);

  // 6. 매핑 탭 — 시작/중단 왕복
  await p.eval(clickByText('매핑', 'nav button'));
  await p.waitFor(`document.body.textContent.includes('매핑 세션')`);
  await p.eval(clickByText('▶ 매핑 시작'));
  const mappingOn = await p.waitFor(`document.body.textContent.includes('mode=mapping')`, { timeoutMs: 3000 });
  check('매핑 시작 → mode=mapping 배지', !!mappingOn);
  check('매핑 중 teleop 수락 (계약 예외)', await p.eval(
    `JSON.stringify(window.tbDatasource.teleop('tb3_1', 100, 0, 'kim'))`).then((r) => JSON.parse(r).ok));
  await p.eval(clickByText('저장 없이 중단'));
  await p.waitFor(`!document.body.textContent.includes('매핑 진행 중')`, { timeoutMs: 3000 });

  // 7. 기록 탭 — estop run 이 남았나 + 상세
  await p.eval(clickByText('기록', 'nav button'));
  await p.waitFor(`document.querySelectorAll('.runs-table tbody tr').length >= 5`);
  const newestBadge = await p.eval(
    `document.querySelector('.runs-table tbody tr .badge')?.textContent`);
  check('estop run 이 목록 최신에 기록됨', newestBadge === 'estop', `최신 배지=${newestBadge}`);
  await p.eval(`document.querySelector('.runs-table tbody tr').click()`);
  const detail = await p.waitFor(`!!document.querySelector('.run-detail')`, { timeoutMs: 3000 });
  check('run 상세 패널 표시', !!detail);
  await p.screenshot(`${OUT}/p1-runs.png`);

  // 8. 콘솔 에러
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
