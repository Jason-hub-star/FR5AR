// 글로벌 카메라 화면 — 고정 카메라 영상 위에 배치안 3D 를 겹친다.
//
// **추적을 안 한다.** 카메라가 고정이라 캘리브레이션 한 번이면 끝이고, 그래서 떨림이 0 이다.
//
// 세 가지를 밖에서 받는다 — 셋 다 URL 로 넘겨 링크 하나로 재현된다.
//   ?feed=<MJPEG URL>   카메라 영상. 없으면 합성 고정물
//   ?scene=<JSON URL>   대시보드에서 **내보낸 배치안 전문**. 파일 선택으로도 된다
//   ?fit=WxD&anchor=x,y 태그 사각형(mm)에 맵을 **맞춰 줄인다**. 아래 §배율
//
// **배율이 왜 필요한가** — 배치안은 12m 방인데 강의실은 3m 다. 1:1 로 겹치면 벽이 방을
// 뚫고 나간다. 태그를 놓은 사각형에 맵을 넣으면 **태그 배치가 곧 맵 크기**가 된다.

import { createStage } from '@fr5/shared/view3d/lab/stage.js';
import { createLayoutView } from '@fr5/shared/view3d/lab/layout-view.js';
import { migrateLayout, validateLayout } from '@fr5/shared/data/layout/schema.js';
import { planToScene } from '@fr5/shared/data/units/units.js';
import { labToPixel } from '@fr5/shared/view3d/global-cam.js';
// **판정을 여기서 짜지 않는다** (2026-08-07). 무엇이 경고인지는 FR5 PiP 와 **같은 함수**가
// 정한다 — 화면마다 따로 짜면 두 화면의 "괜찮다"가 갈라지고, 안전 표시에서 그게 제일 나쁘다
import { cameraState } from '@fr5/shared/data/camera/state.js';
import { watchFrames } from '@fr5/shared/data/camera/watch.js';

const FIX = '/test/cam-fixture';
const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
// `#status` 는 **실패 메시지 전용**이다. 카메라 상태는 아래 `#camhud` 가 맡는다
const status = (s, warn = false) => { $('status').textContent = s; $('status').classList.toggle('warn', warn); };

// ── 카메라 상태 띠. **판정은 안 한다** — `cameraState` 가 낸 문장과 색을 그리기만 한다.
// 배치는 화면마다 다르다(FR5 는 300px PiP, 여기는 전체화면 머리띠). 같아야 하는 건 판정뿐이다.
// `settings` 는 `undefined` 로 둔다 — 합성 고정물에는 물을 폰이 없고, 못 고칠 경고를
// 상주시키면 사람이 경고를 무시하는 법을 배운다 (`state.js` §settings)
const cam = { calib: null, live: null, stale: false, lastChangeMsAgo: null, settings: undefined };
function paintHud() {
  const img = $('feed');
  const rows = cameraState({
    calib: cam.calib,
    status: cam.settings,
    observed: { live: cam.live, stale: cam.stale, lastChangeMsAgo: cam.lastChangeMsAgo,
      streamW: img.naturalWidth || null, streamH: img.naturalHeight || null },
  });
  $('camhud').replaceChildren(...rows.map((r) => {
    const el = document.createElement('span');
    el.dataset.tone = r.tone;
    el.dataset.t = `cam-hud-${r.key}`;
    el.textContent = r.label;
    return el;
  }));
}

/** 폰 설정 되읽기. 합성 고정물처럼 **카메라가 아예 없는 주소**면 걸지 않는다 */
function watchSettings(feed) {
  let origin;
  try { origin = new URL(feed, location.href).origin; } catch { return; }
  if (!/^https?:$/.test(new URL(origin).protocol) || origin === location.origin) return;
  const read = async () => {
    try {
      // **마감시각을 건다** — 없는 IP 는 OS 타임아웃까지 매달리고, 그동안 화면은
      // "아직 안 물어봄"(조용함)에 머문다. 랜 안의 `status.json` 이 이보다 걸릴 이유가 없다
      const r = await fetch(`${origin}/status.json`,
        { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      cam.settings = (await r.json())?.curvals ?? null;
    } catch { cam.settings = null; }   // CORS 든 무응답이든 **모르는 것은 모르는 것**이다
    paintHud();
  };
  read();
  setInterval(read, 15000);
}

// ── 캘리브레이션. **`import.meta.glob` 을 쓴다** — 이 파일은 `map/intrinsics.py` 가
// 만드는 산출물이라 캘리브레이션 전에는 **정상적으로 없다.** 정적 import(D18) 로 두면
// 아무도 캘리브레이션하기 전까지 빌드가 통째로 깨진다. glob 은 안 맞으면 빈 객체다.
const REAL = Object.values(import.meta.glob('../../../Shared/data/config/global-cam.json', {
  eager: true, import: 'default',
}))[0] ?? null;

/** 배치안을 받아 스키마로 거른다. **아무 JSON 이나 받으면 화면이 그 자리에서 죽는다.** */
function acceptScene(raw) {
  const L = migrateLayout(raw);
  const errs = validateLayout(L);
  if (errs.length) throw new Error(errs[0]);
  return L;
}

const SCENE_KEY = 'fr5.cam.scene';
/** 마지막으로 본 배치안을 기억한다 — 폰에서 매번 파일을 고르는 것은 고통이다. */
function remember(L) {
  try { localStorage.setItem(SCENE_KEY, JSON.stringify(L)); } catch { /* 프라이빗 모드 */ }
}

/**
 * 태그 사각형에 맵을 맞추는 배율.
 *
 * **균일 스케일만 쓴다.** 가로·세로를 따로 맞추면 로봇이 찌그러지고, 그 화면으로
 * 도달 범위를 판단하면 틀린 판단을 한다. 그래서 둘 중 **작은 쪽**을 쓴다.
 */
function fitScale(L, fitMm) {
  if (!fitMm) return 1;
  const s = Math.min(fitMm[0] / L.floor.widthMm, fitMm[1] / L.floor.depthMm);
  return Number.isFinite(s) && s > 0 ? s : 1;
}

const pairMm = (key) => {
  const m = /^(\d+)[x,](\d+)$/.exec(Q.get(key) ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
};

const FIT = pairMm('fit');
const ANCHOR = pairMm('anchor') ?? [0, 0];

let stage = null;
let view = null;

/** 배치안 하나를 그린다. 다시 부르면 앞의 것을 버리고 새로 그린다. */
function draw(L) {
  if (view) { stage.scene.remove(view.root); view.dispose?.(); view = null; }
  view = createLayoutView(L);

  // ── 배율·원점. `root` 에만 걸어 `layout-view` 내부는 안 건드린다.
  const s = fitScale(L, FIT);
  view.root.scale.setScalar(s);
  const [ax, ay, az] = planToScene([ANCHOR[0], ANCHOR[1], 0]);
  view.root.position.set(ax, ay, az);
  stage.scene.add(view.root);

  // ── AR 처리. **영상이 보여야 겹친 것이다** — 불투명하게 덮으면 그냥 3D 뷰다.
  //   · 바닥 슬래브는 숨긴다. 진짜 바닥이 영상에 이미 있다
  //   · 벽은 반투명. 높이감은 주되 뒤가 비친다
  //   · 컷어웨이는 **배율을 건 뒤 한 번** 부른다. 궤도가 없으니 매 프레임 돌릴 이유가 없다
  const slab = view.root.getObjectByName('slab');
  if (slab) slab.visible = false;
  view.updateCutaway(stage.camera);
  view.root.traverse((o) => {
    if (!o.isMesh || !o.userData.inward) return;      // inward 가 붙은 것 = 벽 조각
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.opacity = 0.28;
    o.material.depthWrite = false;
  });

  // **배율을 화면에 적는다.** 1:5 로 줄인 화면에서 도달 범위 링을 보고
  // "저 안이면 안전하다" 로 읽으면 안 된다 — 줄어든 것은 링도 마찬가지다.
  $('scale').textContent = s === 1 ? '1:1 실물 크기'
    : `1:${(1 / s).toFixed(1)} 축소 — 실물 크기 아님`;
  $('scale').classList.toggle('warn', s !== 1);
  $('sceneName').textContent = L.name ?? L.id ?? '이름 없음';
  return s;
}

try {
  // ── 1. 영상과 캘리브레이션은 **짝이다** (2026-08-07 수정)
  //
  // 여태 캘리브를 무조건 실측(`REAL`)으로 골랐다. 실측값이 생기기 전에는 둘이 늘 고정물이라
  // 맞았는데, D82·D83 으로 실측이 들어온 순간 **합성 사진 위에 실측 캘리브**가 씌워졌다 —
  // 겹침이 2176px 어긋났고 `cam-web-verify` 가 그걸 잡고 있었다(빨간 채로 있었다).
  // 사진이 고정물이면 캘리브도 고정물이어야 한다. 사진이 실물이면 실측이어야 한다.
  const feed = Q.get('feed') || `${FIX}/shot.png`;
  const fixture = !Q.get('feed');
  const calib = (!fixture && REAL) ? REAL : await (await fetch(`${FIX}/global-cam.json`)).json();
  // 실측이 아직 없는데 실영상을 보고 있으면 **고정물 값으로 겹치는 중**이라고 말해야 한다
  cam.calib = (!fixture && REAL) ? calib : { ...calib, verified: false };
  paintHud();

  // ── 2. 영상
  await new Promise((res, rej) => {
    const img = $('feed');
    img.onload = () => { cam.live = true; paintHud(); res(); };
    img.onerror = () => { cam.live = false; paintHud(); rej(new Error(`영상을 못 읽었다 — ${feed}`)); };
    img.src = feed;
  });
  // **재보지도 않고 "살아 있다"고 말하지 않는다** — MJPEG 는 끊겨도 이벤트가 안 온다.
  // FR5 PiP 와 같은 감시를 건다 (`Shared/data/camera/watch.js`).
  //
  // **단 고정물에는 걸지 않는다.** 합성 고정물은 정지 사진이라 픽셀이 영영 안 바뀌고,
  // 감시는 그걸 "새 프레임이 안 온다"로 읽는다 — 12초 뒤 화면이 거짓 경고를 띄웠다
  // (2026-08-07 실렌더). 안 움직이는 게 정상인 것에 움직임을 재면 안 된다.
  if (!fixture) {
    watchFrames($('feed'), ({ stale, lastChangeMsAgo }) => {
      cam.stale = stale; cam.lastChangeMsAgo = lastChangeMsAgo; paintHud();
    });
  }
  watchSettings(feed);

  stage = createStage($('host'), { alpha: true, controls: false, calib });

  // ── 3. 배치안 — URL → 저장분 → 고정물 순. **없다고 빈 화면을 주지 않는다.**
  let L = null;
  const from = Q.get('scene');
  if (from) L = acceptScene(await (await fetch(from)).json());
  if (!L) {
    try {
      const saved = localStorage.getItem(SCENE_KEY);
      if (saved) L = acceptScene(JSON.parse(saved));
    } catch { /* 저장분이 깨졌으면 무시하고 아래로 */ }
  }
  if (!L) L = acceptScene(await (await fetch(`${FIX}/layout.json`)).json());
  draw(L);
  if (from) remember(L);

  // 거치 높이는 **판정이 아니라 사실**이라 `cameraState` 에 없다 — 여기서 적는다.
  // 해상도·합성 고정물 경고는 위 상태 띠가 맡는다. 같은 말을 두 곳에서 하지 않는다
  const E = calib.labToCam;
  status(`카메라 ${(E.heightMm / 1000).toFixed(2)}m`);

  // ── 조작
  $('toggle').onclick = () => {
    const off = $('host').classList.toggle('off');
    $('toggle').textContent = off ? '겹치기 켜기' : '겹치기 끄기';
  };
  $('file').onchange = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const next = acceptScene(JSON.parse(await f.text()));
      draw(next);
      remember(next);
    } catch (err) {
      status(`배치안을 못 읽었다 — ${err?.message ?? err}`, true);
    }
  };

  // 헤드리스 검증용 노출 — 배율·원점이 정말 걸렸는지는 밖에서 숫자로 봐야 판정이 된다.
  // `toPixel` 은 **화면이 실제로 쓰는 카메라**로 실험실 좌표를 투영한다. 사진 속 태그를
  // 다시 검출해 이 값과 대조하면 "겹쳐 보인다" 가 픽셀 숫자가 된다
  // (`scripts/check/cam-web-verify.mjs`).
  globalThis.__cam = { stage, calib, fit: FIT, anchor: ANCHOR, draw,
    get view() { return view; },
    toPixel: (labMm) => labToPixel(stage.camera, calib, labMm) };
} catch (e) {
  status(`실패 — ${e.message}`, true);
  throw e;
}
