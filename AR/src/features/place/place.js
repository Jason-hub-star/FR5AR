// 배치안을 실제 공간에 놓는 계산 — **DOM 도 XR 세션도 안 건드린다.**
//
// 화면(`screens/xr.js`)에서 떼어낸 이유는 하나다: 여기 셋이 틀리면 화면이 **조용히 거짓말**을
// 하는데, `immersive-ar` 은 폰에서만 열려 게이트가 그걸 절대 못 본다. 순수 함수로 빼 두면
// `scripts/check/xr-web-verify.mjs` 가 브라우저 없이 숫자로 판정한다.
//
// 실제로 이 셋에서 한 번씩 사고가 났다 —
//   · 회전 부호를 뒤집어 맵이 반대로 돌 뻔했다 (2026-08-05, 배포 전 손계산이 잡았다)
//   · 계기가 확대해도 `실물 1:1` 이라 적었다 (2026-08-06 `/감사`)
//   · 벽이 불투명해 1:1 로 들어가면 실제 방을 통째로 가렸다 (2026-08-06)

import * as THREE from 'three';

/**
 * 아는 맵의 **마주보는 두 모서리**에서 배율과 회전을 한 번에 낸다.
 *
 * 실물 대각선을 우리가 알고 있으니 **맵 자체가 자(尺)**가 된다. 잰 거리와 참값의 비가
 * 곧 이 방·이 세션의 WebXR 축척 오차이고, 그걸 그대로 곱해 지운다.
 *
 * **부호에 주의.** three.js 의 Y 회전은 `atan2(z,x)` 를 그만큼 **깎는다**
 * (x' = x·cos + z·sin, z' = −x·sin + z·cos). 빼는 순서를 뒤집으면 맵이 반대로 돈다.
 *
 * @param {{x:number,z:number}} a 첫 모서리 (배치안 원점에 해당하는 쪽)
 * @param {{x:number,z:number}} b 대각선 반대편 모서리
 * @param {number} widthM  배치안 가로 (m)
 * @param {number} depthM  배치안 세로 (m)
 * @returns {{scale:number, yaw:number, measuredM:number, diagM:number}}
 */
export function solveCorners(a, b, widthM, depthM) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const measuredM = Math.hypot(dx, dz);          // 바닥 평면 거리만 쓴다
  const diagM = Math.hypot(widthM, depthM);
  // 로컬 대각선 방향 — `layout-view.js` 의 Z 가 거울이라 −depth 다
  const yawLocal = Math.atan2(-depthM, widthM);
  return { scale: measuredM / diagM, yaw: yawLocal - Math.atan2(dz, dx), measuredM, diagM };
}

const pct = (s) => `${s >= 1 ? '+' : ''}${((s - 1) * 100).toFixed(1)}%`;

/**
 * 계기 문자열. **크기는 언제나 배율을 곱한 실제 값**이다 — 배치안 치수를 그대로 적으면
 * 확대·축소한 뒤에도 같은 숫자가 남아 계기가 거짓말을 한다.
 *
 * `zoomed`(손으로 늘림)와 촬영의 `보정`(1:1 을 **맞추려고** 곱한 값)은 다른 것이라 라벨이 갈린다.
 */
export function hudText({ mode, scale, widthM, depthM, yaw = 0, zoomed = false }) {
  const deg = Math.round((yaw * 180) / Math.PI);
  const size = `${(widthM * scale).toFixed(2)}×${(depthM * scale).toFixed(2)}m`;
  if (mode === 'fit') return `1:${(1 / scale).toFixed(1)} 축소 · ${size} · ${deg}°`;
  return `${zoomed ? `1:1 아님 ${pct(scale)}` : '실물 1:1'} · ${size}`
    + `${mode === 'real' && !zoomed ? ` · 보정 ${pct(scale)}` : ''} · ${deg}°`;
}

/**
 * 벽을 유령으로 바꾸고 모서리만 긋는다. **겹치기 전용** — 불투명한 벽 넉 장은 1:1 로
 * 들어가면 실제 방을 통째로 가려, 그건 겹치기가 아니라 VR 이 된다.
 *
 * 벽을 고르는 근거: `layout-view.js` 는 벽 조각을 `root` **직속 메시**로 넣고 문·창·소품은
 * `contents` 로 넣는다. 그래서 슬래브를 뺀 직속 메시가 곧 벽이다.
 *
 * @returns {{walls:number, ghost:THREE.Material, edge:THREE.Material}} 재질은 부르는 쪽이 지운다
 */
export function ghostWalls(root, slab) {
  const ghost = new THREE.MeshStandardMaterial({
    color: 0xf4f4f5, roughness: 0.95, transparent: true, opacity: 0.16,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const edge = new THREE.LineBasicMaterial({ color: 0x8fb6d9, transparent: true, opacity: 0.75 });
  let walls = 0;
  for (const o of [...root.children]) {
    if (!o.isMesh || o === slab) continue;
    o.material = ghost;
    o.castShadow = false;                 // 유령이 그림자를 던지면 방이 어두워진다
    o.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry), edge));
    walls += 1;
  }
  return { walls, ghost, edge };
}
