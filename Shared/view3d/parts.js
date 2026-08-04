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

// ── 의자. 사람이 쓰는 공간이라는 신호. 하나만 있어도 크게 다르다.
// **인자를 안 받는다.** 예전엔 `hMm` 을 받는 척했는데 본문에서 한 번도 안 썼다 —
// 게이트가 잡았다 (2026-08-04). 안 쓰는 인자는 다음 사람에게 거짓말이 된다.
export function chair() {
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

  // ── 사이드 레일 2개 (길이 방향 X, 폭 방향 Z)
  for (const s of [-1, 1]) {
    add(g, box(lengthMm, railH, railT, M.steel), 0, railY, s * (wMm / 2 - railT / 2));
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
    add(g, r, -span / 2 + step * (i + 0.5), hMm - rollerDiaMm / 2, 0);
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

Object.assign(PROPS, { conveyor, warhead, chuck, partTray, blastWall });
