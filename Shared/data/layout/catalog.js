// 부품 카탈로그 — **팔레트가 무엇을 보여줄지의 SSOT.**
//
// 형태는 `Shared/view3d/parts.js` 에, **이름·분류는 여기**에 있다.
// 렌더링이 없으므로 `data/` 에 산다 (`BUILD-VITE.md` §Shared 는 두 층이다).
//
// **새 부품 = 여기 한 줄.** 팔레트도 게이트도 이 배열에서 파생하므로,
// 목록을 두 곳에 적으면 반드시 한 곳이 낡는다.
//
// `scripts/check/layout.sh` 가 **양방향으로** 검사한다 —
// 카탈로그에 있는데 팩토리가 없거나, 팩토리가 있는데 카탈로그에 없으면 실패한다.

/** 팔레트 표시 순서 = 배열 순서. 빈 분류는 팔레트가 자동으로 숨긴다. */
export const CATEGORIES = [
  { id: 'shell',  label: '방 껍데기' },
  { id: 'line',   label: '해체 라인' },
  { id: 'safety', label: '안전' },
  { id: 'bench',  label: '작업대·보관' },
  { id: 'equip',  label: '장비' },
  { id: 'work',   label: '작업물' },
];

/**
 * `id` 는 `PROPS` 의 키와 **같아야 한다** (게이트가 강제).
 *
 * - `label`  화면에 보이는 이름. 한국어
 * - `hint`   카드 아래 한 줄. 없으면 생략
 * - `opts`   놓을 때 쓸 기본 인자. 없으면 팩토리 기본값
 * - `mount`  `'floor'`(기본) · `'wall'`(벽에 건다) · `'bench'`(작업대 위)
 *            — 놓는 높이가 다르다. 팔레트가 배지로 알려준다
 * - `status` `'legacy'` 면 팔레트에 안 뜬다. **지우지 않는 이유** — 옛 배치안이
 *            그 이름을 들고 있으면 화면이 빈 자리가 된다
 * - `kind`   `'prop'`(기본) · `'door'` · `'window'` — **데이터가 사는 곳이 다르다.**
 *            소품은 `layout.props`, 문·창은 `layout.doors`/`windows` 이고 벽에 구멍을 뚫는다.
 *            그래서 끌어서 못 옮기고 **어느 벽 · 벽 위 몇 mm** 로 고친다
 */
export const CATALOG = [
  // ── 방 껍데기. 벽은 `floor` 치수에서 자동으로 나오므로 팔레트에 없다.
  { id: 'door',   label: '문',   category: 'shell', kind: 'door',
    hint: '벽에 구멍 · 유리 두 짝', opts: { widthMm: 1200, heightMm: 2100 } },
  { id: 'window', label: '창',   category: 'shell', kind: 'window',
    hint: '벽 위쪽 · 아래는 벽이 남는다', opts: { widthMm: 1600, heightMm: 1300, sillMm: 900 } },

  // ── 해체 라인 (D51)
  { id: 'conveyor',  label: '컨베이어',    category: 'line', hint: '롤러 이송 · 1사이클의 입구' },
  { id: 'chuck',     label: '회전 척',     category: 'line', mount: 'bench', hint: '탄두를 물고 돌린다' },
  { id: 'partTray',  label: '부품 트레이', category: 'line', mount: 'bench', hint: '분류 단계 산출물' },

  // ── 안전
  { id: 'blastWall',   label: '방폭 격벽', category: 'safety', hint: '기본 허리 높이 — 셀을 안 가린다' },
  { id: 'safetyFence', label: '안전 펜스', category: 'safety', hint: '유리 3면 · 앞은 출입' },

  // ── 작업대·보관
  { id: 'bench',       label: '작업대',   category: 'bench' },
  { id: 'benchRun',    label: '작업대 열', category: 'bench', hint: '길이를 주면 하부장이 반복' },
  { id: 'shelf',       label: '선반',     category: 'bench' },
  { id: 'wallCabinet', label: '상부장',   category: 'bench', mount: 'wall' },

  // ── 장비
  { id: 'isolator',    label: '차폐 부스', category: 'equip', hint: '원격 취급 셀' },
  { id: 'instrument',  label: '검사 장비', category: 'equip' },
  { id: 'workstation', label: '제어반',   category: 'equip', mount: 'bench' },

  // ── 작업물
  { id: 'warhead', label: '탄두 (완성)',    category: 'work', mount: 'bench', opts: { stage: 0 }, hint: '표시용 — 실물은 페트병 (D51)' },
  { id: 'warhead', label: '탄두 (신관 분리)', category: 'work', mount: 'bench', opts: { stage: 2 }, key: 'warhead-s2' },

  // ── 옛 실험실 소품. 해체 라인엔 안 맞아 팔레트에서 숨긴다 (S1)
  { id: 'chair',    label: '의자',   category: 'equip', status: 'legacy' },
  { id: 'clutter',  label: '잔물건', category: 'bench', status: 'legacy', mount: 'bench' },
  { id: 'fumehood', label: '흄후드', category: 'equip', status: 'legacy' },
];

/** 팔레트에 실제로 뜨는 것 — `legacy` 를 뺀 목록. */
export const VISIBLE = CATALOG.filter((c) => c.status !== 'legacy');

/** 소품만 — 게이트가 `PROPS` 와 대조하는 대상. 문·창은 팩토리가 없다. */
export const PROP_CARDS = CATALOG.filter((c) => (c.kind ?? 'prop') === 'prop');

export const kindOf = (c) => c.kind ?? 'prop';

/** 카드 하나를 고유하게 가리키는 값. 같은 `id` 를 옵션만 달리해 여러 장 둘 수 있다. */
export const cardKey = (c) => c.key ?? c.id;

/** 놓을 때의 바닥 높이(mm). `mount` 가 정한다 — 작업대 상판은 900 이다. */
export const BENCH_TOP_MM = 900;
export function mountZMm(c) {
  if (c.mount === 'bench') return BENCH_TOP_MM;
  if (c.mount === 'wall') return 0;      // 벽걸이는 팩토리가 `baseMm` 으로 스스로 올라간다
  return 0;
}
