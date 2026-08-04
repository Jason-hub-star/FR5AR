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
import { PRESETS, buildPreset } from './Shared/data/layout/presets.js';
import { validateLayout, reachCheck, crossings } from './Shared/data/layout/schema.js';
import { PROPS, assembleProps } from './Shared/view3d/parts.js';
import { CATALOG, CATEGORIES, PROP_CARDS, cardKey } from './Shared/data/layout/catalog.js';
import * as THREE from 'three';

let fail = 0;
const note = (s) => console.log('  ' + s);
const bad  = (s) => { console.log('  FAIL  ' + s); fail = 1; };

// 겹침 판정은 **맞닿는 것을 허용한다** — 컨베이어를 작업대 끝에 붙이는 건 정상이다.
const TOUCH_M = 0.003;   // 3mm

for (const preset of PRESETS) {
  const k = preset.id;
  const L = buildPreset(k);
  const errs = validateLayout(L);
  if (Array.isArray(errs) && errs.length) errs.forEach((e) => bad(k + ': ' + e));
  else note(k + ': 스키마 OK — ' + preset.label);

  // **모르는 부품 이름은 화면에서 조용히 빈 자리가 된다.** 경고만 나오고 앱은 안 죽는다.
  for (const p of L.props ?? []) {
    if (!PROPS[p.type]) bad(k + ': 없는 부품 type — ' + p.id + ' → ' + p.type);
  }
  for (const s of L.stations ?? []) {
    if (s.prop && !PROPS[s.prop]) bad(k + ': 없는 스테이션 prop — ' + s.id + ' → ' + s.prop);
  }

  // 도달 판정이 **화면과 같은 좌표**로 서는지 — 하나도 안 닿으면 배치가 깨진 것이다
  const r = reachCheck(L);
  const inReach = r.filter((x) => x.inReach).length;
  if (r.length && inReach === 0) bad(k + ': 팔이 닿는 스테이션이 하나도 없다');
  note(k + ': 부품 ' + (L.props?.length ?? 0)
    + ' · 스테이션 ' + r.length
    + (r.length ? ' (도달 ' + inReach + '/' + r.length + ' — ' + r.map((x) => x.id + (x.inReach ? '○' : '✗')).join(' ') + ')' : '')
    + ' · AMR ' + (L.amrs?.length ?? 0) + '대 교착 ' + crossings(L).length + '곳');

  // **가구가 서로 파묻혀도 화면은 멀쩡해 보인다.** 눈으로 안 잡히므로 상자로 잡는다.
  //
  // 판정이 둘로 갈린다 — **바닥에 선 것끼리는 겹치면 안 되고, 올려 놓은 것은
  // 받칠 것 위에 있어야 한다.** 한 잣대로 보면 작업대 위 물건이 전부 겹침으로 잡힌다
  // (벤치 뒷턱이 상판보다 50mm 높아 AABB 가 물린다).
  const items = [
    ...(L.props ?? []),
    ...(L.stations ?? []).filter((s) => s.prop).map((s) => ({ ...s, type: s.prop })),
  ];
  const g = assembleProps(items);
  const boxes = g.children.map((c, i) => ({
    id: items[i].id, type: items[i].type, zMm: items[i].posMm[2] ?? 0,
    box: new THREE.Box3().setFromObject(c).expandByScalar(-TOUCH_M),
  })).filter((b) => !b.box.isEmpty());

  const room = new THREE.Box3(
    new THREE.Vector3(0, 0, -L.floor.depthMm / 1000),
    new THREE.Vector3(L.floor.widthMm / 1000, L.floor.heightMm / 1000, 0),
  ).expandByScalar(TOUCH_M);
  for (const b of boxes) {
    if (!room.containsBox(b.box)) bad(k + ': 방 밖으로 나갔다 — ' + b.id + ' (' + b.type + ')');
  }

  const floor = boxes.filter((b) => !b.zMm);
  for (let i = 0; i < floor.length; i += 1) {
    for (let j = i + 1; j < floor.length; j += 1) {
      if (floor[i].box.intersectsBox(floor[j].box)) {
        bad(k + ': 바닥 부품이 겹친다 — ' + floor[i].id + ' ↔ ' + floor[j].id);
      }
    }
  }

  // 올려 놓은 것 — **평면으로 받침 안에 들어가야 한다.** 안 그러면 공중에 떠 있다.
  const inXZ = (a, b) => a.min.x >= b.min.x && a.max.x <= b.max.x
    && a.min.z >= b.min.z && a.max.z <= b.max.z;
  for (const b of boxes.filter((x) => x.zMm)) {
    if (!floor.some((f) => inXZ(b.box, f.box))) {
      bad(k + ': 받칠 것 없이 떠 있다 — ' + b.id + ' (' + b.type + ' · z=' + b.zMm + 'mm)');
    }
  }
  note(k + ': 상자 ' + boxes.length + '개 (바닥 ' + floor.length + ') — 방 안 · 안 겹침 · 받침 위');
}

// 카탈로그 자체 — 규약 두 개는 전 부품이 지켜야 한다.
//
// **설치 높이는 인자로만 올라간다.** 벽걸이(\`wallCabinet.baseMm\`)나 상판 위 잔물건
// (\`clutter.hMm\`)은 기본값이 공중이지만, 그 인자를 0 으로 주면 바닥에 내려와야 한다.
// 코드에 높이를 박아 두면 배치안이 그 부품만 못 옮긴다 (하드 룰 5).
const LIFT = { wallCabinet: { baseMm: 0 }, clutter: { hMm: 0 } };
for (const [name, make] of Object.entries(PROPS)) {
  let g;
  try { g = make(LIFT[name] ?? {}); } catch (e) { bad('부품 ' + name + ' 생성 실패: ' + e.message); continue; }
  if (!g.isGroup) { bad('부품 ' + name + ': THREE.Group 이 아니다'); continue; }
  // **원점이 발자국 가운데여야 배치안이 부품을 예측대로 놓는다.** 한쪽으로 치우치면
  // 좌표는 작업대 위인데 형태가 밖으로 흘러나온다 (workstation 이 그랬다 · 2026-08-04).
  const bb = new THREE.Box3().setFromObject(g);
  const c = bb.getCenter(new THREE.Vector3());
  const sz = bb.getSize(new THREE.Vector3());
  // `clutter` 만 뺀다 — **흩뿌린 잔물건이라 무게중심이 씨앗마다 다르다.** 규약 위반이 아니다.
  for (const ax of name === 'clutter' ? [] : ['x', 'z']) {
    if (sz[ax] > 1e-6 && Math.abs(c[ax]) / sz[ax] > 0.15) {
      bad('부품 ' + name + ': 원점이 ' + ax + ' 로 치우쳤다 ('
        + Math.round(c[ax] * 1000) + 'mm · 폭의 ' + Math.round((c[ax] / sz[ax]) * 100) + '%)');
    }
  }

  const y = bb.min.y;
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
