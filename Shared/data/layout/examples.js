// 예시 배치안 A·B — **비교하려면 둘이 있어야 한다.**
//
// 이 숫자들은 **가정이다.** 실험실 실측 치수가 나오면 바꾼다
// (`SHARED-CORE.md` §아직 안 정해진 것). 지금은 화면을 세우는 것이 목적이다.
//
// **A 와 B 의 차이는 팔 위치 하나뿐이다.** 여러 개를 동시에 바꾸면
// 처리량이 달라져도 무엇 때문인지 모른다 — 한 변수만 움직인다.
//
// 손계산으로 검증한 값이다 (도달 922mm 기준):
//   A(팔 x=2400): 투입 650 ○ · 계측 650 ○ · 배출 1950 ✗ · 보관 3116 ✗
//   B(팔 x=3700): 투입 1950 ✗ · 계측 650 ○ · 배출 650 ○ · 보관 1965 ✗
// → **고정 팔 하나로는 실험실 전체를 못 덮는다.** 그래서 AMR 이 있는 것이고,
//   그게 이 프로젝트의 논점이다.

import { emptyLayout } from './schema.js';

// **방을 크게 잡았다** — AMR 2대가 실제로 돌아다니려면 통로가 있어야 한다.
// 12m × 8m. 장비는 벽을 따라 붙이고 **가운데를 비운다** — 그 빈 바닥이 AMR 통로다.
const FLOOR = { widthMm: 12000, depthMm: 8000, heightMm: 3000 };

// **입구.** 없으면 AMR 이 어디서 들어오는지 설명이 안 된다.
// 남쪽 벽 가운데 양개문 폭 1800 — 터틀봇 2대가 교행할 수 있는 폭이다.
// 창 — 레퍼런스에 있던 것. 벽면이 비면 창고로 보인다.
const WINDOWS = [
  { wall: 'west', atMm: 1600, widthMm: 1600, heightMm: 1300, sillMm: 900 },
  { wall: 'west', atMm: 3600, widthMm: 1600, heightMm: 1300, sillMm: 900 },
  { wall: 'east', atMm: 1400, widthMm: 1400, heightMm: 1300, sillMm: 900 },
];

const DOORS = [
  { wall: 'south', atMm: 6000, widthMm: 1800, heightMm: 2200 },
  { wall: 'east',  atMm: 6800, widthMm: 1100, heightMm: 2100 },   // 부속실 통용문
];

// 작업 셀 — **닿는 것은 셀 안, 안 닿는 것은 벽 쪽.** 그 대비가 배치 실험의 전부다.
// `prop` 이 있으면 그 형태로 그린다. 회색 박스는 더 이상 쓰지 않는다.
const STATIONS = [
  { id: 'in',   name: '시료 투입', posMm: [1750, 6000, 900], prop: 'instrument', rotDeg: 180 },
  { id: 'meas', name: '계측기',   posMm: [3050, 6000, 900], prop: 'instrument', rotDeg: 180,
    opts: { wMm: 800, dMm: 650, hMm: 700 } },
  // 벽 쪽 — 팔이 못 닿아 AMR 이 나른다
  { id: 'out',   name: '배출대',   posMm: [4350, 6000, 900], prop: 'instrument', rotDeg: 180,
    opts: { wMm: 700, dMm: 600, hMm: 500 } },
  { id: 'store', name: '보관 선반', posMm: [10800, 6600], prop: 'shelf', rotDeg: -90 },
];

// 내부 부품 — **형태는 여기 없다. 이름과 자리만 있다** (형태는 `Shared/view3d/props/`).
// 벽을 따라 배치해 가운데를 비운다.
const PROPS = [
  // 북쪽 벽 — **연속 벤치 열 + 상부장**이 실험실 벽면의 기본이다 (레퍼런스 대조)
  { id: 'runN1', type: 'benchRun',    posMm: [2600, 7620],       rotDeg: 180, opts: { lengthMm: 4400, sink: true } },
  { id: 'wcN1',  type: 'wallCabinet', posMm: [2600, 7820],       rotDeg: 180, opts: { lengthMm: 4000, open: true } },
  { id: 'clN1',  type: 'clutter',     posMm: [2600, 7500],       rotDeg: 180, opts: { lengthMm: 4000, seed: 3 } },
  { id: 'hood1', type: 'fumehood',    posMm: [5600, 7550],       rotDeg: 180 },
  { id: 'iso1',  type: 'isolator',    posMm: [7600, 7500],       rotDeg: 180 },
  { id: 'runN2', type: 'benchRun',    posMm: [10000, 7620],      rotDeg: 180, opts: { lengthMm: 2600 } },
  { id: 'wcN2',  type: 'wallCabinet', posMm: [10000, 7820],      rotDeg: 180, opts: { lengthMm: 2400 } },
  { id: 'clN2',  type: 'clutter',     posMm: [10000, 7500],      rotDeg: 180, opts: { lengthMm: 2200, seed: 7 } },
  // 서쪽 벽 — 사무 자리
  { id: 'runW',  type: 'benchRun',    posMm: [380, 4000],        rotDeg: 90, opts: { lengthMm: 3000, dMm: 650 } },
  { id: 'ws1',   type: 'workstation', posMm: [380, 3400, 900],   rotDeg: 90 },
  { id: 'ch1',   type: 'chair',       posMm: [1150, 3400],       rotDeg: 90 },
  { id: 'in1',   type: 'instrument',  posMm: [380, 4900, 900],   rotDeg: 90 },
  { id: 'sh1',   type: 'shelf',       posMm: [280, 6400],        rotDeg: 90 },
  // 동쪽 벽
  { id: 'runE',  type: 'benchRun',    posMm: [11620, 3200],      rotDeg: -90, opts: { lengthMm: 3200 } },
  { id: 'wcE',   type: 'wallCabinet', posMm: [11820, 3200],      rotDeg: -90, opts: { lengthMm: 2800, open: true } },
  { id: 'ws2',   type: 'workstation', posMm: [11620, 2400, 900], rotDeg: -90 },
  { id: 'ch2',   type: 'chair',       posMm: [10850, 2400],      rotDeg: -90 },
  { id: 'sh2',   type: 'shelf',       posMm: [11700, 5400],      rotDeg: -90 },
];

const AMR = (id, dock, waypointsMm) => ({
  id, model: 'TurtleBot', reachMm: 380, dockPosMm: dock, waypointsMm,
});

// AMR 경로는 **입구(남쪽 x=6000)에서 시작**한다 — 어디서 들어오는지가 보여야 한다.
const ENTRY = [6000, 500];

/** A — 팔을 투입 쪽에. 투입·계측에 닿고 배출·보관은 AMR 이 나른다. */
export const LAYOUT_A = {
  ...emptyLayout('A', 'A — 팔을 투입 쪽에'),
  floor: FLOOR,
  doors: DOORS,
  windows: WINDOWS,
  arm: { ...emptyLayout().arm, basePosMm: [2400, 6000, 900] },
  stations: STATIONS,
  props: PROPS,
  amrs: [
    AMR('amr1', ENTRY, [ENTRY, [4200, 2400], [2600, 4300], [1750, 5100], [3050, 5100]]),
    AMR('amr2', ENTRY, [ENTRY, [8200, 2400], [9200, 4600], [5300, 4300], [4350, 5100]]),
  ],
};

/** B — 팔을 배출 쪽에. 계측·배출에 닿고 투입은 AMR 이 나른다. */
export const LAYOUT_B = {
  ...emptyLayout('B', 'B — 팔을 배출 쪽에'),
  floor: FLOOR,
  doors: DOORS,
  windows: WINDOWS,
  arm: { ...emptyLayout().arm, basePosMm: [3700, 6000, 900] },
  stations: STATIONS,
  props: PROPS,
  amrs: [
    AMR('amr1', ENTRY, [ENTRY, [3400, 2600], [1750, 4600], [1750, 5100], [3050, 5100]]),
    AMR('amr2', ENTRY, [ENTRY, [9200, 2600], [10600, 5200], [5300, 4300], [4350, 5100]]),
  ],
};

export const EXAMPLES = { A: LAYOUT_A, B: LAYOUT_B };
