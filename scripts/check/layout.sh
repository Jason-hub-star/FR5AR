#!/usr/bin/env bash
# 배치안 게이트 — 출하 예제가 스키마를 지키고, 부품 이름이 실제로 존재하는지.
#
# 왜 있나 — `validateLayout()` 이 저장소에 있는데 **아무도 안 불렀다.** 그래서
# `store.posMm` 이 2개짜리인 채로 계속 실패하고 있었고 (2026-08-03 발견),
# 소품 이름을 바꿔도 배치안이 조용히 빈 자리로 남았다.
# 실패하면 exit 1.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "== 배치안 =="
node --input-type=module -e "
import { EXAMPLES } from './Shared/data/layout/examples.js';
import { validateLayout, reachCheck } from './Shared/data/layout/schema.js';
import { PROPS } from './Shared/view3d/parts.js';
import { CATALOG, CATEGORIES, PROP_CARDS, cardKey } from './Shared/data/layout/catalog.js';

let fail = 0;
const note = (s) => console.log('  ' + s);
const bad  = (s) => { console.log('  FAIL  ' + s); fail = 1; };

for (const [k, L] of Object.entries(EXAMPLES)) {
  const errs = validateLayout(L);
  if (Array.isArray(errs) && errs.length) errs.forEach((e) => bad(k + ': ' + e));
  else note(k + ': 스키마 OK');

  // **모르는 부품 이름은 화면에서 조용히 빈 자리가 된다.** 경고만 나오고 앱은 안 죽는다.
  for (const p of L.props ?? []) {
    if (!PROPS[p.type]) bad(k + ': 없는 부품 type — ' + p.id + ' → ' + p.type);
  }
  for (const s of L.stations ?? []) {
    if (s.prop && !PROPS[s.prop]) bad(k + ': 없는 스테이션 prop — ' + s.id + ' → ' + s.prop);
  }
  note(k + ': 부품 ' + (L.props?.length ?? 0) + ' · 스테이션 ' + (L.stations?.length ?? 0) + ' 전부 존재');

  // 도달 판정이 **화면과 같은 좌표**로 서는지 — 하나도 안 닿으면 배치가 깨진 것이다
  const r = reachCheck(L);
  const inReach = r.filter((x) => x.inReach).length;
  if (inReach === 0) bad(k + ': 팔이 닿는 스테이션이 하나도 없다');
  else note(k + ': 도달 ' + inReach + '/' + r.length + ' (' + r.map((x) => x.id + (x.inReach ? '○' : '✗')).join(' ') + ')');
}

// 카탈로그 자체 — 규약 두 개는 전 부품이 지켜야 한다.
//
// **설치 높이는 인자로만 올라간다.** 벽걸이(\`wallCabinet.baseMm\`)나 상판 위 잔물건
// (\`clutter.hMm\`)은 기본값이 공중이지만, 그 인자를 0 으로 주면 바닥에 내려와야 한다.
// 코드에 높이를 박아 두면 배치안이 그 부품만 못 옮긴다 (하드 룰 5).
const THREE = await import('three');
const LIFT = { wallCabinet: { baseMm: 0 }, clutter: { hMm: 0 } };
for (const [name, make] of Object.entries(PROPS)) {
  let g;
  try { g = make(LIFT[name] ?? {}); } catch (e) { bad('부품 ' + name + ' 생성 실패: ' + e.message); continue; }
  if (!g.isGroup) { bad('부품 ' + name + ': THREE.Group 이 아니다'); continue; }
  const y = new THREE.Box3().setFromObject(g).min.y;
  if (Math.abs(y) > 1e-6) {
    bad('부품 ' + name + ': 바닥에 안 선다 (y최소 ' + (y * 1000).toFixed(1) + 'mm)'
      + (LIFT[name] ? ' — 설치 높이 인자를 0 으로 줬는데도' : ' — 공중에 뜨려면 설치 높이를 인자로 받아라'));
  }
}
note('부품 ' + Object.keys(PROPS).length + '종 — Group 반환 · 바닥에 선다 (설치 높이는 인자로만)');

// 카탈로그 ↔ 팩토리 **양방향**. 한쪽만 검사하면 반대쪽이 조용히 낡는다 —
// 카탈로그에만 있으면 팔레트가 없는 부품을 내놓고, 팩토리에만 있으면 팔레트에 영영 안 뜬다.
const catIds = new Set(PROP_CARDS.map((c) => c.id));
for (const c of PROP_CARDS) {
  if (!PROPS[c.id]) bad('카탈로그에 있는데 팩토리가 없다 — ' + c.id);
  if (!CATEGORIES.some((g) => g.id === c.category)) bad('없는 분류 — ' + c.id + ' → ' + c.category);
}
for (const name of Object.keys(PROPS)) {
  if (!catIds.has(name)) bad('팩토리에 있는데 카탈로그에 없다 — ' + name + ' (팔레트에 영영 안 뜬다)');
}
const keys = CATALOG.map(cardKey);
if (new Set(keys).size !== keys.length) bad('카탈로그 카드 키가 겹친다 — 같은 id 를 여러 장 두려면 key 를 준다');
note('카탈로그 ' + CATALOG.length + '장(소품 ' + PROP_CARDS.length + ') · 분류 ' + CATEGORIES.length + '개 — 팩토리와 양방향 일치');

console.log('');
console.log(fail ? '배치안 실패' : '배치안 OK');
process.exit(fail);
" 2>&1 | grep -v '^모르는 부품'
exit "${PIPESTATUS[0]}"
