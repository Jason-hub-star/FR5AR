// 시나리오 프리셋 — **출하되는 기본값.** 저장소가 비어도 재생이 돈다.
//
// 2026-08-04 까지 이 배열은 `datasource/mock.js` 안 `DEMO_CYCLE` 상수였다. 데이터가 아니라
// 코드라서 고칠 방법도, 배치안마다 다르게 줄 방법도 없었다.
//
// **꺼낸 뒤로는 그냥 시나리오다** — 프리셋을 나중에 고쳐도 이미 만든 것은 안 따라간다
// (배치안의 D56 과 같은 규칙). 저장분이 발밑에서 바뀌는 것보다 낫다.
//
// **게이트는 저장소가 아니라 여기를 본다.** 출하되는 기본값이 성립하는지가 판정 대상이고,
// 저장소는 브라우저마다 다르다 (`timeline.sh` ⑩ · `motion.sh` ⑥ · `scenario.sh`).

import { emptyScenario } from './schema.js';

// 한 사이클 — **1발 조립 = 1사이클** (D51 · D63). 모양은 `SHARED-CORE.md` §1.7.
//
// **좌표가 아니라 스테이션 id** 다. 그래서 배치안을 옮겨도 재생이 따라오고, 같은 사이클을
// 배치안 A·B 에 태워 비교할 수 있다 (F8). 스테이션 id 가 없는 배치안에서는 아무것도 안 움직인다 —
// 그건 정상이고, 화면이 "이 배치안엔 … 스테이션이 없어서 못 돌려요" 라고 말한다.
//
// 실물은 시연 녹화에서 온다 (`GOAL-imitation-demo.md`). **이건 시연용 흉내이고 배지가 그렇게 말한다.**
// **조립이다** (D63) — `stage` 가 **3 → 0** 으로 간다. 빈 케이싱에 신관이 붙어 완성품이 된다.
// 탄두는 리프터에서 안 움직인다: 14~36초가 전부 `lift` 이고 그동안 바뀌는 것은 `stage` 뿐이다.
// 팔 둘의 역할이 갈린다 — `pick`·`feed` 는 투입 팔, `join` 은 조립 팔, `hoist`·`drop` 은 크레인.
const ASSEMBLY_49 = [
  // **AMR 이 먼저 붙는다** — 팔레트를 채우고 나서야 팔이 집을 것이 생긴다.
  // `amr`/`amrAt` 은 작업물과 별개로 흐른다 (`SHARED-CORE.md` §1.5)
  { tSec: 0,  event: 'haul',  station: 'pile', stage: 3, pose: { feed: ['lowIdle', 'lowPile'] } },
  // AMR 은 **시각 0 에 도킹 자리에서 출발해** 여기서 팔레트에 닿는다 (그 사이를 화면이 잇는다)
  { tSec: 4,  event: 'pick',  station: 'pile', amr: 'amr1', amrAt: 'pile', stage: 3, pose: { feed: ['lowPile', 'lowBelt'] }, carry: 'feed' },
  { tSec: 9,  event: 'feed',  station: 'load', stage: 3, pose: { process: ['home', 'home'], feed: ['lowBelt', 'lowIdle'] } },   // 팔이 들고 가 컨베이어에 놓는다
  { tSec: 14, event: 'move',  station: 'lift', stage: 3, pose: { process: ['home', 'approach'], feed: ['lowIdle', 'lowIdle'] } },   // 컨베이어가 리프터까지 나른다
  { tSec: 17, event: 'hold',  station: 'lift', stage: 3, pose: { process: ['approach', 'grip'] } },   // 리프터가 밑에서 받쳐 공중으로
  // **작업물은 리프터에 있고 팔만 트레이로 간다** — `armAt` 이 그 둘을 가른다.
  //
  // **`fetch` 의 자세가 `home` 인 것은 지금 그렇게 돈다는 뜻이지 그게 옳다는 뜻이 아니다.**
  // 옛 전역 표에 `fetch` 칸이 아예 없어서 팔이 대기 자세로 서 있었고, 사건이 자세를 들게
  // 바꾸면서 **그 사실을 그대로 적었다** (2026-08-04). 화면 글자는 "신관을 가지러 간다" 인데
  // 팔은 안 간다 — 이제 이 두 줄만 고치면 된다. 그게 이 구조의 요점이다.
  { tSec: 20, event: 'fetch', station: 'lift', armAt: 'fuze', stage: 3, pose: { process: ['home', 'home'] } },
  { tSec: 24, event: 'join',  station: 'lift', stage: 2, pose: { process: ['grip', 'unscrew'] } },   // 가져와 결합
  { tSec: 28, event: 'fetch', station: 'lift', armAt: 'fuze', stage: 2, pose: { process: ['home', 'home'] } },
  { tSec: 32, event: 'join',  station: 'lift', stage: 1, pose: { process: ['grip', 'unscrew'] } },
  { tSec: 36, event: 'join',  station: 'lift', stage: 0, pose: { process: ['grip', 'unscrew'] } },   // 완성
  { tSec: 39, event: 'hoist', station: 'lift', stage: 0, pose: { process: ['retreat', 'home'] } },   // 크레인이 든다
  { tSec: 43, event: 'drop',  station: 'ship', stage: 0, pose: { process: ['home', 'home'] } },   // 배출 컨베이어에 내려놓는다
  { tSec: 49, event: 'out',   station: 'exit', stage: 0, pose: { process: ['home', 'home'] } },   // 실험실 밖으로
];

/** 드롭다운의 `새로 ▾` 에 뜨는 순서 = 이 배열 순서. */
export const SCENARIO_PRESETS = [
  { id: 'assembly49', label: '조립 라인 · 49초',
    hint: 'AMR 투입 → 컨베이어 → 리프터에서 신관 3번 결합 → 크레인이 배출로',
    build: () => ASSEMBLY_49.map((e) => ({ ...e })) },
];

export const DEFAULT_SCENARIO = 'assembly49';

/** 프리셋 하나를 **완전한 시나리오**로. 꺼낸 뒤로는 프리셋과 인연이 끊긴다. */
export function buildScenario(presetId = DEFAULT_SCENARIO, id = presetId, name) {
  const p = SCENARIO_PRESETS.find((x) => x.id === presetId) ?? SCENARIO_PRESETS[0];
  return { ...emptyScenario(id, name ?? p.label), events: p.build() };
}
