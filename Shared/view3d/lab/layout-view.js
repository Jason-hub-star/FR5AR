// 배치안 하나를 3D 로 그린다 — 대시보드 메인뷰의 본체.
//
// **방 껍데기는 에셋이 아니라 배치안에서 나온다** (`floor` 치수).
// 배치를 바꾸면 공간도 따라 바뀌어야 하기 때문이다 (`rnd/AMR-TWIN-DIRECTION` §5).
//
// **React 를 쓰지 않는다.** 좌표 변환은 `Shared/data/units` 한 곳만 쓴다 (하드 룰 5).

import * as THREE from 'three';
import { mm } from '../../data/units/units.js';
import { reachCheck, crossings } from '../../data/layout/schema.js';
import { makeReachZone } from '../reach-zone.js';
import { assembleProps } from '../parts.js';

// 토큰과 같은 의미의 색. 상태 색은 두 화면에서 같아야 한다 (D21).
// 평면도 Y(미터) → 씬 Z. **부호가 뒤집힌다.**
//
// 축을 그냥 맞바꾸면(planY → +sceneZ) 행렬식이 −1 인 거울 사상이라 씬이 실제의
// 좌우 반전이 된다. 배치안만 볼 때는 아무도 눈치채지 못하지만 글로벌 카메라 영상에
// 겹치는 순간 드러나고, 카메라로는 흡수할 수 없다 (D43).
// **이 파일에서 평면도 Y 를 씬에 넣는 곳은 전부 이 함수를 지난다** (하드 룰 5).
// 회전도 같이 뒤집힌다 — 평면도 yaw θ 는 씬에서 rotation.y = +θ 다.
const Z = (planYMeters) => -planYMeters;

const C = { ok: 0x2f7d32, warn: 0xb06d00, danger: 0xba1a1a, path: 0x2f7d32, virtual: 0x4a90d9 };

const mat = {
  floor: new THREE.MeshStandardMaterial({ color: 0xeeeff0, roughness: 0.8, metalness: 0.0 }),
  wall:  new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.95 }),
  bench: new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.28, metalness: 0.75 }), // 스테인리스
  amr:   new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.5, metalness: 0.2 }),
  frame: new THREE.MeshStandardMaterial({ color: 0xb9bfc5, roughness: 0.55, metalness: 0.25 }),
};

// 문 유리는 부품 유리와 같은 톤을 쓴다 — 화이트 모형에서 유리가 유일한 색이라 통일해야 한다
const matGlassDoor = new THREE.MeshStandardMaterial({
  color: 0xb9d2e3, roughness: 0.08, metalness: 0,
  transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false,
});

/**
 * 배치안을 그린다. 반환값의 `dispose()` 를 반드시 부른다.
 *
 * `mountArm(group, layout)` 을 주면 그 자리에 팔을 붙인다 — URDF 로딩이 비동기라
 * 이 모듈이 직접 하지 않는다. 그래야 방이 먼저 뜨고 팔이 나중에 붙는다.
 */
export function createLayoutView(layout, { mountArm } = {}) {
  const root = new THREE.Group();
  root.name = 'layoutView';
  // **방 껍데기와 내용물을 나눈다.** 시점을 방(6m)에 맞추면 내용물이 작아져 안 보인다.
  const contents = new THREE.Group();
  contents.name = 'contents';
  root.add(contents);
  const disposables = [];
  const track = (g) => { disposables.push(g); return g; };

  const W = mm(layout.floor.widthMm);
  const D = mm(layout.floor.depthMm);
  const H = mm(layout.floor.heightMm ?? 2700);

  // ── 방 — **두께 있는 벽**으로 만든다.
  //
  // 얇은 면(PlaneGeometry)은 건축 모형으로 안 읽힌다. `pascalorg/editor` 의 화이트 모형이
  // 그럴듯한 이유 중 하나가 **벽 단면이 보이는 것**이다 — 잘린 두께가 "건물" 신호를 준다.
  //
  // 컷어웨이는 따로 안 한다. 카메라가 방 밖 위쪽에 있으면 **앞쪽 벽이 뒷면이 되어
  // 저절로 안 보인다** (아래 `side: BackSide` 가 아니라 벽마다 바깥을 향하게 두면 된다).
  const T = 0.12;                       // 벽 두께 120mm
  const SLAB = 0.16;                    // 바닥 슬래브 160mm
  const slab = new THREE.Mesh(track(new THREE.BoxGeometry(W + T * 2, SLAB, D + T * 2)), mat.floor);
  slab.position.set(W / 2, -SLAB / 2, Z(D / 2));
  slab.name = 'slab';        // AR 오버레이는 바닥을 숨긴다 — 실제 바닥이 뒤에 있다
  slab.receiveShadow = true;
  root.add(slab);

  // 벽 네 장. 각 벽은 **개구부(문)를 가질 수 있다** — AMR 이 드나들 입구가 있어야 한다.
  // CSG 로 구멍을 뚫지 않고 **조각으로 나눈다** — 훨씬 싸고 단면이 깨끗하다.
  //
  // side: 벽 이름 · axis: 개구부 위치가 어느 축을 따라가나 · len: 그 축 길이
  const SIDES = [
    { name: 'south', axis: 'x', len: W, fixed: -T / 2,     size: [0, H, T] },
    { name: 'north', axis: 'x', len: W, fixed: D + T / 2,  size: [0, H, T] },
    { name: 'west',  axis: 'z', len: D, fixed: -T / 2,     size: [T, H, 0] },
    { name: 'east',  axis: 'z', len: D, fixed: W + T / 2,  size: [T, H, 0] },
  ];

  const wallMeshes = [];
  const center = new THREE.Vector3(W / 2, 0, Z(D / 2));

  /** 한 벽을 개구부를 피해 조각으로 만든다. 개구부 위는 인방(lintel)으로 덮는다. */
  function buildWall(side) {
    // 문과 창을 같은 방식으로 뚫는다 — 창은 **아래에 벽이 남는다**(sill)
    const holes = [...(layout.doors ?? []), ...(layout.windows ?? [])]
      .filter((d) => d.wall === side.name)
      .map((d) => ({
        a: mm(d.atMm - d.widthMm / 2), b: mm(d.atMm + d.widthMm / 2),
        sill: mm(d.sillMm ?? 0), head: mm((d.sillMm ?? 0) + (d.heightMm ?? 2100)),
      }))
      .sort((p, q) => p.a - q.a);

    const pieces = [];
    let cursor = side.axis === 'x' ? -T : -T;          // 벽은 모서리에서 T 만큼 더 나간다
    const end = side.len + T;
    for (const h of holes) {
      if (h.a > cursor) pieces.push({ from: cursor, to: h.a, h: H, y: H / 2 });
      // 개구부 위 인방
      pieces.push({ from: h.a, to: h.b, h: H - h.head, y: h.head + (H - h.head) / 2 });
      // 창턱 아래 벽 (문은 sill=0 이라 안 생긴다)
      if (h.sill > 0.001) pieces.push({ from: h.a, to: h.b, h: h.sill, y: h.sill / 2 });
      cursor = h.b;
    }
    if (cursor < end) pieces.push({ from: cursor, to: end, h: H, y: H / 2 });

    for (const pc of pieces) {
      const span = pc.to - pc.from;
      if (span <= 0.001 || pc.h <= 0.001) continue;
      const mid = pc.from + span / 2;
      const dims = side.axis === 'x' ? [span, pc.h, T] : [T, pc.h, span];
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(...dims)), mat.wall);
      if (side.axis === 'x') m.position.set(mid, pc.y, Z(side.fixed));
      else m.position.set(side.fixed, pc.y, Z(mid));
      m.castShadow = true; m.receiveShadow = true;
      // 컷어웨이 판정용 — 벽 중심에서 방 중심으로 가는 방향(=안쪽)
      m.userData.inward = center.clone().sub(m.position).setY(0).normalize();
      root.add(m);
      wallMeshes.push(m);
    }
  }
  for (const side of SIDES) buildWall(side);

  // 문틀 — 개구부 테두리를 진하게 두면 "입구" 로 읽힌다.
  //
  // **문·창은 `contents` 에 넣는다.** 고를 수 있어야 팔레트로 놓은 것을 다시 고치기 때문이다
  // (피킹 루트가 `contents`). 대신 `fixed: true` 로 **끌리지는 않게** 한다 —
  // 벽에 뚫린 구멍이라 바닥 좌표가 없다 (`interaction.js` 의 가드).
  for (const d of layout.doors ?? []) {
    const side = SIDES.find((x) => x.name === d.wall);
    if (!side) continue;
    const dg = new THREE.Group();
    dg.name = d.id ?? 'door';
    // 끌 때 **벽을 따라 미끄러지려면** 축과 벽 길이를 알아야 한다 (`interaction.js`)
    dg.userData.item = {
      kind: 'door', id: d.id, name: '문', wall: d.wall, axis: side.axis,
      atMm: d.atMm, widthMm: d.widthMm, spanMm: side.axis === 'x' ? layout.floor.widthMm : layout.floor.depthMm,
    };
    contents.add(dg);
    const root = dg;                       // 아래 조각들이 이 그룹으로 들어간다
    const w = mm(d.widthMm); const h = mm(d.heightMm ?? 2100); const at = mm(d.atMm);
    const jamb = 0.09;
    for (const s of [-1, 1]) {
      const dims = side.axis === 'x' ? [jamb, h, T * 1.3] : [T * 1.3, h, jamb];
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(...dims)), mat.frame);
      if (side.axis === 'x') m.position.set(at + s * (w / 2), h / 2, Z(side.fixed));
      else m.position.set(side.fixed, h / 2, Z(at + s * (w / 2)));
      m.castShadow = true;
      root.add(m);
    }
    // **유리 문짝.** 개구부만 있으면 "구멍" 이고, 문짝이 있어야 "입구" 로 읽힌다.
    // 레퍼런스(Codex 생성)에서 이게 가장 눈에 띄는 차이였다.
    const leafW = w / 2 - 0.02;
    for (const s2 of [-1, 1]) {
      const dims = side.axis === 'x' ? [leafW, h - 0.06, 0.05] : [0.05, h - 0.06, leafW];
      const leaf = new THREE.Mesh(track(new THREE.BoxGeometry(...dims)), matGlassDoor);
      const off = s2 * (w / 4);
      if (side.axis === 'x') leaf.position.set(at + off, h / 2, Z(side.fixed));
      else leaf.position.set(side.fixed, h / 2, Z(at + off));
      root.add(leaf);
      // 손잡이 — 세로 막대 하나가 "문" 신호를 완성한다
      const hd = new THREE.Mesh(track(new THREE.CylinderGeometry(0.016, 0.016, 0.55, 8)), mat.frame);
      const hoff = s2 * (w / 4 - leafW / 2 + 0.09);
      if (side.axis === 'x') hd.position.set(at + hoff, h * 0.45, Z(side.fixed + 0.05));
      else hd.position.set(side.fixed + 0.05, h * 0.45, Z(at + hoff));
      root.add(hd);
    }

    // 바닥 문턱 — 입구 위치가 바닥에서도 읽힌다
    const sill = new THREE.Mesh(
      track(new THREE.BoxGeometry(...(side.axis === 'x' ? [w, 0.012, T * 1.6] : [T * 1.6, 0.012, w]))),
      mat.frame,
    );
    if (side.axis === 'x') sill.position.set(at, 0.006, Z(side.fixed));
    else sill.position.set(side.fixed, 0.006, Z(at));
    root.add(sill);
  }

  /**
   * 컷어웨이 — **카메라와 방 사이를 막는 벽을 숨긴다.**
   *
   * 두께 있는 벽은 안을 완전히 가린다. 참고한 화면(`pascalorg/editor`)이
   * 안이 보이는 이유가 이 처리다. 매 프레임 카메라 방향으로 판정한다 —
   * 궤도를 돌리면 숨는 벽이 바뀐다.
   */
  const _v = new THREE.Vector3();
  function updateCutaway(camera) {
    camera.getWorldDirection(_v).setY(0).normalize();   // 카메라가 보는 방향
    for (const m of wallMeshes) {
      // 안쪽 방향과 시선이 같은 쪽 = 카메라가 그 벽을 등 뒤에서 통과해 보고 있다 → 숨긴다
      m.visible = _v.dot(m.userData.inward) < 0.35;
    }
  }

  // ── 창 유리. 레퍼런스에 있고 우리에게 없던 것 — **벽면이 살아난다.**
  for (const wd of layout.windows ?? []) {
    const side = SIDES.find((x) => x.name === wd.wall);
    if (!side) continue;
    const wg = new THREE.Group();
    wg.name = wd.id ?? 'window';
    wg.userData.item = {
      kind: 'window', id: wd.id, name: '창', wall: wd.wall, axis: side.axis,
      atMm: wd.atMm, widthMm: wd.widthMm, spanMm: side.axis === 'x' ? layout.floor.widthMm : layout.floor.depthMm,
    };
    contents.add(wg);
    const root = wg;                       // 아래 조각들이 이 그룹으로 들어간다
    const w = mm(wd.widthMm); const h = mm(wd.heightMm); const at = mm(wd.atMm);
    const yc = mm(wd.sillMm ?? 900) + h / 2;
    const dims = side.axis === 'x' ? [w, h, 0.04] : [0.04, h, w];
    const g2 = new THREE.Mesh(track(new THREE.BoxGeometry(...dims)), matGlassDoor);
    // **여기가 `Z()` 를 빼먹고 있었다** (2026-08-03 발견). 창 유리·창틀 9개가 방 반대편
    // 밖(z +1.6·+3.6·+1.4)에 떠 있었고, 대시보드 첫 화면에서 판때기로 보였다.
    // D43 이 잡은 거울 사상과 같은 종류다 — 평면도 Y 는 **예외 없이** 이 함수를 지난다.
    if (side.axis === 'x') g2.position.set(at, yc, Z(side.fixed));
    else g2.position.set(side.fixed, yc, Z(at));
    root.add(g2);
    // 창틀
    const fd = side.axis === 'x' ? [w + 0.08, 0.06, T * 1.2] : [T * 1.2, 0.06, w + 0.08];
    for (const sy of [-1, 1]) {
      const f = new THREE.Mesh(track(new THREE.BoxGeometry(...fd)), mat.frame);
      if (side.axis === 'x') f.position.set(at, yc + sy * h / 2, Z(side.fixed));
      else f.position.set(side.fixed, yc + sy * h / 2, Z(at));
      root.add(f);
    }
  }

  // ── 내부 부품. **배치안이 이름과 좌표만 들고 있고 형태는 props/ 에 있다.**
  // `img2threejs` 로 만든 부품도 같은 계약이면 그대로 조립된다.
  contents.add(assembleProps(layout.props));

  // ── 스테이션. **회색 박스를 걷어냈다** — 부품 형태로 그린다(`prop` 필드).
  // 판정은 바닥 링으로만 한다. 그래야 중앙이 깔끔하고 무엇이 범위 밖인지가 또렷하다.
  const reach = Object.fromEntries(reachCheck(layout).map((r) => [r.id, r]));
  for (const st of layout.stations ?? []) {
    const px = mm(st.posMm[0]); const pz = mm(st.posMm[1]);
    if (st.prop) {
      const grp = assembleProps([{
        // **z 는 `posMm[2]` 다.** 전에는 `baseMm ?? 0` 이라 z 를 버리고 바닥에 그렸는데,
        // 도달 판정(`schema.js` `reachCheck`)은 같은 `posMm` 을 3D 로 재고 있었다 —
        // **링은 900mm 기준으로 켜지는데 물건은 바닥에 있었다.** `baseMm` 은 명시 override 로 남긴다.
        id: st.id, type: st.prop, posMm: [st.posMm[0], st.posMm[1], st.baseMm ?? st.posMm[2] ?? 0],
        rotDeg: st.rotDeg ?? 0, opts: st.opts,
      }]);
      // 스테이션은 판정 대상이라 표식을 따로 준다 — 끌면 도달 여부가 실시간으로 바뀐다
      grp.children[0].userData.item = { kind: 'station', id: st.id, name: st.name };
      contents.add(grp);
    }
    // 바닥 표식 — 닿으면 초록, 못 닿으면 빨강. **이게 배치 판정의 전부다.**
    const ok = reach[st.id]?.inReach;
    const ring = new THREE.Mesh(
      track(new THREE.RingGeometry(0.34, 0.42, 32)),
      new THREE.MeshBasicMaterial({
        color: ok ? C.ok : C.danger, transparent: true,
        opacity: ok ? 0.55 : 0.95, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(px, 0.005, Z(pz));
    contents.add(ring);
  }

  // ── 팔 자리 + 도달 범위. 링이 이 화면의 주인공이다.
  const armSlot = new THREE.Group();
  armSlot.position.set(mm(layout.arm.basePosMm[0]), mm(layout.arm.basePosMm[2]),
                       Z(mm(layout.arm.basePosMm[1])));
  armSlot.rotation.y = (layout.arm.baseYawDeg ?? 0) * Math.PI / 180;   // Z 부호와 함께 뒤집힌다
  contents.add(armSlot);

  const zone = makeReachZone({ radius: mm(layout.arm.reachMm), height: 0.9 });
  zone.rotation.x = -Math.PI / 2;   // reach-zone 은 Z-up 으로 만든다
  zone.position.y = -mm(layout.arm.basePosMm[2]) + 0.005;  // 링은 바닥에 놓는다
  armSlot.add(zone);

  mountArm?.(armSlot, layout);

  // ── AMR. 가상 팔의 도달 범위도 같이 — 이게 "이동하는 도달 범위" 다.
  //
  // **경로 선을 안 그린다** (주인님 요청 · 2026-08-04). 배치를 정하는 화면에서 선 두 줄이
  // 바닥을 가로질러 가구보다 눈에 띄었다. 이동거리는 숫자줄이 계속 말한다.
  // 대신 **도킹 자리에 세우고 고를 수 있게** 한다 — 도킹존이 배치의 변수이기 때문이다.
  for (const a of layout.amrs ?? []) {
    const g = new THREE.Group();
    const at = a.dockPosMm ?? a.waypointsMm?.[0] ?? [0, 0];
    g.position.set(mm(at[0]), 0, Z(mm(at[1])));
    g.name = a.id ?? 'amr';
    g.userData.item = { kind: 'amr', id: a.id, type: 'amr', name: a.model ?? 'AMR' };
    contents.add(g);

    // 몸통 + **라이다**. 상자만 두면 바닥에 붙은 회색 덩어리라 가구에 묻힌다 —
    // 위로 솟은 원통 하나가 "자율주행 로봇" 신호를 완성한다 (터틀봇 실물도 그렇다).
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.19, 0.3)), mat.amr);
    body.position.y = 0.095;
    body.castShadow = true;
    g.add(body);
    const lidar = new THREE.Mesh(track(new THREE.CylinderGeometry(0.037, 0.037, 0.09, 12)), mat.amr);
    lidar.position.set(0, 0.235, -0.06);
    lidar.castShadow = true;
    g.add(lidar);

    if (a.reachMm) {
      const r = makeReachZone({ radius: mm(a.reachMm), height: 0.5, color: C.virtual });
      r.rotation.x = -Math.PI / 2;
      r.position.y = 0.006;
      g.add(r);
    }
  }

  // ── 경로 교차 — **교착이 나는 자리다.** 배치 단계에서 미리 보여준다.
  for (const x of crossings(layout)) {
    const m = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.07, 16, 12)),
      new THREE.MeshBasicMaterial({ color: C.warn, transparent: true, opacity: 0.85 }),
    );
    m.position.set(mm(x.atMm[0]), 0.07, Z(mm(x.atMm[1])));
    contents.add(m);
  }

  return {
    root,
    contents,          // 피킹 루트이자 시점 대상
    updateCutaway,   // 시점을 여기에 맞춘다 — 방까지 담으면 내용물이 작아진다
    armSlot,
    /** 화면 옆에 띄울 판정값. 3D 와 같은 데이터에서 나온다. */
    report: () => ({ reach: reachCheck(layout), crossings: crossings(layout) }),
    dispose() {
      for (const g of disposables) g.dispose();
      root.traverse((o) => { if (o.isMesh || o.isLine) o.geometry?.dispose?.(); });
      root.removeFromParent();
    },
  };
}
