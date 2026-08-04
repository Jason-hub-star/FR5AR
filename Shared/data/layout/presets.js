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

// **방을 크게 잡았다** — AMR 2대가 실제로 돌아다니려면 통로가 있어야 한다. 12m × 8m.
const FLOOR = { widthMm: 12000, depthMm: 8000, heightMm: 3000 };

const arm = (x, y) => ({ model: 'FR5', basePosMm: [x, y, 900], baseYawDeg: 0, reachMm: 922 });

const AMR = (id, dock, waypointsMm) => ({
  id, model: 'TurtleBot', reachMm: 380, dockPosMm: dock, waypointsMm,
});

// ─────────────────────────────────────────────────────────────────────────────
// 빈 방 — 벽과 문만. 새 배치안의 기본값이다.
// ─────────────────────────────────────────────────────────────────────────────
const empty = () => ({
  floor: FLOOR,
  doors: [{ id: 'door-1', wall: 'south', atMm: 6000, widthMm: 1800, heightMm: 2200 }],
  windows: [],
  props: [],
  stations: [],
  amrs: [],
  arm: arm(2400, 6000),
});

// ─────────────────────────────────────────────────────────────────────────────
// 중앙 셀 — 평면도 그대로. **팔이 가운데, 배출은 동쪽, 공급은 서쪽.**
//
//   서쪽 문 2개(공급 A·B) → AMR 이 도킹존까지 → 팔이 받는다 → 컨베이어가 동쪽으로 뺀다
//
// 도킹존은 팔 기준 **±120°·1.4m** 다 (평면도의 각도). 남북으로 갈라 놨기 때문에
// AMR 두 대의 경로가 **한 점도 안 만난다** — 교착 표식이 안 뜬다.
// ─────────────────────────────────────────────────────────────────────────────
const cell = () => ({
  floor: FLOOR,
  doors: [
    { id: 'door-1', wall: 'south', atMm: 6000, widthMm: 1800, heightMm: 2200 },
    { id: 'door-2', wall: 'west',  atMm: 5800, widthMm: 1200, heightMm: 2100 },  // 공급 A
    { id: 'door-3', wall: 'west',  atMm: 2200, widthMm: 1200, heightMm: 2100 },  // 공급 B
  ],
  windows: [
    { id: 'win-1', wall: 'east', atMm: 1400, widthMm: 1600, heightMm: 1300, sillMm: 900 },
    { id: 'win-2', wall: 'east', atMm: 6600, widthMm: 1600, heightMm: 1300, sillMm: 900 },
  ],
  arm: arm(6000, 4000),

  // 셀 안 3점은 전부 팔에서 650mm — 도달 여유 272mm. `store` 만 **일부러** 안 닿는다.
  stations: [
    { id: 'in',   name: '탄두 고정 · 해체', posMm: [6000, 4650, 900], prop: 'chuck', rotDeg: 180 },
    { id: 'meas', name: '신관 분류',        posMm: [5350, 4000, 900], prop: 'partTray', rotDeg: 180,
      opts: { wMm: 640, dMm: 440, cols: 5, rows: 3 } },
    { id: 'out',  name: '배출 이송',        posMm: [6650, 4000, 900], prop: 'partTray', rotDeg: 180,
      opts: { wMm: 700, dMm: 480, cols: 6, rows: 4, filled: 9 } },
    // 벽 쪽 — 팔이 못 닿아 AMR 이나 사람이 나른다. **이 한 줄이 AMR 이 있는 이유다.**
    { id: 'store', name: '배출 보관대', posMm: [11700, 6600, 0], prop: 'shelf', rotDeg: -90 },
  ],

  props: [
    // ── 가운데 섬. 팔이 이 위에 선다 (z=900)
    { id: 'island', type: 'benchRun', posMm: [6000, 4200], rotDeg: 0,
      opts: { lengthMm: 2600, dMm: 1400 } },
    // ── 배출 컨베이어 — 섬 동쪽 끝(x=7300)에 붙어 동쪽 벽까지
    { id: 'convOut', type: 'conveyor', posMm: [9300, 4000], rotDeg: 0,
      opts: { lengthMm: 3800, wMm: 620 } },
    { id: 'wh1', type: 'warhead', posMm: [8200, 4000, 900], rotDeg: 0 },
    { id: 'wh2', type: 'warhead', posMm: [9600, 4000, 900], rotDeg: 0 },
    { id: 'outRack', type: 'shelf', posMm: [11700, 4000], rotDeg: -90, opts: { wMm: 1200 } },
    // ── 셀 경계. **허리 높이라 셀을 안 가린다** — 높이면 시연 화면이 벽만 보인다
    { id: 'bwN', type: 'blastWall', posMm: [6000, 5600], rotDeg: 0, opts: { lengthMm: 3600 } },
    { id: 'bwS', type: 'blastWall', posMm: [6000, 2400], rotDeg: 0, opts: { lengthMm: 3600 } },
    // ── 공급 대기 (서쪽 문 옆). **문 앞은 비운다** — AMR 이 지나간다
    { id: 'supA', type: 'shelf', posMm: [500, 7100], rotDeg: 90, opts: { wMm: 1400 } },
    { id: 'supB', type: 'shelf', posMm: [500, 900],  rotDeg: 90, opts: { wMm: 1400 } },
    // ── 북쪽 벽 — 부품 랙
    { id: 'runN', type: 'benchRun',    posMm: [6000, 7620], rotDeg: 180, opts: { lengthMm: 5000 } },
    { id: 'wcN',  type: 'wallCabinet', posMm: [6000, 7820], rotDeg: 180, opts: { lengthMm: 4600, open: true } },
    // ── 남쪽 벽 — 관제·계측 (문 x=5100~6900 을 피한다)
    { id: 'runS',  type: 'benchRun',    posMm: [3000, 380], rotDeg: 0, opts: { lengthMm: 2600, dMm: 650 } },
    { id: 'ws1',   type: 'workstation', posMm: [3000, 380, 900], rotDeg: 0 },
    { id: 'runS2', type: 'benchRun',    posMm: [9200, 380], rotDeg: 0, opts: { lengthMm: 2400, dMm: 650 } },
    { id: 'inst1', type: 'instrument',  posMm: [9200, 380, 900], rotDeg: 0 },
  ],

  amrs: [
    // 도킹 자리는 **셀 서쪽 열린 바닥**이다. 팔 바로 옆(±120°·1.4m)에 붙였더니
    // 작업대·격벽 뒤에 파묻혀 화면에서 안 보이고 고를 수도 없었다 (2026-08-04 실렌더).
    AMR('amr1', [3800, 5400], [[400, 5800], [1900, 5700], [3800, 5400]]),
    AMR('amr2', [3800, 2600], [[400, 2200], [1900, 2300], [3800, 2600]]),
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// 비교 A · B — **팔 위치 하나만 다르다.** 여러 개를 동시에 바꾸면 처리량이 달라져도
// 무엇 때문인지 모른다. 손계산으로 검증한 값이다 (도달 922mm 기준):
//   A(x=2400): 투입 650 ○ · 계측 650 ○ · 배출 1950 ✗
//   B(x=3700): 투입 1950 ✗ · 계측 650 ○ · 배출 650 ○
// → **고정 팔 하나로는 실험실 전체를 못 덮는다.** 그게 이 프로젝트의 논점이다.
// ─────────────────────────────────────────────────────────────────────────────
const SIDE_DOORS = [
  { id: 'door-1', wall: 'south', atMm: 6000, widthMm: 1800, heightMm: 2200 },
  { id: 'door-2', wall: 'east',  atMm: 6800, widthMm: 1100, heightMm: 2100 },
];
const SIDE_WINDOWS = [
  { id: 'win-1', wall: 'west', atMm: 1600, widthMm: 1600, heightMm: 1300, sillMm: 900 },
  { id: 'win-2', wall: 'west', atMm: 3600, widthMm: 1600, heightMm: 1300, sillMm: 900 },
  { id: 'win-3', wall: 'east', atMm: 1400, widthMm: 1400, heightMm: 1300, sillMm: 900 },
];

// 해체 4단계 (D51) — **id 는 그대로 둔다.** AMR 경유점이 이 id 가 가리키는 자리로 간다.
const SIDE_STATIONS = [
  { id: 'in',   name: '탄두 고정 · 해체', posMm: [1750, 6000, 900], prop: 'chuck', rotDeg: 180 },
  { id: 'meas', name: '신관 분류',        posMm: [3050, 6000, 900], prop: 'partTray', rotDeg: 180,
    opts: { wMm: 640, dMm: 440, cols: 5, rows: 3 } },
  { id: 'out',  name: '비무장화 배출',    posMm: [4350, 6000, 900], prop: 'partTray', rotDeg: 180,
    opts: { wMm: 700, dMm: 480, cols: 6, rows: 4, filled: 9 } },
  { id: 'store', name: '보관 선반', posMm: [10800, 6600, 0], prop: 'shelf', rotDeg: -90 },
];

const SIDE_PROPS = [
  { id: 'conv1', type: 'conveyor',  posMm: [1750, 3400],      rotDeg: 90, opts: { lengthMm: 2600, wMm: 620 } },
  { id: 'wh1',   type: 'warhead',   posMm: [1750, 2400, 900], rotDeg: 90 },
  { id: 'wh2',   type: 'warhead',   posMm: [1750, 3100, 900], rotDeg: 90 },
  { id: 'wh3',   type: 'warhead',   posMm: [1750, 3800, 900], rotDeg: 90, opts: { stage: 1 } },
  { id: 'bw1',   type: 'blastWall', posMm: [3050, 4900],      rotDeg: 0,  opts: { lengthMm: 3800, hMm: 1200 } },
  { id: 'bw2',   type: 'blastWall', posMm: [900, 6100],       rotDeg: 90, opts: { lengthMm: 2300, hMm: 2200, windowMm: 1100 } },
  { id: 'runCell', type: 'benchRun', posMm: [3050, 6100],     rotDeg: 180, opts: { lengthMm: 3900, dMm: 750 } },
  { id: 'runN1', type: 'benchRun',    posMm: [2600, 7620],       rotDeg: 180, opts: { lengthMm: 4400, sink: true } },
  { id: 'wcN1',  type: 'wallCabinet', posMm: [2600, 7820],       rotDeg: 180, opts: { lengthMm: 4000, open: true } },
  { id: 'trN1',  type: 'partTray',    posMm: [1900, 7550, 900],  rotDeg: 180, opts: { filled: 7 } },
  { id: 'iso1',  type: 'isolator',    posMm: [7600, 7500],       rotDeg: 180 },
  { id: 'runN2', type: 'benchRun',    posMm: [10000, 7620],      rotDeg: 180, opts: { lengthMm: 2600 } },
  { id: 'wcN2',  type: 'wallCabinet', posMm: [10000, 7820],      rotDeg: 180, opts: { lengthMm: 2400 } },
  { id: 'runW',  type: 'benchRun',    posMm: [380, 4000],        rotDeg: 90, opts: { lengthMm: 3000, dMm: 650 } },
  { id: 'ws1',   type: 'workstation', posMm: [380, 3400, 900],   rotDeg: 90 },
  { id: 'in1',   type: 'instrument',  posMm: [380, 4900, 900],   rotDeg: 90 },
  { id: 'sh1',   type: 'shelf',       posMm: [280, 6400],        rotDeg: 90 },
  { id: 'runE',  type: 'benchRun',    posMm: [11620, 3200],      rotDeg: -90, opts: { lengthMm: 3200 } },
  { id: 'wcE',   type: 'wallCabinet', posMm: [11820, 3200],      rotDeg: -90, opts: { lengthMm: 2800, open: true } },
  { id: 'ws2',   type: 'workstation', posMm: [11620, 2400, 900], rotDeg: -90 },
  { id: 'sh2',   type: 'shelf',       posMm: [11700, 5400],      rotDeg: -90 },
];

const ENTRY = [6000, 500];   // AMR 은 **입구에서 시작**한다 — 어디서 들어오는지가 보여야 한다

const side = (armX, waypoints) => () => ({
  floor: FLOOR,
  doors: SIDE_DOORS,
  windows: SIDE_WINDOWS,
  arm: arm(armX, 6000),
  stations: SIDE_STATIONS,
  props: SIDE_PROPS,
  amrs: [AMR('amr1', ENTRY, waypoints[0]), AMR('amr2', ENTRY, waypoints[1])],
});

/** 팔레트의 `새로 ▾` 에 뜨는 순서 = 이 배열 순서. */
export const PRESETS = [
  { id: 'empty', label: '빈 방',
    hint: '벽과 문만 — 팔레트로 짓는다', build: empty },
  { id: 'cell', label: '중앙 셀 · 배출 컨베이어',
    hint: '팔이 가운데 · 컨베이어가 동쪽 배출 · AMR 2대가 서쪽 공급', build: cell },
  { id: 'compareA', label: '비교 A — 팔을 투입 쪽에',
    hint: '벽을 따라 늘어선 라인. 배출은 AMR 이 나른다',
    build: side(2400, [
      [ENTRY, [4200, 2400], [2600, 4300], [1750, 5100], [3050, 5100]],
      [ENTRY, [8200, 2400], [9200, 4600], [5300, 4300], [4350, 5100]],
    ]) },
  { id: 'compareB', label: '비교 B — 팔을 배출 쪽에',
    hint: 'A 와 팔 위치 하나만 다르다',
    build: side(3700, [
      [ENTRY, [3400, 2600], [1750, 4600], [1750, 5100], [3050, 5100]],
      [ENTRY, [9200, 2600], [10600, 5200], [5300, 4300], [4350, 5100]],
    ]) },
];

export const DEFAULT_PRESET = 'empty';

/** 프리셋 하나를 **완전한 배치안**으로. 꺼낸 뒤로는 그냥 씬이라 프리셋과 인연이 끊긴다 (D56). */
export function buildPreset(presetId = DEFAULT_PRESET, id = presetId, name) {
  const p = PRESETS.find((x) => x.id === presetId) ?? PRESETS[0];
  return { ...emptyLayout(id, name ?? p.label), ...structuredClone(p.build()) };
}
