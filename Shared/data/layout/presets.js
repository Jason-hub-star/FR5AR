// 프리셋 — **빈 방에서 매번 다시 짓지 않게.**
//
// 전에는 `examples.js` 였고 A/B 토글만 이걸 읽었다. 토글을 없애면서 **게이트 말고는
// 아무도 안 읽는 데이터**가 됐다 — 그래서 프리셋으로 바꿨다. 팔레트의 `새로 ▾` 가
// 여기서 배치안을 꺼낸다. 꺼낸 뒤로는 그냥 씬이라 마음대로 고친다.
//
// 이 숫자들은 **가정이다.** 실험실 실측이 나오면 바꾼다 (`SHARED-CORE.md` §아직 안 정해진 것).
//
// **눈으로 안 맞춘다** — `scripts/check/layout.sh` 가 프리셋마다 스키마·부품 이름·도달·
// **3D 겹침**을 본다. 겹침 검사가 없으면 가구가 서로 파묻혀도 화면은 멀쩡해 보인다.

import { emptyLayout } from './schema.js';

// 조립 라인은 **9:16 세로 방**이다 — 컨베이어가 한 줄로 방을 관통해 밖으로 나가야 하고,
// 정사각에 가까운 방에서는 그 줄이 안 선다. 6750 : 12000 = 9 : 16 (정확히).
const LINE_FLOOR = { widthMm: 6750, depthMm: 12000, heightMm: 3000 };

// 실물이 있는 팔은 **FR5 하나뿐이다** (`SHARED-CORE.md` §arms). 이송팔은 화면에만 있다.
const fr5 = (id, x, y, yaw = 0, z = 900) => ({
  id, model: 'FR5', role: 'process', basePosMm: [x, y, z], baseYawDeg: yaw, reachMm: 922,
});

const AMR = (id, dock, waypointsMm) => ({
  id, model: 'TurtleBot', reachMm: 380, dockPosMm: dock, waypointsMm,
});

// ─────────────────────────────────────────────────────────────────────────────
// 빈 방 — 벽과 문만. 새 배치안의 기본값이다.
// ─────────────────────────────────────────────────────────────────────────────
// **빈 방도 9:16 이다.** 가로 방을 기본으로 두면 거기서 라인을 짓다가 긴 축이 반대인 걸
// 나중에야 안다 (2026-08-04에 실제로 그랬다). 무대가 하나면 방 모양도 하나다.
const empty = () => ({
  floor: LINE_FLOOR,
  doors: [{ id: 'door-1', wall: 'south', atMm: 6000, widthMm: 1800, heightMm: 2200 }],
  windows: [],
  props: [],
  stations: [],
  amrs: [],
  arms: [fr5('fr5', 2400, 6000)],
});

// ─────────────────────────────────────────────────────────────────────────────
// 조립 라인 — **주인님의 맵 1 을 정본으로 삼는다** (2026-08-04 · `Downloads/1.json`).
//
//   남(y=0)                                                        북(y=12000)
//   ┌ 벽 ────────────────────────────────────────────── 개구부 ─┐
//   │ [팔레트W]▸fr5b▸ ▁▂▃램프 ◂fr5c◂[팔레트E]
//   │            ═══ convA ═══[리프터 ◀ fr5a ◀ 신관트레이]═ convB ═▶ 밖
//   └─────────────────────────────────────────────────────────────┘
//
// 맵 1 에서 **그대로 가져온 것** — 방 치수 · 컨베이어 두 줄 · 격벽 · 비콘 · 크레인 ·
// 벽 가구 · 작업자 · **`partTray` + 받침 벤치를 조립 팔 옆에 둔 것**(808mm, 정확히 닿는다).
//
// **고친 것은 넷** — 맵 1 그대로는 사이클이 안 돌았다:
//   ① 팔 셋 중 아무도 팔레트에 안 닿았다 (1237·1432mm) → **팔레트를 팔 쪽으로 당겼다**
//   ② 아무도 투입 컨베이어에 안 닿았다 (1332·1462mm) → 램프 위 투입구를 양 팔 사이에
//   ③ 스테이션이 `load`·`lift` 둘뿐이라 재생이 못 돌았다 → `pile`·`fuze`·`ship`·`exit` 신설
//   ④ 탄두 3발이 **같은 점**에 겹쳐 있었다 → 재생기가 작업물을 그리므로 뺐다
// ─────────────────────────────────────────────────────────────────────────────
const LINE_X = 3375;          // 컨베이어·리프터·개구부가 전부 이 x 위에 선다
const LIFT_Y = 6000;          // 조립 자리 (맵 1 그대로)
const LIFT_Z = 1050;          // 들어 올린 탄두 축 높이
const FEED_Y = 900;           // 투입 팔 두 대가 서는 줄

const cell = () => ({
  floor: LINE_FLOOR,
  doors: [
    { id: 'exit', wall: 'north', atMm: LINE_X, widthMm: 1100, heightMm: 1600, sillMm: 700 },
    { id: 'door-1', wall: 'south', atMm: 1400, widthMm: 1800, heightMm: 2200 },
    { id: 'door-2', wall: 'west',  atMm: 1800, widthMm: 1200, heightMm: 2100 },
  ],
  windows: [
    { id: 'win-1', wall: 'east', atMm: 4200, widthMm: 1600, heightMm: 1300, sillMm: 900 },
    { id: 'win-2', wall: 'east', atMm: 7800, widthMm: 1600, heightMm: 1300, sillMm: 900 },
    { id: 'win-3', wall: 'west', atMm: 8600, widthMm: 1600, heightMm: 1300, sillMm: 900 },
  ],

  // **역할이 셋이 아니라 둘이다** — 투입 두 대(양옆에서 램프에 올린다) · 조립 한 대.
  // 자리는 맵 1 의 것을 살렸고, 닿는 거리는 전부 3D 로 재서 맞췄다 (여유 90~117mm).
  arms: [
    fr5('fr5a', 2595, LIFT_Y, 0, 850),        // 조립 — 리프터 805 · 신관 트레이 808
    fr5('fr5b', 2600, FEED_Y, 90, 700),       // 투입(서) — 팔레트 825 · 투입구 831
    fr5('fr5c', 4150, FEED_Y, 90, 700),       // 투입(동) — 팔레트 825 · 투입구 831
  ],

  stations: [
    { id: 'pile', name: '탄체 팔레트', posMm: [1800, FEED_Y, 500],
      prop: 'ammoPallet', baseMm: 0, rotDeg: 90 },
    { id: 'load', name: '투입 (램프)', posMm: [LINE_X, FEED_Y, 400] },
    { id: 'lift', name: '리프터 · 공중 고정', posMm: [LINE_X, LIFT_Y, LIFT_Z],
      prop: 'lifter', baseMm: 0, opts: { wMm: 700, liftMm: LIFT_Z } },
    // 맵 1 의 `partTray-1` 자리를 그대로 쓴다 — 조립 팔에서 808mm
    { id: 'fuze', name: '신관 트레이', posMm: [2700, 5200, 900],
      prop: 'partTray', rotDeg: 0, opts: { wMm: 560, dMm: 380, cols: 4, rows: 3 } },
    { id: 'ship', name: '배출 시작', posMm: [LINE_X, 7200, 900] },
    { id: 'exit', name: '실험실 밖으로', posMm: [LINE_X, 11200, 900] },
  ],

  props: [
    // ── 컨베이어 두 줄 — **맵 1 그대로**
    { id: 'convA', type: 'conveyor', posMm: [LINE_X, 2900], rotDeg: 90,
      opts: { lengthMm: 4800, wMm: 620, rampMm: 2600, dropMm: 620 } },
    { id: 'convB', type: 'conveyor', posMm: [LINE_X, 9100], rotDeg: 90,
      opts: { lengthMm: 4800, wMm: 620 } },
    { id: 'whIn1', type: 'warhead', posMm: [LINE_X, 2000, 470], rotDeg: 90, opts: { stage: 3 } },
    { id: 'whIn2', type: 'warhead', posMm: [LINE_X, 3600, 810], rotDeg: 90, opts: { stage: 3 } },
    { id: 'whOut', type: 'warhead', posMm: [LINE_X, 10200, 900], rotDeg: 90 },
    // ── 신관 트레이 받침 (맵 1 의 `bench-1`)
    { id: 'fuzeBench', type: 'bench', posMm: [2700, 5200], rotDeg: 90,
      opts: { wMm: 1000, dMm: 600, hMm: 900 } },
    // ── 여분 팔레트 (AMR 이 채워 놓는 자리) — 동쪽 투입 팔이 여기서 집는다
    { id: 'palE', type: 'ammoPallet', posMm: [4950, FEED_Y], rotDeg: 90, opts: { rows: 1 } },
    // ── 갠트리 크레인 — 리프터(6000) ↔ 배출 시작(7200) 을 다 덮는다
    { id: 'crane', type: 'crane', posMm: [LINE_X, 6600], rotDeg: 0,
      opts: { lengthMm: 5400, dMm: 3400, baseMm: 2050, hookDropMm: 900, trolleyAtMm: 0 } },
    // ── 셀 경계 · 경고 (맵 1 그대로)
    { id: 'bwW', type: 'blastWall', posMm: [1450, LIFT_Y], rotDeg: 90,
      opts: { lengthMm: 3200, hMm: 2000, windowMm: 1800 } },
    { id: 'bwE', type: 'blastWall', posMm: [5300, LIFT_Y], rotDeg: 90, opts: { lengthMm: 3200 } },
    { id: 'bcnW', type: 'beacon', posMm: [1750, 4700], rotDeg: 0 },
    { id: 'bcnE', type: 'beacon', posMm: [5000, 4700], rotDeg: 0 },
    // ── 벽 가구 · 작업자 (맵 1 그대로)
    { id: 'op1',  type: 'worker',      posMm: [1800, 8800], rotDeg: -90 },
    { id: 'runW', type: 'benchRun',    posMm: [325, 9900], rotDeg: 90, opts: { lengthMm: 3000, dMm: 650 } },
    { id: 'ws1',  type: 'workstation', posMm: [400, 10600, 900], rotDeg: 90 },
    { id: 'in1',  type: 'instrument',  posMm: [325, 9100, 900], rotDeg: 90 },
    { id: 'runE', type: 'benchRun',    posMm: [6400, 9600], rotDeg: -90, opts: { lengthMm: 3200 } },
    { id: 'ws2',  type: 'workstation', posMm: [6420, 9600, 900], rotDeg: -90 },
  ],

  // **경로가 시나리오를 실제로 섬긴다.** 전에는 `amr1` 의 경로가 목적지 `pile` 에서 1664mm
  // 빗나가 있었다 — 재생이 경로를 안 보고 직선으로 갔기 때문에 아무도 몰랐다 (2026-08-04).
  // `scripts/check/timeline.sh` 가 이제 그 거리를 잰다.
  //
  // 경로는 **도킹 자리에서 시작해 목적지 옆에서 끝난다** — 팔레트 위로 올라가지 않는다.
  amrs: [
    AMR('amr1', [700, 2500], [[700, 2500], [1000, 1900], [1800, 1500], [1800, 1200]]),
    AMR('amr2', [6000, 2700], [[6000, 2700], [5600, 900], [4950, 900]]),
  ],
});

// **비교 A·B 는 지웠다** (2026-08-04). 해체 시절 무대라 스테이션 이름이 조립 시나리오와
// 달라 **재생이 아무것도 안 했다** — 게이트가 `legacy` 로 표시해 두고 있던 것이다.
//
// 배치안 A·B 비교(F8)는 없어지지 않는다. **조립 라인을 복제해 팔 위치만 바꾸면** 되고,
// 그편이 낫다 — 둘 다 같은 시나리오가 돌아 사이클 타임을 실제로 견줄 수 있다.
// 옛 무대는 한쪽만 돌아서 애초에 비교가 성립하지 않았다.

/** 팔레트의 `새로 ▾` 에 뜨는 순서 = 이 배열 순서. */
export const PRESETS = [
  { id: 'empty', label: '빈 방',
    hint: '벽과 문만 — 팔레트로 짓는다', build: empty },
  { id: 'cell', label: '조립 라인 · 일직선 (9:16)',
    hint: '팔레트→컨베이어→리프터에서 신관 결합→크레인이 배출로. FR5 2대가 투입·조립을 나눈다',
    build: cell },
];

export const DEFAULT_PRESET = 'empty';

/** 프리셋 하나를 **완전한 배치안**으로. 꺼낸 뒤로는 그냥 씬이라 프리셋과 인연이 끊긴다 (D56). */
export function buildPreset(presetId = DEFAULT_PRESET, id = presetId, name) {
  const p = PRESETS.find((x) => x.id === presetId) ?? PRESETS[0];
  return { ...emptyLayout(id, name ?? p.label), ...structuredClone(p.build()) };
}
