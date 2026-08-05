// WebXR 정합 — **마커도 캘리브레이션도 없이** 배치안을 실제 바닥에 얹는다.
//
// 마커 방식(`ar.html`)을 고른 이유는 iOS 사파리가 `immersive-ar` 을 안 열어주기 때문이다
// (`AR-MARKER.md`). 그런데 **고정 카메라·현장 시연은 기기가 하나**라 그 제약이 안 걸린다.
// 축척 정확도는 실측했다 — 1m 를 987·1019·1012·918mm 로 읽었다
// (`docs/evidence/2026-08-04/global-cam-phone.md`).
//
// **팔(URDF)은 얹지 않는다.** `createLayoutView` 는 팔 자리만 만들고 URDF 는 화면이 얹는
// 구조라 `mountArm` 을 안 주면 그대로 빠진다. 삼각형 128,888 × 2 의 폰 성능이 미측정이라
// (`GAP-MATRIX`) **정합이 눈에 맞는지부터** 보고 나서 켠다.

import * as THREE from 'three';
import { createLayoutView } from '@fr5/shared/view3d/lab/layout-view.js';
import { buildLabSky, ENV_INTENSITY } from '@fr5/shared/view3d/lab/sky.js';
import { PRESETS, buildPreset } from '@fr5/shared/data/layout/presets.js';
import { loadConfig, loadRobot, setJointsDeg, countTriangles } from '@fr5/shared/view3d/robot.js';
import { interpolateJoints } from '@fr5/shared/view3d/path.js';
import { PRESET_POSES as POSES } from '@fr5/shared/data/motion/poses.js';
import './xr.css';

const $ = (id) => document.getElementById(id);
const lines = [];
const say = (m, cls = '') => {
  lines.push(m);
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = m;
  $('log').prepend(d);
};

// ── 프리셋 고르기. 폰에서 고르고, 링크로도 넘긴다 (`?preset=cell`).
const Q = new URLSearchParams(location.search);
const sel = $('preset');
for (const p of PRESETS) {
  const o = document.createElement('option');
  o.value = p.id;
  o.textContent = p.label;
  sel.appendChild(o);
}
sel.value = PRESETS.some((p) => p.id === Q.get('preset')) ? Q.get('preset') : 'cell';

$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    say('결과를 클립보드에 복사했다', 'ok');
  } catch { say('복사 실패 — 화면의 숫자를 읽어 옮겨라', 'bad'); }
};

say(`${new Date().toLocaleString('ko-KR')} · ${navigator.userAgent.slice(0, 44)}`);
if (!isSecureContext) say('보안 출처가 아니다 — WebXR 은 HTTPS 에서만 열린다', 'bad');

if (!navigator.xr) {
  $('sup').textContent = 'navigator.xr 이 없다 — 이 브라우저는 WebXR 미지원';
  say('안드로이드 크롬으로 열어라 (iOS 사파리는 안 된다)', 'bad');
} else {
  const ok = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  $('sup').textContent = `immersive-ar 지원: ${ok}`;
  say(`immersive-ar 지원: ${ok}`, ok ? 'ok' : 'bad');
  if (!ok) say('Play 스토어에서 "Google Play 서비스 for AR" 설치');
  $('go').disabled = !ok;
}

/** 가장 긴 변이 이만큼(mm)이 되게 줄인다 — 12m 방을 강의실에 넣는 기본값 */
const TARGET_MM = 2500;

/**
 * 두 모서리 탭이 낼 수 있는 보정의 상한. 이 밖이면 **모서리를 잘못 찍은 것**이지
 * WebXR 축척 오차가 아니다 (실측 오차는 ±2% 였다). 막지는 않고 말만 한다 —
 * 세게 막으면 아무것도 못 하게 된다 (2026-08-04 에 한 번 그렇게 잘못 만들었다).
 */
const SANE_SCALE = [0.5, 2];

// **팔마다 다른 동작을 준다.** 같은 걸 두 대가 하면 "두 대가 도는가" 는 알아도
// "각자 다른 동작이 되는가" 는 모른다. 자세 정본은 `Shared/data/motion/poses.js`.
const MOTIONS = [
  { from: POSES.home, to: POSES.grip, secs: 3.2 },
  { from: POSES.lowIdle, to: POSES.lowBelt, secs: 4.6 },
];

$('go').onclick = async () => {
  const layout = buildPreset(sel.value);
  const longest = Math.max(layout.floor.widthMm, layout.floor.depthMm);
  const mode = $('mode').value;                    // 'fit' | 'real'

  // 실물 모드가 쓰는 값 — **평면도 원점이 곧 root 원점**이다 (`layout-view.js` 의
  // slab 이 `W/2, Z(D/2)` 에 놓인다). 그래서 첫 모서리에 anchor 를 놓으면 그대로 맞는다.
  const W = layout.floor.widthMm / 1000;           // m
  const D = layout.floor.depthMm / 1000;
  const diagTrue = Math.hypot(W, D);               // 대각선 참값 (m)
  const yawLocal = Math.atan2(-D, W);              // 로컬 대각선 방향 (Z 가 거울이라 −D)

  let session;
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'local-floor'],
      optionalFeatures: ['dom-overlay'],
      // **루트가 화면을 덮으면 탭을 DOM 이 먹어 `select` 가 안 온다** (2026-08-04 실측).
      // 조작바에만 `beforexrselect` 를 걸어 그 위 탭만 DOM 으로 보낸다.
      domOverlay: { root: $('ov') },
    });
  } catch (e) { say(`세션 시작 실패 — ${e?.message ?? e}`, 'bad'); return; }

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.xr.enabled = true;
  await renderer.xr.setSession(session);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = buildLabSky();
  scene.environment = sky;
  scene.environmentIntensity = ENV_INTENSITY;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 5, 2);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera();   // XR 이 투영행렬을 넣는다

  // 놓을 자리 표식 — 바닥에 눕힌 링. DOM 조준선보다 바닥에서 읽기 쉽다.
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.09, 0.12, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x7fd88f, transparent: true, opacity: 0.9 }),
  );
  reticle.visible = false;
  scene.add(reticle);

  // 맵이 붙는 자리. 탭하면 이 그룹만 옮긴다 — 배치안 데이터는 손대지 않는다.
  const anchor = new THREE.Group();
  scene.add(anchor);
  const view = createLayoutView(layout);          // ← mountArm 을 안 준다 = 팔은 아래서 따로
  anchor.add(view.root);
  // **바닥 슬래브는 숨긴다** — 진짜 바닥이 카메라 영상에 이미 있다 (cam.js 와 같은 이유).
  const slab = view.root.getObjectByName('slab');
  if (slab) slab.visible = false;

  // **두 모드의 차이는 이 숫자 하나다.** `view.root` 는 미터로 지어지므로 1.0 이 실물 1:1 이고,
  // 실물 모드의 1.0 은 두 모서리를 받으면 그 방·그 세션의 축척 오차만큼 보정된다.
  let scale = mode === 'real' ? 1 : TARGET_MM / longest;
  let yaw = 0;
  const pct = (s) => `${s >= 1 ? '+' : ''}${((s - 1) * 100).toFixed(1)}%`;
  const apply = () => {
    view.root.scale.setScalar(scale);
    anchor.rotation.y = yaw;
    const deg = Math.round((yaw * 180) / Math.PI);
    $('hud').textContent = mode === 'real'
      ? `실물 1:1 · ${W.toFixed(2)}×${D.toFixed(2)}m · 보정 ${pct(scale)} · ${deg}°`
      : `1:${(1 / scale).toFixed(1)} 축소 · `
        + `${(layout.floor.widthMm * scale / 1000).toFixed(1)}×${(layout.floor.depthMm * scale / 1000).toFixed(1)}m`
        + ` · ${deg}°`;
  };
  apply();

  // ── 팔. **고른 대수만큼만 받는다** — URDF 는 팔당 6MB 이고 삼각형 128,808 이다.
  const wantArms = Number($('arms').value) || 0;
  const players = [];
  if (wantArms > 0) {
    const { gripper } = loadConfig();
    const slots = (view.armSlots ?? []).filter((sl) => sl.userData?.arm?.model === 'FR5');
    say(`팔 ${Math.min(wantArms, slots.length)}대 받는 중… (팔당 6MB)`);
    for (let i = 0; i < Math.min(wantArms, slots.length); i += 1) {
      const tLoad = performance.now();
      try {
        const { robot } = await loadRobot({
          urdfUrl: '/FAIRINO_FR5/fairino5_v6.urdf', gripperCfg: gripper, gripperDir: '/PGEA_100_40/',
        });
        // **URDF 는 Z-up, three.js 는 Y-up.** 이 회전을 빼면 팔이 바닥에 누워 버린다
        // (`Dashboard/…/LayoutView.jsx` 의 holder 와 같은 규약 · `ar.js` 의 stage 와도 같다).
        const holder = new THREE.Group();
        holder.rotation.x = -Math.PI / 2;
        holder.add(robot);
        slots[i].add(holder);
        const m = MOTIONS[i % MOTIONS.length];
        players.push({ robot, frames: interpolateJoints(m.from, m.to, 48), secs: m.secs });
        say(`팔 ${i + 1} 준비 — ${((performance.now() - tLoad) / 1000).toFixed(1)}초 · `
          + `${countTriangles(robot).triangles.toLocaleString()} 삼각형`, 'ok');
      } catch (e) { say(`팔 ${i + 1} 실패 — ${e?.message ?? e}`, 'bad'); }
    }
  }
  const animate = $('anim').checked && players.length > 0;

  const hitSpace = await session.requestReferenceSpace('viewer');
  const hits = await session.requestHitTestSource({ space: hitSpace });
  let aimed = null;
  let placed = false;
  let found = 0;
  const t0 = performance.now();
  let frames = 0;
  let fpsAt = performance.now();
  const fpsLog = [];

  // 조작바 위의 탭은 **DOM 이 가져간다** — 안 그러면 버튼을 누를 때마다 맵이 옮겨진다
  $('bar').addEventListener('beforexrselect', (e) => e.preventDefault());

  let cornerA = null;                 // 실물 모드의 첫 모서리
  let barShown = true;

  session.addEventListener('select', () => {
    // **놓은 뒤의 탭은 안 옮긴다.** 촬영 중 화면을 스치면 배치안이 튀었다.
    // 대신 조작바를 여닫는 데 쓴다 — 영상에 버튼이 안 찍히게 하려면 이 길뿐이다.
    if (placed) { barShown = !barShown; $('bar').hidden = !barShown; return; }
    if (!aimed) { $('hint').textContent = '아직 평면을 못 찾았습니다'; return; }

    if (mode === 'real' && !cornerA) {
      cornerA = aimed.clone();
      $('hint').textContent = '이제 대각선 반대편 모서리를 겨냥해 탭';
      say(`모서리 ① 받음 — 높이 ${(aimed.y * 1000).toFixed(0)}mm`);
      return;
    }

    if (mode === 'real') {
      // **실물 대각선을 우리가 알고 있으니** 그 길이가 자(尺)가 된다. 잰 거리와 참값의
      // 비가 곧 이 방·이 세션의 WebXR 축척 오차이고, 그걸 그대로 곱해 지운다.
      const dx = aimed.x - cornerA.x;
      const dz = aimed.z - cornerA.z;
      const measured = Math.hypot(dx, dz);        // 바닥 평면 거리만 쓴다
      scale = measured / diagTrue;
      // **부호에 주의.** three.js 의 Y 회전은 `atan2(z,x)` 를 그만큼 **깎는다**
      // (x' = x·cos + z·sin, z' = −x·sin + z·cos). 빼는 순서를 뒤집으면 맵이 반대로 돈다.
      yaw = yawLocal - Math.atan2(dz, dx);
      anchor.position.copy(cornerA);
      say(`모서리 ② 받음 — 잰 대각 ${(measured * 1000).toFixed(0)}mm · `
        + `참값 ${(diagTrue * 1000).toFixed(0)}mm · 보정 ${pct(scale)}`, 'ok');
      if (measured < 0.3) say('두 탭이 너무 가깝다 — 같은 자리를 찍었을 수 있다', 'bad');
      if (scale < SANE_SCALE[0] || scale > SANE_SCALE[1]) {
        say('보정이 상식 밖이다 — 마주보는 모서리가 맞는지 확인해라', 'bad');
      }
      // 촬영 모드는 놓는 순간 계기를 끈다. **로그에는 남으므로 `결과 복사`로 회수된다.**
      $('hud').hidden = true;
      $('fps').hidden = true;
    } else {
      anchor.position.copy(aimed);
      say(`놓음 — 높이 ${(aimed.y * 1000).toFixed(0)}mm · 1:${(1 / scale).toFixed(1)}`, 'ok');
    }
    placed = true;
    $('hint').textContent = '';
    apply();
  });

  $('zoomIn').onclick = () => { scale *= 1.25; apply(); };
  $('zoomOut').onclick = () => { scale /= 1.25; apply(); };
  $('rotL').onclick = () => { yaw -= Math.PI / 12; apply(); };
  $('rotR').onclick = () => { yaw += Math.PI / 12; apply(); };
  $('again').onclick = () => {
    placed = false;
    cornerA = null;
    $('hud').hidden = false;
    $('fps').hidden = false;
    $('hint').textContent = mode === 'real'
      ? '맵의 한쪽 모서리를 겨냥해 탭 (두 번 받는다)'
      : '다시 놓을 자리를 겨냥해 탭';
  };
  $('bar').hidden = false;

  session.addEventListener('end', () => {
    $('bar').hidden = true;
    renderer.setAnimationLoop(null);
    renderer.domElement.remove();
    view.dispose?.();
    sky.dispose?.();
    renderer.dispose();
    say('세션 종료');
  });

  renderer.setAnimationLoop((t, frame) => {
    if (frame) {
      const ref = renderer.xr.getReferenceSpace();
      const r = frame.getHitTestResults(hits);
      if (r.length) {
        // **가장 낮은 면을 고른다** — 첫 결과는 카메라에 가까운 책상일 수 있다 (실측).
        let best = null;
        for (const h of r) {
          const po = h.getPose(ref);
          if (po && (!best || po.transform.position.y < best.transform.position.y)) best = po;
        }
        if (best) {
          aimed = new THREE.Vector3().copy(best.transform.position);
          reticle.position.copy(aimed);
          reticle.visible = !placed;
          if (!found) {
            found = performance.now();
            say(`평면 찾음 — ${((found - t0) / 1000).toFixed(1)}초`, 'ok');
            $('hint').textContent = mode === 'real'
              ? '맵의 한쪽 모서리에 링을 맞추고 탭 — 다음은 대각선 반대편'
              : '링을 놓을 자리에 맞추고 탭 — 폰을 돌려 겨냥';
          }
        }
      }
    }
    // 애니메이션 — 팔마다 주기가 달라 서로 다른 동작으로 보인다
    if (animate) {
      for (let i = 0; i < players.length; i += 1) {
        const pl = players[i];
        const u = ((t / 1000) % (pl.secs * 2)) / pl.secs;      // 0→2 왕복
        const k = Math.round((u < 1 ? u : 2 - u) * (pl.frames.length - 1));
        setJointsDeg(pl.robot, pl.frames[k]);
      }
    }
    // **fps 를 화면에 적고 로그에도 남긴다.** 팔을 켤지 말지는 이 숫자가 정한다
    // (GAP: 폰 성능 미측정). 화면에만 있으면 `결과 복사` 로 회수되지 않는다.
    frames += 1;
    if (t - fpsAt > 2000) {
      const f = Math.round((frames * 1000) / (t - fpsAt));
      $('fps').textContent = `${f} fps`;
      fpsLog.push(f);
      if (fpsLog.length % 5 === 0) {
        const srt = [...fpsLog].sort((a, b) => a - b);
        say(`fps 중앙값 ${srt[srt.length >> 1]} · 최저 ${srt[0]} · 팔 ${players.length}대`
          + `${animate ? ' · 애니메이션' : ''}`);
      }
      frames = 0; fpsAt = t;
    }
    renderer.render(scene, camera);
  });
};
