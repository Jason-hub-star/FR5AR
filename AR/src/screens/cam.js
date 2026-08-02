// 글로벌 카메라 화면 — 고정 카메라 영상 위에 배치안 3D 를 겹친다.
//
// **추적을 안 한다.** 카메라가 고정이라 캘리브레이션 한 번이면 끝이고, 그래서 떨림이 0 이다.
// 지금 영상은 합성 고정물(`scripts/map/make-fixture.py`)이다 — 라이브 전환은 `#feed` 의
// src 를 MJPEG 로 바꾸는 것뿐이다 (G4).

import { createStage } from '@fr5/shared/view3d/lab/stage.js';
import { createLayoutView } from '@fr5/shared/view3d/lab/layout-view.js';

const FIX = '/test/cam-fixture';
const $ = (id) => document.getElementById(id);

// 합성 고정물의 장면과 같은 배치 — 태그 네 장 자리에 바닥 표식을 둔다.
// 겹치면 표식이 사진 속 태그 위에 얹힌다.
const LAYOUT = {
  id: 'FIX', name: '합성 고정물', unit: 'mm-deg',
  floor: { widthMm: 3000, depthMm: 1600, heightMm: 2000 },
  arm: { model: 'FR5', basePosMm: [1500, 800, 900], baseYawDeg: 0, reachMm: 922 },
  stations: [
    { id: 'tag0', name: 'tag0', posMm: [300, 300, 0] },
    { id: 'tag1', name: 'tag1', posMm: [2700, 300, 0] },
    { id: 'tag2', name: 'tag2', posMm: [2700, 1300, 0] },
    { id: 'tag3', name: 'tag3', posMm: [300, 1300, 0] },
  ],
  amrs: [], props: [], verified: false,
};

const status = (s) => { $('status').textContent = s; };

try {
  const calib = await (await fetch(`${FIX}/global-cam.json`)).json();
  await new Promise((res, rej) => {
    const img = $('feed');
    img.onload = res; img.onerror = () => rej(new Error('영상을 못 읽었다'));
    img.src = `${FIX}/shot.png`;
  });

  const stage = createStage($('host'), { alpha: true, controls: false, calib });
  const view = createLayoutView(LAYOUT);
  stage.scene.add(view.root);

  // ── AR 처리. **영상이 보여야 겹친 것이다** — 불투명하게 덮으면 그냥 3D 뷰다.
  //   · 바닥 슬래브는 숨긴다. 진짜 바닥이 사진에 이미 있다
  //   · 벽은 반투명. 높이감은 주되 뒤가 비친다
  //   · 카메라가 방 밖 남쪽에 있어 앞 벽이 시야를 막는다 → 컷어웨이를 **한 번** 부른다.
  //     궤도가 없으니 매 프레임 돌릴 이유가 없다 (고정 카메라의 이득이 여기서도 나온다)
  view.root.getObjectByName('slab').visible = false;
  view.updateCutaway(stage.camera);
  view.root.traverse((o) => {
    if (!o.isMesh || !o.userData.inward) return;      // inward 가 붙은 것 = 벽 조각
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.opacity = 0.28;
    o.material.depthWrite = false;
  });

  const E = calib.labToCam;
  status(`카메라 높이 ${(E.heightMm / 1000).toFixed(2)}m · `
       + `${calib.intrinsics.widthPx}×${calib.intrinsics.heightPx} · 겹치기 켬`);

  $('toggle').onclick = () => {
    const off = $('host').classList.toggle('off');
    $('toggle').textContent = off ? '겹치기 켜기' : '겹치기 끄기';
  };
  globalThis.__cam = { stage, view, calib };
} catch (e) {
  status(`실패 — ${e.message}`);
  throw e;
}
