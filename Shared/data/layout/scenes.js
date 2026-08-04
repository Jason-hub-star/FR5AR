// 씬 보관함 — **이름 붙인 배치안 여러 개**를 이 브라우저에 둔다.
//
// 전에는 예시 배치안(A/B)에 편집분을 얹는 `base + patch` 였다. 빈 방에서 팔레트로 전부
// 짓게 되면서 그 방식이 무의미해졌다 — **씬이 곧 완전한 배치안**이다. 훨씬 단순하고,
// 저장·드롭다운·(나중에) 팀 공유가 전부 같은 한 덩어리를 옮기는 일이 된다.
//
// **천장** — `localStorage` 라 이 브라우저 안에서만 산다. 팀 공유는 D46(Supabase)이고
// `GAP-MATRIX` 에 OPEN 이다. 그때 바뀌는 것은 아래 `read`/`write` 두 함수뿐이다.

import { buildPreset, DEFAULT_PRESET } from './presets.js';

const KEY = 'fr5.scenes';

/**
 * 새 씬 — **프리셋에서 꺼낸다.** 모양은 여기 없다 (`presets.js` 가 SSOT).
 *
 * 꺼낸 순간부터는 그냥 씬이다 — 프리셋을 나중에 고쳐도 이미 만든 씬은 안 따라간다.
 * 저장분이 발밑에서 바뀌는 것보다 낫다.
 */
export function newScene(name = '새 배치안', preset = DEFAULT_PRESET) {
  return buildPreset(preset, 'scene', name);
}

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v === 'object' && v.scenes && typeof v.scenes === 'object') return v;
  } catch { /* 깨졌으면 조용히 새로 시작한다 — 편집기가 안 뜨는 것보다 낫다 */ }
  return null;
}

/** 보관함 전체. 비어 있으면 빈 방 하나를 만들어 돌려준다. */
export function loadStore() {
  const v = read();
  if (v && Object.keys(v.scenes).length) {
    const cur = v.scenes[v.current] ? v.current : Object.keys(v.scenes)[0];
    return { current: cur, scenes: v.scenes };
  }
  const first = newScene('배치안 1');
  return { current: first.id, scenes: { [first.id]: first } };
}

/** 저장. **실패를 삼키지 않는다** — 사파리 프라이빗·용량 초과에서 던진다. */
export function saveStore(store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

/** 이름이 겹치지 않게 — 같은 이름이 둘이면 드롭다운에서 무엇을 고른 건지 알 수 없다. */
export function uniqueName(scenes, base) {
  const taken = new Set(Object.values(scenes).map((s) => s.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i += 1) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

let seq = 0;
/** 씬 id — 시간이 아니라 **내용과 무관한 일련번호**다. 저장분을 옮겨도 안 깨진다. */
export function nextSceneId(scenes) {
  for (;;) {
    seq += 1;
    const id = `s${Object.keys(scenes).length + seq}`;
    if (!scenes[id]) return id;
  }
}
