// 실험실 내부 부품 카탈로그 — **화이트 모델 스타일.**
//
// 참고한 화면: `pascalorg/editor` 의 컷어웨이 백색 모형.
// 그 스타일의 핵심은 **텍스처가 없다는 것**이다 — 전부 흰색이고 디테일이 **형태**에서 온다.
// 그래서 외부 에셋도 텍스처도 필요 없고, 라이선스 문제도 0이다.
//
// **조립 규약** — 팩토리는 전부 이 계약을 지킨다:
//   · 입력은 **밀리미터**. 배치안과 같은 단위다 (하드 룰 5)
//   · 원점은 **바닥 중앙**. 그래야 `y=0` 에 놓기만 하면 선다
//   · 반환은 `THREE.Group`. 재질은 공유본을 쓴다 (드로우콜·메모리)
//   · **회전은 부르는 쪽이 한다.** 팩토리는 항상 정면(+Z)을 본다
//   · **두 조각의 겉면을 같은 평면에 두지 마라.** 덧대는 것(캡·테두리·판)은 감싸거나
//     파묻는다. 면이 정확히 겹치면 깊이 버퍼가 앞뒤를 못 정해 카메라가 움직일 때마다
//     승자가 바뀌어 **반짝인다**(z-fighting). 재질을 아무리 고쳐도 안 없어진다.
//     `blastWall` 캡에서 두 번 놓쳤다 — 처음엔 옆면만 고치고 **윗면**을 남겼다 (2026-08-04)
//
// `img2threejs` 로 만든 부품도 **같은 계약으로 맞춰서** 여기 넣으면 그대로 조립된다.

import * as THREE from 'three';
import { mm } from '../data/units/units.js';

// ── 재질. 화이트 모형이라 색이 아니라 **거칠기**로 구분한다.
export const M = {
  shell:  new THREE.MeshStandardMaterial({ color: 0xf2f2f3, roughness: 0.92, metalness: 0.0 }),
  body:   new THREE.MeshStandardMaterial({ color: 0xe8e9ea, roughness: 0.75, metalness: 0.0 }),
  steel:  new THREE.MeshStandardMaterial({ color: 0xd6d9dc, roughness: 0.32, metalness: 0.55 }),
  dark:   new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.5,  metalness: 0.2 }),
  // 유리 — 이 스타일의 유일한 색. 파란 유리가 "건축 모형" 느낌을 만든다
  glass:  new THREE.MeshStandardMaterial({
    color: 0xb9d2e3, roughness: 0.08, metalness: 0.0,
    transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false,
  }),
  screen: new THREE.MeshStandardMaterial({ color: 0x39424a, roughness: 0.28, metalness: 0.1 }),
};

const box = (wMm, hMm, dMm, material = M.body) =>
  new THREE.Mesh(new THREE.BoxGeometry(mm(wMm), mm(hMm), mm(dMm)), material);

/** 원통. 기본 축은 Y — 눕히려면 부르는 쪽이 돌린다 (box 와 같은 규약). */
const cyl = (diaMm, lenMm, material = M.body, seg = 12) =>
  new THREE.Mesh(new THREE.CylinderGeometry(mm(diaMm / 2), mm(diaMm / 2), mm(lenMm), seg), material);

/** 그림자를 켜서 붙인다 — 접지감이 없으면 물체가 떠 보인다. */
function add(group, mesh, xMm = 0, yMm = 0, zMm = 0) {
  mesh.position.set(mm(xMm), mm(yMm), mm(zMm));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// ── 작업대. 실험실에서 가장 많은 것.
export function bench({ wMm = 1600, dMm = 700, hMm = 900 } = {}) {
  const g = new THREE.Group();
  const topH = 40;
  add(g, box(wMm, topH, dMm, M.steel), 0, hMm - topH / 2, 0);          // 상판
  const legT = 60;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(g, box(legT, hMm - topH, legT, M.dark),
      sx * (wMm / 2 - legT), (hMm - topH) / 2, sz * (dMm / 2 - legT));
  }
  add(g, box(wMm - 160, 380, dMm - 200, M.body), 0, 250, -40);          // 하부 수납
  return g;
}

// ── 아이솔레이터 / 글러브박스. 보내주신 클린룸 사진의 그것 — **가장 실험실다운 형태다.**
export function isolator({ wMm = 1800, dMm = 900, hMm = 2200 } = {}) {
  const g = new THREE.Group();
  const deskH = 950;
  add(g, box(wMm, deskH, dMm, M.body), 0, deskH / 2, 0);                // 하부 캐비닛
  add(g, box(wMm, 50, dMm, M.steel), 0, deskH + 25, 0);                 // 작업면
  const chamberH = hMm - deskH - 250;
  add(g, box(wMm, chamberH, dMm, M.glass), 0, deskH + 50 + chamberH / 2, 0);   // 유리 챔버
  add(g, box(wMm, 60, dMm, M.shell), 0, deskH + 50 + chamberH, 0);      // 챔버 테두리
  add(g, box(wMm, 190, dMm, M.shell), 0, hMm - 95, 0);                  // 상부 필터 유닛
  // 글러브 포트 — 원 두 개가 이 물건의 정체를 만든다
  for (const sx of [-1, 1]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(mm(160), mm(34), 10, 24), M.shell,
    );
    ring.position.set(mm(sx * wMm * 0.22), mm(deskH + 50 + chamberH * 0.45), mm(dMm / 2));
    ring.castShadow = true;
    g.add(ring);
  }
  return g;
}

// ── 선반. 층이 보이면 "보관"으로 읽힌다.
export function shelf({ wMm = 900, dMm = 450, hMm = 1900, levels = 4 } = {}) {
  const g = new THREE.Group();
  const t = 30;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(g, box(50, hMm, 50, M.dark), sx * (wMm / 2 - 25), hMm / 2, sz * (dMm / 2 - 25));
  }
  for (let i = 0; i < levels; i += 1) {
    add(g, box(wMm, t, dMm, M.shell), 0, 250 + (i * (hMm - 300)) / (levels - 1), 0);
  }
  return g;
}

// ── 계측기. 화면 + 손잡이가 있으면 장비로 읽힌다.
export function instrument({ wMm = 700, dMm = 600, hMm = 550 } = {}) {
  const g = new THREE.Group();
  add(g, box(wMm, hMm, dMm, M.body), 0, hMm / 2, 0);
  add(g, box(wMm * 0.55, hMm * 0.4, 20, M.screen), 0, hMm * 0.62, dMm / 2);   // 화면
  add(g, box(wMm * 0.8, 40, 40, M.dark), 0, hMm * 0.22, dMm / 2);             // 손잡이
  add(g, box(wMm * 0.9, 60, dMm * 0.9, M.shell), 0, hMm + 30, 0);             // 상판 뚜껑
  return g;
}

// ── 모니터 + 키보드. 작업대 위에 이게 있으면 "쓰는 자리" 가 된다.
export function workstation({ wMm = 620, hMm = 420 } = {}) {
  const g = new THREE.Group();
  // **원점은 발자국 가운데다** (파일 머리 규약). 키보드가 260mm 앞으로 나와 있어
  // 그냥 두면 원점이 122mm 뒤로 치우친다 — 자리를 작업대 밖으로 흘리는 원인이었다.
  // 모니터를 그만큼 뒤로 물려 앞뒤를 맞춘다.
  const dz = -122;
  add(g, box(120, 30, 180, M.dark), 0, 15, dz);                          // 받침
  add(g, box(60, hMm * 0.4, 60, M.dark), 0, hMm * 0.2, dz);              // 기둥
  const panel = add(g, box(wMm, hMm * 0.6, 24, M.screen), 0, hMm * 0.62, dz);
  panel.rotation.x = -0.12;
  add(g, box(420, 18, 150, M.shell), 0, 9, 260 + dz);                    // 키보드
  return g;
}

/** 이름 → 팩토리. 배치안이 이 이름으로 부품을 부른다. */
export const PROPS = { bench, isolator, shelf, instrument, workstation };

/**
 * 부품의 **지금 크기**(mm). 화면의 크기 칸이 현재 값을 보여주려고 쓴다.
 *
 * 팩토리 기본값은 코드 안에만 있어서 화면이 알 길이 없다. 서명을 문자열로 파싱하는
 * 방법도 있지만 **압축 빌드에서 인자 이름이 바뀌어** 개발에선 되고 배포에선 깨진다 —
 * 그 종류의 버그는 안 만든다. 그래서 **실제로 만들어 재고** 결과를 캐시한다.
 */
const sizeCache = new Map();
export function sizeMmOf(type, opts = {}) {
  const key = type + JSON.stringify(opts);
  let v = sizeCache.get(key);
  if (!v) {
    const make = PROPS[type];
    if (!make) return null;
    const s = new THREE.Box3().setFromObject(make(opts)).getSize(new THREE.Vector3());
    v = { x: Math.round(s.x * 1000), y: Math.round(s.y * 1000), z: Math.round(s.z * 1000) };
    sizeCache.set(key, v);
  }
  return v;
}

/**
 * 배치안의 `props` 배열을 실제 3D 로 조립한다.
 *
 * 배치안이 **이름과 좌표만** 들고 있고 형태는 여기 있다 —
 * 그래야 부품을 고쳐도 배치안이 안 바뀐다.
 */
export function assembleProps(props = []) {
  const g = new THREE.Group();
  g.name = 'props';
  for (const p of props) {
    const make = PROPS[p.type];
    if (!make) { console.warn(`모르는 부품: ${p.type}`); continue; }
    const node = make(p.opts ?? {});
    // 배치안은 Z-up(x,y 바닥) · three 는 Y-up → y 와 z 를 바꾸고 **평면도 Y 는 부호를 뒤집는다**.
    // 그냥 맞바꾸면 거울 사상이 된다 (D43 · `layout-view.js` 의 Z 와 같은 규약).
    node.position.set(mm(p.posMm[0]), mm(p.posMm[2] ?? 0), -mm(p.posMm[1]));
    node.rotation.y = ((p.rotDeg ?? 0) * Math.PI) / 180;
    node.name = p.id ?? p.type;
    // **편집 단위 표식.** 인터랙션이 맞은 메시에서 위로 올라가며 이걸 찾는다.
    node.userData.item = { kind: 'prop', id: p.id ?? p.type, type: p.type };
    g.add(node);
  }
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// 아래는 Codex 로 뽑은 레퍼런스(`docs/research/lab-reference-2026-07-31.png`)를 보고
// **빠져 있던 것**을 채운 것들이다. 그림과 대조해 다섯 가지가 없었다:
//   ① 벤치가 끊긴 박스였다 → **연속 열**이어야 실험실로 읽힌다
//   ② **상부장**이 없었다 → 벽면이 비어 창고처럼 보였다
//   ③ 로봇 셀에 **안전 펜스**가 없었다 → "작업 셀" 로 안 읽혔다
//   ④ 문이 개구부뿐이었다 → **유리 문짝**이 있어야 입구다
//   ⑤ 위에 **작은 물건**이 없었다 → 디테일은 큰 가구가 아니라 잔물건에서 온다
// ─────────────────────────────────────────────────────────────────────────────

/** 벤치 열 — 길이를 주면 하부장을 반복해 채운다. 실험실 벽면의 기본 단위다. */
export function benchRun({ lengthMm = 4000, dMm = 700, hMm = 900, sink = false } = {}) {
  const g = new THREE.Group();
  const topH = 40;
  add(g, box(lengthMm, topH, dMm, M.steel), 0, hMm - topH / 2, 0);       // 연속 상판
  add(g, box(lengthMm, 60, 40, M.shell), 0, hMm + 20, -dMm / 2 + 20);    // 뒷턱

  // 하부장 — 900mm 모듈로 나눠 문·서랍 선을 낸다. 그 선이 "실험실 가구" 신호다.
  const unit = 900;
  const n = Math.max(1, Math.round(lengthMm / unit));
  const w = lengthMm / n;
  for (let i = 0; i < n; i += 1) {
    const cx = -lengthMm / 2 + w * (i + 0.5);
    add(g, box(w - 20, hMm - topH - 120, dMm - 60, M.body), cx, (hMm - topH) / 2 + 40, 0);
    // 문 두 짝 (홈이 파인 것처럼 얇은 판을 앞에 띄운다)
    for (const s of [-1, 1]) {
      add(g, box(w / 2 - 40, hMm - topH - 200, 16, M.shell),
        cx + s * (w / 4 - 5), (hMm - topH) / 2 + 40, dMm / 2 - 22);
    }
    add(g, box(w - 60, 14, 20, M.dark), cx, hMm - topH - 110, dMm / 2 - 14);  // 손잡이
  }
  add(g, box(lengthMm, 120, dMm - 100, M.dark), 0, 60, 0);               // 걸레받이(그림자용)

  if (sink) {
    const s = add(g, box(500, 60, 400, M.steel), -lengthMm / 2 + 500, hMm - topH - 20, 0);
    s.material = M.steel;
    add(g, box(30, 260, 30, M.steel), -lengthMm / 2 + 500, hMm + 130, -140);  // 수전
  }
  return g;
}

/** 상부장 — 벤치 위 벽에 붙는다. **이게 없으면 벽면이 비어 창고처럼 보인다.** */
export function wallCabinet({ lengthMm = 2400, dMm = 350, hMm = 700, baseMm = 1450, open = false } = {}) {
  const g = new THREE.Group();
  add(g, box(lengthMm, hMm, dMm, M.body), 0, baseMm + hMm / 2, 0);
  const unit = 800;
  const n = Math.max(1, Math.round(lengthMm / unit));
  const w = lengthMm / n;
  for (let i = 0; i < n; i += 1) {
    const cx = -lengthMm / 2 + w * (i + 0.5);
    // 열린 칸은 유리, 닫힌 칸은 흰 문 — 섞이면 훨씬 실제 같다
    add(g, box(w - 24, hMm - 40, 14, open ? M.glass : M.shell), cx, baseMm + hMm / 2, dMm / 2 - 8);
    if (open) add(g, box(w - 40, 16, dMm - 40, M.shell), cx, baseMm + hMm / 2, 0);  // 중간 선반
  }
  return g;
}

/** 안전 펜스 — 로봇 셀 둘레. **이게 있어야 "작업 셀" 로 읽힌다.** 앞면은 비운다(출입). */
export function safetyFence({ wMm = 2600, dMm = 2000, hMm = 1500 } = {}) {
  const g = new THREE.Group();
  const post = 70;
  const sides = [
    [wMm, post, 0, -dMm / 2],                    // 뒤
    [post, dMm, -wMm / 2, 0],                    // 좌
    [post, dMm, wMm / 2, 0],                     // 우
  ];
  for (const [w, d, x, z] of sides) {
    add(g, box(w, hMm, d, M.glass), x, hMm / 2, z);
    add(g, box(w, 60, d + 10, M.dark), x, hMm - 30, z);      // 상단 프레임
    add(g, box(w, 60, d + 10, M.dark), x, 40, z);            // 하단 프레임
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(g, box(post, hMm, post, M.dark), sx * wMm / 2, hMm / 2, sz * dMm / 2);
  }
  return g;
}

/** 잔물건 — 병·랙·상자. **디테일은 큰 가구가 아니라 여기서 온다.** */
Object.assign(PROPS, { benchRun, wallCabinet, safetyFence });

// ─────────────────────────────────────────────────────────────────────────────
// 방산 해체 라인 소품 (D51 · S1). 레퍼런스는 Codex 로 뽑았고 **문구가 정본이다** —
// `MILESTONES.md` §S1 의 스타일 문구. 이미지는 저장소에 안 넣는다 (한 장 1.2MB,
// `Shared/assets/` 는 publicDir 로 dist 에 통째 복사된다).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 롤러 컨베이어 — 해체 라인의 입구. **1사이클의 시작점**이다.
 *
 * `hMm` 은 다리 높이가 아니라 **이송면(롤러 윗면) 높이**다. 기본 900 은 `bench`·`benchRun`
 * 상판과 같은 값이라 라인이 끊기지 않는다 — 여기를 바꾸면 물건이 턱을 넘는다.
 */
export function conveyor({
  lengthMm = 2400, wMm = 600, hMm = 900, rollerDiaMm = 76, pitchMm = 100,
  rampMm = 0, dropMm = 0,
} = {}) {
  const g = new THREE.Group();
  const railH = 90;                     // 사이드 레일 높이
  const railT = 40;                     // 사이드 레일 두께
  // **레일 상단이 롤러 상단보다 낮다.** 실물 롤러 컨베이어가 그렇고, 반대로 하면
  // 롤러가 홈에 파묻혀 컨베이어가 아니라 벤치로 읽힌다 (첫 렌더의 결함).
  const railTop = hMm - rollerDiaMm * 0.16;
  const railY = railTop - railH / 2;
  const legT = 70;
  const legInset = 220;                 // 다리는 끝에서 안쪽으로 — 이미지의 그 비율

  // ── 램프 — **−X 끝이 낮아진다.** AMR 이 900mm 상판 위로 물건을 들어 올릴 수는 없다.
  // 낮은 끝에 대면 밀어 넣는 것으로 끝나고, 나머지는 경사가 한다.
  // `rampMm` 은 경사 구간의 **수평 길이**이고 `dropMm` 은 그 구간에서 낮아지는 높이다.
  const ramp = Math.max(0, Math.min(rampMm, lengthMm - 2 * railT));
  const drop = ramp > 0 ? Math.max(0, Math.min(dropMm, hMm - railH - 100)) : 0;
  const flat = lengthMm - ramp;
  const x0 = -lengthMm / 2;                       // 낮은 끝
  const slope = ramp > 0 ? Math.atan2(drop, ramp) : 0;
  const hyp = Math.hypot(ramp, drop);
  /** 길이축 x 에서의 이송면 높이. 램프 밖은 그냥 `hMm` 이다. */
  const topAt = (x) => (ramp > 0 && x < x0 + ramp ? hMm - drop * (1 - (x - x0) / ramp) : hMm);

  // ── 사이드 레일 (길이 방향 X, 폭 방향 Z). 램프가 있으면 두 토막이다
  for (const s of [-1, 1]) {
    const z = s * (wMm / 2 - railT / 2);
    add(g, box(flat, railH, railT, M.steel), x0 + ramp + flat / 2, railY, z);
    if (ramp > 0) {
      const m = box(hyp, railH, railT, M.steel);
      m.rotation.z = slope;                       // +X 쪽이 올라간다
      add(g, m, x0 + ramp / 2, railY - drop / 2, z);
    }
  }

  // ── 롤러. 축이 Z 이므로 X 로 90° 눕힌다.
  // ponytail: 롤러 축 볼트(레일 바깥면의 작은 머리)는 안 그린다 — 배치 축척에서 1px 미만이고
  // 롤러당 2개면 메시가 48개 는다. 근접 뷰가 필요해지면 그때 넣는다.
  const span = lengthMm - 2 * railT;
  const n = Math.max(2, Math.floor(span / pitchMm));
  const step = span / n;
  for (let i = 0; i < n; i += 1) {
    // 롤러는 금속이다 — `shell`(거의 흰색) 로 두면 베드가 흰 판때기로 읽힌다 (2차 렌더의 결함)
    const r = cyl(rollerDiaMm, wMm - 2 * railT, M.steel);
    r.rotation.x = Math.PI / 2;
    const x = -span / 2 + step * (i + 0.5);
    add(g, r, x, topAt(x) - rollerDiaMm / 2, 0);
  }

  // ── 낮은 끝의 짧은 다리 한 쌍. 없으면 램프가 허공에서 시작한다
  if (ramp > 0) {
    const lowH = topAt(x0) - railH - rollerDiaMm * 0.16;
    for (const sz of [-1, 1]) {
      add(g, box(legT, Math.max(60, lowH), legT, M.dark),
        x0 + legT, Math.max(60, lowH) / 2, sz * (wMm / 2 - (legT + 50) / 2));
    }
  }

  // ── 다리 4개 + 발판
  const legH = railTop - railH;
  const footT = legT + 50;
  // 다리는 레일보다 살짝 안쪽이다 — **발판까지 `wMm` 안에 들어와야** bbox 가 폭과 같아지고,
  // 배치 충돌·도달범위 검사가 실제 점유 면적을 본다.
  const legZ = wMm / 2 - footT / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (lengthMm / 2 - legInset);
    add(g, box(legT, legH, legT, M.dark), x, legH / 2, sz * legZ);
    add(g, box(footT, 16, footT, M.dark), x, 8, sz * legZ);          // 발판
  }

  // **벨트가 자기 이송면을 말해 준다.** 작업물이 컨베이어 위에 앉으려면 화면 쪽이
  // "여기 높이가 몇인가" 를 물어야 하는데, 램프 때문에 그 값이 위치마다 다르다.
  // 계산을 여기 한 곳에 두고 밖에서는 부르기만 한다 (하드 룰 5).
  g.userData.belt = {
    lengthMm, wMm,
    /** 길이축 로컬 x(mm) 에서의 이송면 높이(mm). 벨트 밖이면 `null`. */
    topAtMm(localXMm, localZMm) {
      if (Math.abs(localXMm) > lengthMm / 2 || Math.abs(localZMm) > wMm / 2) return null;
      return topAt(localXMm);
    },
  };

  // ── 하부 브레이스. 길이 방향 2줄 + 다리쌍마다 가로 1줄 — 이게 있어야 "구조물" 로 읽힌다.
  const braceY = legH * 0.22;
  for (const sz of [-1, 1]) {
    add(g, box(lengthMm - 2 * legInset, 50, 30, M.dark), 0, braceY, sz * legZ);
  }
  for (const sx of [-1, 1]) {
    add(g, box(30, 50, wMm - railT, M.dark), sx * (lengthMm / 2 - legInset), braceY, 0);
  }
  return g;
}

/**
 * 탄두 — **소품이 아니라 작업물이다.** 다른 부품은 놓이지만 이건 로봇이 집고 분해한다.
 *
 * ⚠ **치수는 실물 페트병 기준(Ø65×220)이다** (D51). 실제 포탄 치수로 그리면 실물 점유
 * 부피를 넘어 AR 에서 사람이 충돌 여지를 오판한다. **비율만 탄두처럼 간다.**
 *
 * `stage` 가 해체 4단계다 — 0 완성 · 1 유도부 분리 · 2 신관 분리 · 3 주탄약 분리(빈 케이싱).
 * 사이클이 진행되며 이게 쪼개지는 것이 곧 진행률이다 (F10).
 */
export function warhead({ stage = 0, diaMm = 65, lengthMm = 220 } = {}) {
  const g = new THREE.Group();
  const noseLen = lengthMm * 0.34;
  const bodyLen = lengthMm - noseLen;
  // `diaMm` 은 **최대 외경(회전 밴드 기준)** 이다 — 동체는 그보다 얇다.
  // 밴드를 동체보다 굵게 두면서 이걸 안 맞추면 바닥을 파고들고 bbox 가 인자를 넘는다.
  const y = diaMm / 2;                       // 눕혀 놓는다 — 바닥에서 최대 반지름만큼
  const bodyDia = (stage >= 3 ? diaMm * 0.92 : diaMm) - 6;
  const body = cyl(bodyDia, bodyLen, M.body, 20);
  body.rotation.z = Math.PI / 2;             // 축을 X 로 눕힌다
  add(g, body, (lengthMm - bodyLen) / 2 - lengthMm / 2 + bodyLen / 2 - bodyLen / 2, y, 0);
  body.position.x = mm(lengthMm / 2 - bodyLen / 2);

  // 회전 밴드 2줄 — 이게 있어야 매끈한 원통이 아니라 탄체로 읽힌다
  for (const f of [0.22, 0.74]) {
    const band = cyl(diaMm, 10, M.dark, 20);
    band.rotation.z = Math.PI / 2;
    add(g, band, lengthMm / 2 - bodyLen * f, y, 0);
  }

  // 노즈. stage 0 완전 · 1 유도부만 잘려 뭉툭 · 2 이상 없음
  if (stage <= 1) {
    const cut = stage === 0 ? 1 : 0.55;
    const nose = new THREE.Mesh(
      new THREE.CylinderGeometry(mm(diaMm * (stage === 0 ? 0.06 : 0.42)), mm(diaMm / 2),
        mm(noseLen * cut), 20),
      M.body,
    );
    // +90° 여야 좁은 끝이 −X(바깥) 을 본다. −90° 면 뒤집혀 뾰족한 쪽이 동체에 박힌다.
    nose.rotation.z = Math.PI / 2;
    add(g, nose, -lengthMm / 2 + noseLen * cut / 2, y, 0);
  }
  return g;
}

/**
 * 리프트 클램프 — **탄두를 밑에서 받쳐 공중으로 들어 올린다.** 돌리는 물건이 아니다.
 *
 * 레퍼런스는 Codex 로 뽑았고 문구가 정본이다 (`MILESTONES.md` §S1 스타일 문구).
 * 형태의 정체는 셋이다 — **① 양쪽 승강 기둥(볼스크류+리니어 레일) ② 그 사이를 오르내리는
 * 크로스바 ③ 크로스바 위의 V블록 한 쌍.** 이 셋이 없으면 그냥 받침대로 읽힌다.
 *
 * `liftMm` 은 **V홈 바닥 높이**다 — 여기에 작업물 축이 얹힌다. 컨베이어 이송면(기본 900)
 * 보다 높아야 "들어 올렸다" 가 되고, 배치안의 스테이션 z 가 이 값과 같아야 한다.
 */
export function lifter({ wMm = 900, dMm = 620, hMm = 1150, liftMm = 1050, cradleMm } = {}) {
  const g = new THREE.Group();
  const baseH = 45;
  const colW = 95;                       // 승강 기둥 단면
  const colX = wMm / 2 - colW / 2 - 40;
  // **아무것도 베이스 밖으로 안 나간다.** 처음엔 옆 클램프가 `wMm` 을 270mm 넘겨
  // 배치안에서 옆 물건과 겹쳤고, 게이트가 잡았다 (2026-08-04). 인자가 곧 발자국이어야
  // 겹침 검사·크기 칸이 같은 숫자를 본다 (파일 머리 규약).
  const cradle = cradleMm ?? wMm * 0.58;
  const barH = 95;                       // 크로스바 높이
  const barY = Math.min(Math.max(liftMm - barH - 90, baseH + 120), hMm - barH - 60);

  add(g, box(wMm, baseH, dMm, M.body), 0, baseH / 2, 0);                    // 베이스 판
  add(g, box(wMm - 120, 14, dMm - 120, M.dark), 0, baseH + 7, 0);           // 상면 홈

  for (const s of [-1, 1]) {
    const x = s * colX;
    add(g, box(colW, hMm, colW, M.body), x, baseH + hMm / 2, 0);            // 기둥
    add(g, box(colW + 40, 26, colW + 40, M.body), x, baseH + hMm + 13, 0);  // 캡
    // 볼스크류 + 리니어 레일 — **이 둘이 "승강" 신호다.** 없으면 그냥 기둥이다
    add(g, cyl(34, hMm - 80, M.steel, 12), x, baseH + hMm / 2, colW / 2 - 4);
    add(g, box(22, hMm - 60, 12, M.steel), x, baseH + hMm / 2, -(colW / 2 - 2));
    add(g, box(colW + 26, 130, colW + 26, M.dark), x, barY + barH / 2, 0);  // 캐리지 블록
    add(g, box(colW + 60, 30, colW + 30, M.body), x, baseH + 15, 0);        // 기둥 발
  }

  add(g, box(2 * colX - colW, barH, 120, M.body), 0, barY + barH / 2, 0);   // 크로스바

  // V블록 한 쌍 — **V홈이 이 물건의 정체다.** 기울인 판 두 짝으로 만든다.
  for (const s of [-1, 1]) {
    const x = s * (cradle / 2);
    add(g, box(150, 60, 190, M.body), x, barY + barH + 30, 0);              // 받침 발
    for (const t of [-1, 1]) {
      const v = box(120, 22, 150, M.body);
      v.rotation.x = t * 0.72;                                              // 약 41° — V 각 82°
      add(g, v, x, barY + barH + 95, t * 52);
    }
  }

  // 옆 클램프 두 짝 — 가볍게 문다. 작업물 축(=`liftMm`) 높이에 온다
  for (const s of [-1, 1]) {
    const x = s * Math.min(cradle / 2 + 190, wMm / 2 - 70);
    add(g, box(70, 200, 60, M.dark), x, barY + barH + 100, 0);              // 클램프 기둥
    for (const t of [-1, 1]) {
      add(g, box(60, 26, 90, M.steel), x, liftMm + t * 46, t * 30);         // 집게 두 짝
    }
  }
  return g;
}

/**
 * 경고 비콘 — **작은데 신호가 세다.** 화이트 모형에서 색이 있는 것은 유리뿐이라,
 * 돔 하나가 시선을 끌고 "여기는 위험구역" 을 한 글자도 없이 말한다.
 *
 * 색을 재질로 넣지 않고 **공유 재질 `dark` + 유리 돔**으로 낸다 — 새 재질을 만들면
 * 화이트 모형의 6색 규약이 무너진다 (파일 머리 규약).
 */
export function beacon({ hMm = 1400, diaMm = 120 } = {}) {
  const g = new THREE.Group();
  const poleH = hMm - diaMm;
  add(g, box(diaMm * 1.6, 24, diaMm * 1.6, M.dark), 0, 12, 0);            // 바닥 판
  add(g, cyl(46, poleH, M.dark, 10), 0, poleH / 2, 0);                    // 기둥
  add(g, cyl(diaMm * 1.15, 30, M.dark, 14), 0, poleH + 15, 0);            // 베이스 링
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(mm(diaMm / 2), 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    M.glass,
  );
  dome.position.y = mm(poleH + 30);
  g.add(dome);
  add(g, cyl(diaMm, 26, M.dark, 14), 0, poleH + diaMm / 2 + 30, 0);       // 상단 캡
  return g;
}


/**
 * 갠트리 크레인 — **이 화면에서 가장 큰 구조물이다.**
 *
 * 지금까지 모든 것이 허리 높이였다. 천장 3m 가 통째로 비어 사진이 납작했고, 이 하나가
 * **수직과 규모**를 동시에 채운다. 방산 라인에서 실제로 쓰는 장비이기도 하다 — 리프터가
 * 못 드는 무거운 탄체를 옮긴다.
 *
 * 형태의 정체 넷 — **양쪽 주행 레일 · 걸쳐진 상자형 거더 · 그 위를 달리는 트롤리 ·
 * 내려온 호이스트 갈고리.** 하나라도 빠지면 그냥 대들보로 읽힌다.
 *
 * `baseMm` 은 **레일 밑면 높이**다 (`wallCabinet` 과 같은 규약) — 0 을 주면 바닥에 내려온다.
 * 인자 이름은 공용 치수 이름을 쓴다: `lengthMm` = 거더 스팬 · `dMm` = 레일 길이.
 */
export function crane({ lengthMm = 5000, dMm = 3400, baseMm = 2400, hookDropMm = 900, trolleyAtMm = 0 } = {}) {
  const g = new THREE.Group();
  const railH = 260, railW = 130;
  const girH = 330, girD = 300;                 // 거더 단면
  const railY = baseMm + railH / 2;
  const girY = baseMm + railH + girH / 2;
  const halfSpan = lengthMm / 2;

  // 주행 레일 2줄 (깊이 방향 Z) — I 형강처럼 위아래 플랜지를 둔다
  for (const sx of [-1, 1]) {
    const x = sx * halfSpan;
    add(g, box(railW, railH * 0.55, dMm, M.steel), x, railY, 0);              // 웨브
    for (const sy of [-1, 1]) {
      add(g, box(railW * 1.7, railH * 0.22, dMm, M.steel), x, railY + sy * railH * 0.39, 0);
    }
    // 레일 받침 — `baseMm` 이 0 이 아니면 바닥까지 기둥이 내려온다
    if (baseMm > 1) {
      for (const sz of [-1, 1]) {
        add(g, box(railW * 1.4, baseMm, railW * 1.4, M.dark), x, baseMm / 2, sz * (dMm / 2 - railW));
      }
    }
  }

  // 거더 — 레일 위에 걸친다. 양 끝에 주행 대차(엔드트럭).
  // **브리지 전체가 부분그룹이다** — 레일을 따라 달리는 것은 거더 통째이지 트롤리가 아니다.
  // 트롤리는 거더 위(x)를, 브리지는 레일 위(z)를 달린다 — 축이 다르다.
  const bridge = new THREE.Group();
  bridge.name = 'bridge';
  g.add(bridge);
  add(bridge, box(lengthMm + railW * 2, girH, girD, M.body), 0, girY, 0);
  for (const sx of [-1, 1]) {
    add(bridge, box(railW * 2.4, girH * 0.7, girD * 1.5, M.dark), sx * halfSpan, girY, 0);
    for (const sz of [-1, 1]) {                                              // 바퀴
      const w = cyl(150, 90, M.steel, 12);
      w.rotation.x = Math.PI / 2;
      add(bridge, w, sx * halfSpan, baseMm + railH, sz * girD * 0.6);
    }
  }

  // 트롤리 + 호이스트 — **부분그룹으로 뗀다.** 재생기가 이것만 옮기면 되고,
  // 매 프레임 크레인 30개 메시를 다시 만들 이유가 없다 (`userData.crane` 로 찾는다).
  const t = new THREE.Group();
  t.name = 'trolley';
  const tx = Math.max(-halfSpan + 400, Math.min(halfSpan - 400, trolleyAtMm));
  t.position.x = mm(tx);
  bridge.add(t);
  // 거더 **위**를 달리는 대차. 이게 있어야 "크레인" 이 된다
  add(t, box(560, 210, girD * 1.2, M.body), 0, girY + girH / 2 + 105, 0);
  for (const sz of [-1, 1]) {
    const w = cyl(120, 70, M.steel, 10);
    w.rotation.x = Math.PI / 2;
    add(t, w, 0, girY + girH / 2, sz * girD * 0.5);
  }

  // 호이스트 — 케이블 + 갈고리 블록. **아래로 내려온 선 하나가 높이를 설명한다**
  const drop = Math.max(120, Math.min(hookDropMm, girY - 200));
  const hoist = new THREE.Group();
  hoist.name = 'hoist';
  t.add(hoist);
  add(hoist, cyl(26, drop, M.dark, 8), 0, girY + girH / 2 - drop / 2, 0);
  add(hoist, box(190, 150, 150, M.dark), 0, girY + girH / 2 - drop - 60, 0);
  const hookR = 90;
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(mm(hookR), mm(26), 8, 14, Math.PI * 1.45), M.steel,
  );
  hook.position.y = mm(girY + girH / 2 - drop - 140 - hookR);
  hook.rotation.z = Math.PI / 2;
  hook.castShadow = true;
  hoist.add(hook);
  // 재생기가 찾을 손잡이 — **스팬을 같이 실어** 트롤리가 거더 밖으로 못 나가게 한다
  // `hookYMm` — 갈고리 블록이 매달린 높이. 재생기가 작업물을 여기에 매단다
  g.userData.crane = { trolley: t, bridge, halfSpanMm: halfSpan, halfRailMm: dMm / 2,
    baseXMm: tx, hookYMm: girY + girH / 2 - drop - 60 };
  return g;
}

/**
 * 작업자 — **건축 화이트 모형의 스케일 인물상이다.**
 *
 * 사람 하나가 서 있으면 방 크기가 즉시 읽힌다. 그게 이 부품의 전부이고, 그래서
 * **얼굴·손가락·옷 주름을 안 그린다** — 디테일을 넣는 순간 인물상이 아니라 캐릭터가 되고
 * 화이트 모형의 문법이 깨진다. 헬멧만 있으면 "작업자" 로 읽힌다.
 */
export function worker({ hMm = 1750 } = {}) {
  const g = new THREE.Group();
  const u = hMm / 1750;                        // 기준 키에 대한 배율
  const S = (v) => v * u;
  add(g, cyl(S(560), S(30), M.dark, 20), 0, S(15), 0);                        // 받침 원판
  for (const sx of [-1, 1]) {                                                 // 다리
    add(g, cyl(S(150), S(830), M.shell, 10), sx * S(105), S(30 + 415), 0);
    add(g, box(S(170), S(90), S(300), M.dark), sx * S(105), S(75), S(50));    // 신발
  }
  add(g, cyl(S(320), S(70), M.shell, 12), 0, S(880), 0);                      // 골반
  add(g, box(S(420), S(520), S(230), M.shell), 0, S(1160), 0);                // 몸통
  for (const sx of [-1, 1]) {                                                 // 팔
    add(g, cyl(S(120), S(620), M.shell, 8), sx * S(255), S(1150), 0);
  }
  add(g, cyl(S(150), S(120), M.shell, 10), 0, S(1470), 0);                    // 목
  add(g, cyl(S(230), S(220), M.shell, 12), 0, S(1620), 0);                    // 머리
  // 헬멧 — **이 한 조각이 "작업자" 를 만든다**
  const helm = new THREE.Mesh(
    new THREE.SphereGeometry(mm(S(140)), 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.body,
  );
  helm.position.y = mm(S(1700));
  helm.castShadow = true;
  g.add(helm);
  add(g, cyl(S(330), S(24), M.body, 16), 0, S(1700), 0);                      // 챙
  return g;
}

/**
 * 탄약 팔레트 — **반복이 규모를 만든다.** 탄두 한 발보다 열두 발 쌓인 쪽이 훨씬 세다.
 *
 * 그리고 이건 장식이 아니라 **모순을 고친다** — AMR 은 높이 190mm 인데 공급 자리가
 * 1900mm 선반이면 거기서 아무것도 못 받는다. 저상 팔레트가 AMR 이 실제로 붙는 높이다.
 */
export function ammoPallet({ wMm = 1200, dMm = 800, rows = 2, perRow = 6, shellDiaMm = 155 } = {}) {
  const g = new THREE.Group();
  const deckH = 130;                            // 팔레트 상면
  add(g, box(wMm, 40, dMm, M.dark), 0, deckH - 20, 0);                        // 상판
  add(g, box(wMm, 26, dMm, M.dark), 0, 13, 0);                                // 하판
  // 지게차 포크 구멍 — 받침 블록 3개 사이의 빈 곳이 곧 구멍이다
  for (const sx of [-1, 0, 1]) {
    add(g, box(wMm * 0.16, deckH - 66, dMm, M.dark), sx * (wMm / 2 - wMm * 0.08), 26 + (deckH - 66) / 2, 0);
  }
  const len = Math.min(dMm - 60, shellDiaMm * 5.2);
  const pitch = Math.min((wMm - 80) / perRow, shellDiaMm * 1.12);
  const layerH = shellDiaMm + 40;               // 간살 두께 포함
  for (let r = 0; r < rows; r += 1) {
    const y = deckH + 30 + r * layerH + shellDiaMm / 2;
    add(g, box(wMm - 40, 26, dMm - 60, M.body), 0, y - shellDiaMm / 2 - 13, 0);   // 간살(분리대)
    for (let i = 0; i < perRow; i += 1) {
      const c = cyl(shellDiaMm, len, M.body, 14);
      c.rotation.x = Math.PI / 2;                                             // 축을 Z 로 눕힌다
      add(g, c, -((perRow - 1) * pitch) / 2 + i * pitch, y, 0);
      add(g, cyl(shellDiaMm * 1.04, 14, M.dark, 14), 0, 0, 0).position.set(
        mm(-((perRow - 1) * pitch) / 2 + i * pitch), mm(y), mm(len * 0.22),
      );
      g.children[g.children.length - 1].rotation.x = Math.PI / 2;             // 회전 밴드
    }
  }
  return g;
}

/** 회전 척 — 탄두를 물고 돌린다. **3점 조가 이 물건의 정체다.** */
export function chuck({ diaMm = 320, hMm = 420, boreMm = 90 } = {}) {
  const g = new THREE.Group();
  const cy = hMm - diaMm / 2;                // 척 중심 높이
  add(g, box(diaMm * 0.9, 40, diaMm * 0.8, M.dark), 0, 20, 0);              // 베이스 판
  // **받침은 척 뒤에 둔다.** 같은 z 에 두면 기둥이 척 앞을 가려 3점 조가 안 보인다.
  const faceD = 120, pedD = diaMm * 0.42;
  add(g, box(diaMm * 0.5, cy, pedD, M.body), 0, cy / 2, -(faceD / 2 + pedD / 2));

  const face = cyl(diaMm, faceD, M.body, 28);                               // 척 몸통 (축 Z)
  face.rotation.x = Math.PI / 2;
  add(g, face, 0, cy, 0);
  const bore = cyl(boreMm, faceD + 20, M.dark, 16);                         // 중앙 보어
  bore.rotation.x = Math.PI / 2;
  add(g, bore, 0, cy, 0);

  // 조 3개 — 120° 간격. 계단 2단이라 "물린다" 는 느낌이 난다.
  for (let i = 0; i < 3; i += 1) {
    const a = (i * 2 * Math.PI) / 3 + Math.PI / 2;   // 12시부터 120° 간격
    const jx = Math.cos(a), jy = Math.sin(a);
    // 조는 **반경 방향으로 길고 얇은 계단**이다. 정사각 단면으로 만들면 큐브가 떠 있는
    // 것처럼 보인다(2차 렌더의 결함). 반지름은 조 절반을 빼고 잡아 hMm 을 안 넘긴다.
    for (const [r, len, wide, thick] of [[0.26, 78, 54, 40], [0.38, 62, 44, 26]]) {
      const j = add(g, box(len, wide, thick, M.steel),
        jx * diaMm * r, cy + jy * diaMm * r, faceD / 2 + thick / 2);
      j.rotation.z = a;
    }
  }
  return g;
}

/** 부품 트레이 — 해체 4단계 "분류" 의 산출물 자리. 격자가 있어야 분류대로 읽힌다. */
export function partTray({ wMm = 700, dMm = 480, cols = 6, rows = 4, filled = 4 } = {}) {
  const g = new THREE.Group();
  const wall = 22, h = 70;
  add(g, box(wMm, 18, dMm, M.body), 0, 9, 0);                               // 바닥
  for (const [w, d, x, z] of [
    [wMm, wall, 0, -(dMm - wall) / 2], [wMm, wall, 0, (dMm - wall) / 2],
    [wall, dMm, -(wMm - wall) / 2, 0], [wall, dMm, (wMm - wall) / 2, 0]]) {
    add(g, box(w, h, d, M.body), x, h / 2, z);                              // 테두리
  }
  // ponytail: 구멍은 안 뚫는다 (CSG 비용). 어두운 얕은 원통이 같은 값을 낸다 — 축척상 구별 불가.
  const dia = Math.min((wMm - 80) / cols, (dMm - 80) / rows) * 0.72;
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const x = -wMm / 2 + (wMm / cols) * (c + 0.5);
    const z = -dMm / 2 + (dMm / rows) * (r + 0.5);
    add(g, cyl(dia, 26, M.dark, 12), x, 22, z);                             // 구멍
    if ((r * cols + c) % Math.max(2, Math.round((rows * cols) / filled)) === 0) {
      add(g, cyl(dia * 0.8, 90, M.shell, 12), x, 63, z);                    // 꽂힌 부품
    }
  }
  return g;
}

/**
 * 방폭 격벽 — 해체 셀을 가른다.
 *
 * **기본 높이가 1200(허리)인 이유** — 2400 으로 세웠더니 메인뷰에서 셀 안이 통째로
 * 안 보였다. 배치를 보는 화면인데 배치를 가리면 소품이 아니라 방해물이다.
 * 전신 차폐가 필요하면 `hMm` 을 올리되 **관측창이 시선 높이(1500)에 오는지** 보고 정한다.
 */
export function blastWall({ lengthMm = 3000, hMm = 1200, tMm = 300, windowMm = 0 } = {}) {
  const g = new THREE.Group();
  const capH = 90;
  const winH = 520;
  // 창이 없으면 통벽. 있으면 **좌·우·위·아래로 쪼개** 진짜 구멍을 낸다 —
  // 통벽 안에 유리판을 묻으면 렌더에서 아예 안 보인다 (첫 렌더의 결함).
  const winW = windowMm > 0 ? Math.min(windowMm, lengthMm - 400) : 0;
  if (winW > 0 && hMm > winH + 400) {
    const side = (lengthMm - winW) / 2;
    const yc = hMm * 0.62;
    for (const s of [-1, 1]) {
      add(g, box(side, hMm, tMm, M.body), s * (lengthMm - side) / 2, hMm / 2, 0);
    }
    add(g, box(winW, hMm - yc - winH / 2, tMm, M.body), 0, (hMm + yc + winH / 2) / 2, 0);  // 창 위
    add(g, box(winW, yc - winH / 2, tMm, M.body), 0, (yc - winH / 2) / 2, 0);              // 창 아래
    add(g, box(winW, winH, tMm - 60, M.glass), 0, yc, 0);
  } else {
    add(g, box(lengthMm, hMm, tMm, M.body), 0, hMm / 2, 0);
  }
  // 캡·기초는 **본체를 감싼다 — 면을 하나도 맞추지 않는다.**
  //
  // 두 면이 정확히 같은 평면이면 깊이 버퍼가 앞뒤를 못 정해 카메라가 움직일 때마다
  // 픽셀 단위로 승자가 바뀐다(z-fighting) — 벽이 반짝거린다. 재질 문제가 아니다.
  // 처음엔 옆면만 어긋나게 했다가 **윗면이 둘 다 y=hMm** 인 걸 놓쳤다 (2026-08-04).
  // 그래서 캡을 세 방향 전부 키워 본체 밖으로 내민다 — 실제 코핑도 그렇게 생겼다.
  const OVER = 30;                                    // 옆으로 내미는 양(편측 15mm)
  add(g, box(lengthMm + OVER, capH + 8, tMm + OVER, M.dark), 0, hMm - capH / 2 + 4, 0);
  add(g, box(lengthMm + OVER, 120, tMm + OVER, M.dark), 0, 60, 0);            // 하단 기초
  return g;
}

Object.assign(PROPS, { conveyor, warhead, chuck, partTray, blastWall, lifter, beacon,
  crane, worker, ammoPallet });
