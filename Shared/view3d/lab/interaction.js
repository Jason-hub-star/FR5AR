// 편집 인터랙션 — 고르고 · 끌고 · 돌린다.
//
// 패턴 출처: 주인님의 `Jason-hub-star/ArduinoDT`
// (`src/features/breadboard-3d/three/picking/createInteraction.ts`).
// 거기서 가져온 것 넷 —
//   ① **Raycaster 피킹을 React 밖 독립 모듈로** 둔다
//   ② **호버 링 / 선택 링**으로 상태를 바닥에 표시한다 (우리 도달 링과 표현이 일관된다)
//   ③ **그리드 스냅** (`round(v/pitch)*pitch`) — 손으로 놓아도 정렬된다
//   ④ 끄는 동안은 **메시만 움직이고**, 놓을 때 데이터에 커밋한다
//
// ④ 가 중요하다. 매 프레임 배치안을 갱신해 씬을 다시 만들면 끌기가 끊긴다.
// 대신 **판정(도달 여부)은 끄는 중에도 갱신**한다 — 거리 계산 한 번이라 싸고,
// "여기 놓으면 닿나" 를 손이 움직이는 동안 알려주는 게 이 화면의 값어치다.

import * as THREE from 'three';
import { mm, toMm } from '../../data/units/units.js';

const HOVER = 0xb06d00;
const SELECT = 0x1f5f9e;

export function createInteraction({
  renderer, camera, scene, controls, pickRoot, gridMm = 100, onCommit, onPick,
}) {
  // `pickRoot` 는 함수로도 받는다 — 배치안이 갈리면 내용물 그룹이 새로 만들어지는데,
  // 값으로 잡아두면 **죽은 그룹을 계속 겨눈다** (골라지지 않는다). 매번 물어본다.
  const rootOf = () => (typeof pickRoot === 'function' ? pickRoot() : pickRoot);
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const grab = new THREE.Vector3();       // 잡은 지점과 원점의 차이 — 안 빼면 물체가 커서로 순간이동한다

  /** 바닥 교점(월드)을 **그 물체의 부모 좌표계**로 옮긴다.
   *  `position` 은 부모 기준인데 레이캐스트 결과는 월드다 — 방 그룹이 (-6, 0, -4) 만큼
   *  밀려 있어 그냥 빼면 6m 어긋난다. 지금은 평행이동뿐이라 상수가 상쇄돼 맞아 보이지만,
   *  회전·스케일이 하나만 끼면 조용히 틀린다. */
  const toLocal = (node, v) => (node.parent ? node.parent.worldToLocal(v) : v);

  let hovered = null;
  let selected = null;
  let dragging = null;
  // **끌기가 시작되는 문턱.** 이게 없으면 고르려고 누른 손이 1px 만 흔들려도 끌기로 쳐서
  // 격자에 스냅해 커밋한다 — 예시 좌표에 100mm 배수가 아닌 값이 여럿이라
  // **고를 때마다 물건이 최대 50mm 밀린다** (2026-07-31 배포본 실사용에서 발견).
  // 손가락은 마우스보다 흔들리므로 폰까지 덮는 값으로 잡는다.
  const SLOP_PX = 4;
  let moved = false;
  let downX = 0;
  let downY = 0;

  // 바닥 링 — 호버·선택 표시. **물체에 윤곽선을 그리는 것보다 싸고, 겹쳐도 안 가린다.**
  const mkRing = (color) => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.5, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 10;
    m.visible = false;
    scene.add(m);
    return m;
  };
  const hoverRing = mkRing(HOVER);
  const selectRing = mkRing(SELECT);

  const snap = (v) => Math.round(v / gridMm) * gridMm;

  /** 맞은 메시에서 위로 올라가며 **편집 단위**(userData.item 이 붙은 노드)를 찾는다. */
  function itemOf(obj, root) {
    let n = obj;
    while (n && n !== root) {
      if (n.userData?.item) return n;
      n = n.parent;
    }
    return null;
  }

  function pickAt(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const root = rootOf();
    if (!root) return null;
    const hits = ray.intersectObject(root, true);
    for (const h of hits) {
      const it = itemOf(h.object, root);
      if (it) return it;
    }
    return null;
  }

  // 링은 `scene` 에 직접 붙는다 — 그러니 **월드 좌표**로 놔야 한다.
  // 물체의 `position` 을 그대로 쓰면 방 그룹 오프셋만큼 어긋난 자리에 링이 뜬다.
  const _w = new THREE.Vector3();
  function ringTo(ring, node) {
    if (!node) { ring.visible = false; return; }
    node.getWorldPosition(_w);
    ring.position.set(_w.x, 0.012, _w.z);
    ring.visible = true;
  }

  function onMove(ev) {
    if (dragging) {
      // 문턱을 넘기 전에는 **아무것도 건드리지 않는다.** 여기서 막아야 메시도 안 움직이고
      // 데이터도 안 바뀐다 — 놓을 때만 막으면 화면과 배치안이 갈라진다
      if (!moved) {
        if (Math.hypot(ev.clientX - downX, ev.clientY - downY) < SLOP_PX) return;
        moved = true;
      }
      const r = renderer.domElement.getBoundingClientRect();
      ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ptr, camera);
      if (!ray.ray.intersectPlane(floor, hit)) return;
      toLocal(dragging, hit);
      // **그리드 스냅.** 손으로 놓아도 줄이 맞는다 (ArduinoDT 의 2.54mm 스냅과 같은 발상)
      const xMm = snap(toMm(hit.x - grab.x));
      const zMm = snap(toMm(hit.z - grab.z));
      dragging.position.set(mm(xMm), dragging.position.y, mm(zMm));
      ringTo(selectRing, dragging);
      // 끄는 중에도 판정을 갱신한다 — "여기 놓으면 닿나" 를 손이 움직일 때 알려준다
      onPick?.({ ...dragging.userData.item, posMm: [xMm, zMm], live: true });
      return;
    }
    const it = pickAt(ev);
    if (it !== hovered) {
      hovered = it;
      ringTo(hoverRing, it && it !== selected ? it : null);
      renderer.domElement.style.cursor = it ? 'grab' : '';
    }
  }

  function onDown(ev) {
    if (ev.button !== 0) return;
    const it = pickAt(ev);
    selected = it;
    ringTo(selectRing, it);
    ringTo(hoverRing, null);
    if (!it) { onPick?.(null); return; }

    // 잡은 지점과 물체 원점의 차이를 기억한다 — 안 하면 물체가 커서로 튄다
    const r = renderer.domElement.getBoundingClientRect();
    ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    if (ray.ray.intersectPlane(floor, hit)) {
      toLocal(it, hit);
      grab.set(hit.x - it.position.x, 0, hit.z - it.position.z);
    }

    dragging = it;
    moved = false;
    downX = ev.clientX;
    downY = ev.clientY;
    renderer.domElement.style.cursor = 'grabbing';
    // **여기서 즉시 끈다.** 틱에서 끄면 늦다 — OrbitControls 가 먼저 등록돼 있어
    // 같은 pointerdown 으로 이미 궤도를 시작해 버린다. 실제로 카메라가 55m 밖으로 날아갔다.
    // 그래서 이 리스너를 **캡처 단계**에 걸고(아래) 여기서 동기로 끈다.
    if (controls) controls.enabled = false;
    ev.stopPropagation();
    // 합성 이벤트(헤드리스 검증)에서는 pointerType 이 없어 던진다 — 검증을 막지 않는다
    try { ev.target.setPointerCapture?.(ev.pointerId); } catch { /* 합성 이벤트 */ }
    onPick?.({ ...it.userData.item, posMm: [toMm(it.position.x), toMm(it.position.z)] });
  }

  function onUp(ev) {
    if (!dragging) return;
    const it = dragging;
    dragging = null;
    renderer.domElement.style.cursor = 'grab';
    if (controls) controls.enabled = true;
    try { ev.target.releasePointerCapture?.(ev.pointerId); } catch { /* 합성 이벤트 */ }
    // **고르기만 한 것은 편집이 아니다.** 문턱을 안 넘었으면 배치안을 건드리지 않는다 —
    // 안 그러면 클릭 한 번에 저장 배지가 뜨고 되돌리기 기록이 쌓인다
    if (!moved) return;
    // **여기서 데이터에 커밋한다.** 끄는 동안은 메시만 움직였다.
    onCommit?.({ ...it.userData.item, posMm: [toMm(it.position.x), toMm(it.position.z)] });
  }

  /** 90° 씩 돌린다. 벽에 붙이는 가구라 자유 각도는 쓸 일이 없다.
   *  **키가 아니라 함수로 뺐다** — 폰에는 키보드가 없어 버튼에서도 같은 걸 불러야 한다. */
  function rotate() {
    if (!selected) return false;
    selected.rotation.y -= Math.PI / 2;
    const deg = Math.round((-selected.rotation.y * 180) / Math.PI) % 360;
    onCommit?.({ ...selected.userData.item, rotDeg: deg });
    return true;
  }
  function onKey(ev) { if (ev.key === 'r' || ev.key === 'R') rotate(); }

  const el = renderer.domElement;
  // **터치에서 브라우저 제스처를 끈다.** 안 하면 손가락으로 끌 때 페이지가 스크롤되고
  // pointercancel 이 날아와 끌기가 중간에 끊긴다 (폰에서만 재현되는 종류의 버그다).
  el.style.touchAction = 'none';
  // **캡처 단계**로 건다. OrbitControls 는 버블 단계라 우리가 먼저 돌고,
  // 물체를 집었으면 `stopPropagation()` 으로 궤도 시작 자체를 막는다.
  el.addEventListener('pointermove', onMove, true);
  el.addEventListener('pointerdown', onDown, true);
  el.addEventListener('pointerup', onUp, true);
  addEventListener('keydown', onKey);

  return {
    /** 끄는 중에는 궤도를 막아야 한다 — 화면 쪽에서 이 값을 보고 controls 를 끈다 */
    isDragging: () => Boolean(dragging),
    rotate,
    clear() { selected = null; hovered = null; ringTo(selectRing, null); ringTo(hoverRing, null); onPick?.(null); },
    dispose() {
      el.removeEventListener('pointermove', onMove, true);
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointerup', onUp, true);
      removeEventListener('keydown', onKey);
      for (const r of [hoverRing, selectRing]) { r.geometry.dispose(); r.material.dispose(); r.removeFromParent(); }
      el.style.cursor = '';
    },
  };
}
