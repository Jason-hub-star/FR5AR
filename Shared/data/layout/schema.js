// 배치안 모델 — **AR 과 Dashboard 의 유일한 합의점** (SHARED-CORE.md).
//
// 여기가 갈라지면 두 화면이 다른 배치를 보는데 **양쪽 다 정상으로 보인다.**
// 대시보드가 측정한 배치와 AR 이 겹쳐 보여주는 배치가 다른데 에러가 안 난다 (D17).
//
// **원점은 실험실 바닥의 한 점이다. 로봇 베이스가 아니다** (SR_23).
// 로봇 위치가 배치안의 **변수**라서, 로봇을 원점으로 삼으면 배치를 바꿀 때
// 좌표계가 따라 움직여 A·B 를 비교할 수 없다. 실험 자체가 무의미해진다.
//
// 축·단위 — x·y = 바닥 평면 · **z = 위**(Z-up) · **밀리미터 · 도(°)**

import { distMm } from '../units/units.js';

/** 배치안 하나의 빈 골격. 값은 전부 mm·도다. */
export function emptyLayout(id = 'A', name = '이름 없는 배치안') {
  return {
    id,
    name,
    unit: 'mm-deg',                       // 고정. 다른 값을 쓰지 않는다
    floor: { widthMm: 6000, depthMm: 4000, heightMm: 2700 },
    arm: {
      model: 'FR5',
      basePosMm: [3000, 2000, 900],       // 바닥 원점 기준. z = 작업대 높이
      baseYawDeg: 0,
      reachMm: 922,                       // FR5 스펙값 — 편집 대상이 아니다
    },
    stations: [],                         // { id, name, posMm:[x,y,z], sizeMm:[w,d,h] }
    amrs: [],                             // { id, model, reachMm, dockPosMm, waypointsMm }
    verified: false,
  };
}

/**
 * 배치안이 쓸 수 있는 모양인지 본다.
 *
 * **던지지 않고 목록을 돌려준다** — 편집 중에는 잠깐 틀린 상태가 정상이고,
 * 화면이 그때마다 죽으면 못 쓴다. 저장할 때만 막는다.
 */
export function validateLayout(L) {
  const bad = [];
  if (!L || typeof L !== 'object') return ['배치안이 객체가 아니다'];
  if (L.unit !== 'mm-deg') bad.push(`unit 이 'mm-deg' 가 아니다: ${L.unit}`);
  if (!L.floor?.widthMm || !L.floor?.depthMm) bad.push('floor 치수가 없다');
  if (!Array.isArray(L.arm?.basePosMm) || L.arm.basePosMm.length !== 3) {
    bad.push('arm.basePosMm 이 [x,y,z] 가 아니다');
  }
  if (!(L.arm?.reachMm > 0)) bad.push('arm.reachMm 이 없다');
  for (const s of L.stations ?? []) {
    if (!Array.isArray(s.posMm) || s.posMm.length !== 3) bad.push(`${s.id}: posMm 이 [x,y,z] 가 아니다`);
  }
  for (const a of L.amrs ?? []) {
    if (!Array.isArray(a.waypointsMm)) bad.push(`${a.id}: waypointsMm 이 배열이 아니다`);
  }
  return bad;
}

/**
 * 스테이션이 팔의 도달 범위 안인가 (UR_24).
 *
 * **배치가 좋은지 판단하는 유일한 기하학적 근거다.** 나머지 지표는 팀원이 낸다.
 * 높이 차이도 센다 — 평면에서만 재면 선반 위 스테이션을 놓친다.
 */
export function reachCheck(L) {
  const base = L.arm.basePosMm;
  const R = L.arm.reachMm;
  return (L.stations ?? []).map((s) => {
    const d = distMm(base, s.posMm);
    return { id: s.id, name: s.name, distMm: Math.round(d), inReach: d <= R, marginMm: Math.round(R - d) };
  });
}

/** AMR 한 대의 경로 길이 (mm). 이동거리 지표의 근거다. */
export function pathLengthMm(waypointsMm) {
  let sum = 0;
  for (let i = 1; i < waypointsMm.length; i += 1) {
    const [ax, ay] = waypointsMm[i - 1];
    const [bx, by] = waypointsMm[i];
    sum += Math.hypot(bx - ax, by - ay);
  }
  return Math.round(sum);
}

/**
 * AMR 두 대의 경로가 어디서 겹치나 — **교착이 나는 자리다.**
 *
 * 좁은 실험실에서 2대는 서로 막고, 그게 시연 당일 가장 잘 깨지는 지점이다
 * (`rnd/AMR-TWIN-DIRECTION-2026-07-30.md` §4). 배치 단계에서 미리 보여준다.
 *
 * 선분 교차를 정확히 풀지 않고 **표본점 사이 거리**로 근사한다 —
 * 경로가 만나지 않아도 **가까이 지나가면 이미 위험**하기 때문이다.
 */
export function crossings(L, nearMm = 600) {
  const out = [];
  const amrs = L.amrs ?? [];
  for (let i = 0; i < amrs.length; i += 1) {
    for (let j = i + 1; j < amrs.length; j += 1) {
      for (const p of amrs[i].waypointsMm) {
        for (const q of amrs[j].waypointsMm) {
          const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
          if (d <= nearMm) out.push({ a: amrs[i].id, b: amrs[j].id, atMm: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], gapMm: Math.round(d) });
        }
      }
    }
  }
  return out;
}
