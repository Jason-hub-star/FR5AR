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
//
// `img2threejs` 로 만든 부품도 **같은 계약으로 맞춰서** 여기 넣으면 그대로 조립된다.

import * as THREE from 'three';
import { mm } from '../../data/units/units.js';

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
  add(g, box(120, 30, 180, M.dark), 0, 15, 0);                          // 받침
  add(g, box(60, hMm * 0.4, 60, M.dark), 0, hMm * 0.2, 0);              // 기둥
  const panel = add(g, box(wMm, hMm * 0.6, 24, M.screen), 0, hMm * 0.62, 0);
  panel.rotation.x = -0.12;
  add(g, box(420, 18, 150, M.shell), 0, 9, 260);                        // 키보드
  return g;
}

// ── 의자. 사람이 쓰는 공간이라는 신호. 하나만 있어도 크게 다르다.
export function chair({ hMm = 850 } = {}) {
  const g = new THREE.Group();
  add(g, box(420, 60, 420, M.shell), 0, 450, 0);                        // 좌판
  add(g, box(400, 380, 50, M.shell), 0, 660, -190);                     // 등받이
  add(g, box(60, 420, 60, M.dark), 0, 240, 0);                          // 기둥
  const base = new THREE.Mesh(new THREE.CylinderGeometry(mm(260), mm(280), mm(40), 5), M.dark);
  base.position.y = mm(20); base.castShadow = true;
  g.add(base);
  return g;
}

// ── 흄후드. 유리 새시가 있어 아이솔레이터와 다르게 읽힌다.
export function fumehood({ wMm = 1500, dMm = 800, hMm = 2300 } = {}) {
  const g = new THREE.Group();
  const deskH = 900;
  add(g, box(wMm, deskH, dMm, M.body), 0, deskH / 2, 0);
  add(g, box(wMm, 40, dMm, M.steel), 0, deskH + 20, 0);
  add(g, box(wMm, hMm - deskH - 40, 60, M.shell), 0, (hMm + deskH) / 2, -dMm / 2 + 30);  // 뒷판
  for (const sx of [-1, 1]) {
    add(g, box(60, hMm - deskH - 40, dMm, M.shell), sx * (wMm / 2 - 30), (hMm + deskH) / 2, 0);
  }
  add(g, box(wMm - 120, 900, 24, M.glass), 0, deskH + 700, dMm / 2 - 20);   // 유리 새시
  add(g, box(wMm, 220, dMm, M.shell), 0, hMm - 110, 0);                     // 배기 후드
  return g;
}

/** 이름 → 팩토리. 배치안이 이 이름으로 부품을 부른다. */
export const PROPS = { bench, isolator, shelf, instrument, workstation, chair, fumehood };

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
    // 배치안은 Z-up(x,y 바닥) · three 는 Y-up → y 와 z 를 바꾼다
    node.position.set(mm(p.posMm[0]), mm(p.posMm[2] ?? 0), mm(p.posMm[1]));
    node.rotation.y = -((p.rotDeg ?? 0) * Math.PI) / 180;
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
export function clutter({ lengthMm = 1600, hMm = 900, seed = 1 } = {}) {
  const g = new THREE.Group();
  // 결정적 난수 — 새로고침마다 배치가 바뀌면 스크린샷 비교가 안 된다
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const n = Math.max(3, Math.round(lengthMm / 420));
  for (let i = 0; i < n; i += 1) {
    const x = -lengthMm / 2 + (lengthMm / n) * (i + 0.5) + (rnd() - 0.5) * 90;
    const kind = Math.floor(rnd() * 3);
    if (kind === 0) {
      const h = 160 + rnd() * 120;                                   // 병
      const b = new THREE.Mesh(new THREE.CylinderGeometry(mm(45), mm(52), mm(h), 12), M.shell);
      b.position.set(mm(x), mm(hMm + h / 2), mm((rnd() - 0.5) * 200));
      b.castShadow = true; g.add(b);
    } else if (kind === 1) {
      add(g, box(240, 150, 180, M.shell), x, hMm + 75, (rnd() - 0.5) * 200);   // 상자
    } else {
      add(g, box(300, 90, 200, M.body), x, hMm + 45, (rnd() - 0.5) * 200);     // 랙
      for (let k = -1; k <= 1; k += 1) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(mm(22), mm(22), mm(110), 8), M.glass);
        t.position.set(mm(x + k * 70), mm(hMm + 145), mm(0));
        g.add(t);
      }
    }
  }
  return g;
}

Object.assign(PROPS, { benchRun, wallCabinet, safetyFence, clutter });
