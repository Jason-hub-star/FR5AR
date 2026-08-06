// 결정 로그 회전 — `DECISION-LOG-CURRENT.md` 가 초과선을 넘으면 **오래된 것부터** 본문으로 옮긴다.
//
// D18 이 금지한 것은 "**조용히** 옮기는 것" 이다 — *"스크립트가 조용히 옮기면 다음 세션이
// 못 찾는다. 처방은 출력에 적히고 실행은 사람이 한다."* 그래서 이 스크립트는
//
//   · 게이트가 아니다. `all.sh` 가 안 부른다. **사람이 부를 때만 돈다**
//   · 목차 행을 본문 목차로 **같이 옮긴다** — 옮긴 뒤에도 D번호로 찾아진다
//   · 무엇을 옮겼는지 한 줄씩 찍는다
//   · **옮기기 전후로 D번호 집합과 각 절의 본문이 같은지 스스로 확인한다.**
//     하나라도 어긋나면 아무것도 쓰지 않고 죽는다 — 결정을 잃는 것이 D18 의 진짜 두려움이다
//
// 손으로 두 파일을 오려 붙이는 것보다 이쪽이 안전하다. 사람이 하면 목차 행을 빼먹는다
// (실제로 2026-08-07 에 D76 을 절만 넣고 목차를 빼먹은 채로 발견됐다).
//
// 실행: node scripts/dev/rotate-decisions.mjs            무엇이 옮겨질지 보여주기만 한다
//       node scripts/dev/rotate-decisions.mjs --write    실제로 옮긴다

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CUR = join(ROOT, 'docs/status/DECISION-LOG-CURRENT.md');
const LOG = join(ROOT, 'docs/status/DECISION-LOG.md');
const WRITE = process.argv.includes('--write');
/** `scripts/check/docs-weight.sh` 의 `CAP_DOC_H`. 바뀌면 여기도 바꾼다 */
const LIMIT = 450;

const die = (m) => { console.error(`중단 — ${m}`); process.exit(1); };

/** `## Dn.` 로 시작하는 절들을 통째로 잘라낸다. 본문은 **한 글자도 안 고친다.** */
function sections(text) {
  const lines = text.split('\n');
  const at = [];
  lines.forEach((l, i) => { if (/^##\s*D\d+\./.test(l)) at.push(i); });
  return at.map((start, k) => ({
    n: Number(lines[start].match(/^##\s*D(\d+)\./)[1]),
    start,
    end: k + 1 < at.length ? at[k + 1] : lines.length,
    body: lines.slice(start, k + 1 < at.length ? at[k + 1] : lines.length).join('\n'),
  }));
}

/** 목차 표의 `| D61 | … |` 행. 표가 여러 개여도 D번호 행만 고른다. */
const tocRowOf = (lines, n) => lines.findIndex((l) => new RegExp(`^\\|\\s*D${n}\\s*\\|`).test(l));

const curText = readFileSync(CUR, 'utf8');
const logText = readFileSync(LOG, 'utf8');
const curSecs = sections(curText);
const logSecs = sections(logText);
if (!curSecs.length) die('CURRENT 에 `## Dn.` 절이 하나도 없다');

// 목차에 있는데 절이 없거나, 절이 있는데 목차에 없는 것을 먼저 잡는다 — 회전보다 이게 먼저다
const curLines = curText.split('\n');
const orphan = curSecs.filter((s) => tocRowOf(curLines, s.n) < 0).map((s) => `D${s.n}`);
if (orphan.length) {
  console.log(`⚠ 목차에 없는 절: ${orphan.join(', ')} — 목차 행을 먼저 넣어야 옮길 때 같이 간다`);
}

const over = curLines.length - LIMIT;
if (over <= 0) {
  console.log(`CURRENT ${curLines.length}줄 — 초과선 ${LIMIT} 아래다. 옮길 것 없음.`);
  process.exit(0);
}

// **오래된 것부터.** D번호가 작을수록 오래된 결정이다 — 판단이 안 들어가야 자동화가 안전하다.
const move = [];
let freed = 0;
for (const s of [...curSecs].sort((a, b) => a.n - b.n)) {
  if (freed >= over) break;
  move.push(s);
  freed += s.end - s.start;
}
if (freed < over) die(`전부 옮겨도 ${over}줄을 못 줄인다 — 손으로 볼 일이다`);

console.log(`CURRENT ${curLines.length}줄 → 초과 ${over}줄. 옮길 것 ${move.length}건:`);
for (const s of move) console.log(`  D${s.n}  ${s.end - s.start}줄  ${s.body.split('\n')[0].slice(3, 70)}`);
console.log(`남는 줄수: ${curLines.length - freed}`);
if (!WRITE) { console.log('\n(보여주기만 했다. 실제로 옮기려면 --write)'); process.exit(0); }

// ── 옮긴다. 절과 목차 행을 **같이** 뗀다.
let outCur = curLines.slice();
const carried = [];
for (const s of [...move].sort((a, b) => b.start - a.start)) {   // 뒤에서부터 잘라야 인덱스가 안 밀린다
  const row = tocRowOf(outCur, s.n);
  carried.push({ n: s.n, body: s.body, row: row >= 0 ? outCur[row] : null });
  outCur.splice(s.start, s.end - s.start);
  if (row >= 0) outCur.splice(row < s.start ? row : row - (s.end - s.start), 1);
}

// 본문 쪽 — 목차 표 끝에 행을 넣고, 절은 문서 끝에 붙인다 (본문은 D번호 순이 아니라 붙인 순이다)
let outLog = logText.split('\n');
const lastTocRow = outLog.reduce((acc, l, i) => (/^\|\s*D\d+\s*\|/.test(l) ? i : acc), -1);
if (lastTocRow < 0) die('DECISION-LOG.md 에서 목차 표를 못 찾았다');
const rows = carried.filter((c) => c.row).map((c) => c.row);
outLog.splice(lastTocRow + 1, 0, ...rows);
for (const c of [...carried].sort((a, b) => a.n - b.n)) {
  if (outLog[outLog.length - 1].trim() !== '') outLog.push('');
  outLog.push(c.body.replace(/\n+$/, ''), '');
}

// ── 스스로 확인한다. **여기서 어긋나면 아무것도 안 쓴다.**
const after = [...sections(outCur.join('\n')), ...sections(outLog.join('\n'))];
const before = [...curSecs, ...logSecs];
const key = (s) => s.n;
const setB = new Set(before.map(key));
const setA = new Set(after.map(key));
if (setB.size !== setA.size || [...setB].some((n) => !setA.has(n))) {
  die(`D번호 집합이 달라졌다 — 이전 ${setB.size}건 / 이후 ${setA.size}건`);
}
for (const s of move) {
  const found = after.find((x) => x.n === s.n);
  if (!found || found.body.replace(/\n+$/, '') !== s.body.replace(/\n+$/, '')) {
    die(`D${s.n} 본문이 옮기는 중에 바뀌었다`);
  }
}
// **중복은 "늘었는가" 로 본다.** "정확히 1건" 으로 재면 이미 있던 번호 충돌(D42 가 서로 다른
// 두 결정에 붙어 있다 · 2026-08-07 발견)이 상관없는 회전까지 막는다. 우리가 고칠 것은
// 우리가 만든 중복뿐이고, 남의 결함은 GAP 으로 보고할 일이지 여기서 죽을 일이 아니다.
const dup = (list) => list.reduce((m, s) => m.set(s.n, (m.get(s.n) ?? 0) + 1), new Map());
const [dB, dA] = [dup(before), dup(after)];
for (const n of setB) {
  if ((dA.get(n) ?? 0) > (dB.get(n) ?? 0)) die(`D${n} 을 옮기다 사본이 늘었다`);
}

writeFileSync(CUR, outCur.join('\n'));
writeFileSync(LOG, outLog.join('\n'));
console.log(`\n옮겼다. D번호 ${setB.size}건 전부 살아 있고 본문도 그대로다.`);
console.log('`bash scripts/check/docs-weight.sh` 로 확인해라.');
