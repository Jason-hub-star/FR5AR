// WebXR 정합 — **마커 없이** 맵을 실제 바닥에 얹는다.
//
// 캘리브레이션도 평소엔 없다. 다만 `촬영` 모드만 **아는 맵의 두 모서리**를 받아
// 그 방·그 세션의 축척 오차를 지운다 (`:startAR` §real).
//
// 마커 방식(`ar.html`)을 고른 이유는 iOS 사파리가 `immersive-ar` 을 안 열어주기 때문이다
// (`AR-MARKER.md`). 그런데 **고정 카메라·현장 시연은 기기가 하나**라 그 제약이 안 걸린다.
// 축척 정확도는 실측했다 — 1m 를 987·1019·1012·918mm 로 읽었다
// (`docs/evidence/2026-08-04/global-cam-phone.md`).
//
// **네 모드가 한 씬을 공유한다.** AR 셋(평소·답사·촬영)은 배율 숫자와 탭 횟수만 다르고,
// `화면` 은 XR 없이 그 방 안을 본다. 렌더 경로를 가르면 평소 테스트가 촬영본을 검증해 주지
// 못한다 (D17 의 실패 모양). 그래서 씬을 짓는 코드는 `buildScene` 하나다.
//
//   평소 fit    — 1:2.5 로 줄여 책상 위. 한 번 탭
//   답사 walk   — 실물 1:1. 한 번 탭하고 **그 안을 걸어 들어간다**
//   촬영 real   — 실물 1:1 + 아는 맵의 두 모서리로 축척 오차까지 지운다
//   화면 screen — XR 없음. 폰이 없어도 열려 실렌더 검증이 된다
//
// **고를 것은 둘뿐이다** — 모드와 맵. 팔 대수·애니메이션은 사람이 고를 값이 아니라
// 맵이 정한다 (2026-08-06). 골라서 얻는 게 없는 선택지는 화면에서 뺐다.

import * as THREE from 'three';
import { createLayoutView } from '@fr5/shared/view3d/lab/layout-view.js';
import { createStage } from '@fr5/shared/view3d/lab/stage.js';
import { buildLabSky, ENV_INTENSITY } from '@fr5/shared/view3d/lab/sky.js';
import { PRESETS, buildPreset } from '@fr5/shared/data/layout/presets.js';
import { loadConfig, loadRobot, setJointsDeg, countTriangles } from '@fr5/shared/view3d/robot.js';
import { PRESET_POSES as POSES } from '@fr5/shared/data/motion/poses.js';
// 놓기 계산은 **화면 밖 순수 함수**다 — XR 세션 없이 게이트가 숫자로 판정한다
import { solveCorners, hudText, ghostWalls } from '../features/place/place.js';
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
/** 세션 중 한 줄 안내. 받는 동안 화면이 말을 안 하면 "멈췄다" 로 읽힌다. */
const tell = (m) => { $('hint').textContent = m; };

/**
 * 모드 — **AR 셋과 화면 하나.** `xr` 이 참인 것만 XR 을 필요로 한다.
 * 조건(탭 횟수·필요 공간)을 여기 같이 둔다. 고르기 *전에* 보여야 하는 값이다.
 */
const MODES = [
  { id: 'fit', name: '평소', line: '2.5m 로 줄여 책상 위에 얹는다', tags: '탭 1회 · 아무 바닥', xr: true },
  { id: 'walk', name: '답사', line: '실물 1:1 로 얹고 그 안을 걸어 들어간다', tags: '탭 1회 · 맵 크기만큼 빈 공간', xr: true },
  { id: 'real', name: '촬영', line: '실측 맵의 두 모서리로 축척 오차까지 지운다', tags: '탭 2회 · 크기를 아는 맵', xr: true },
  { id: 'screen', name: '화면', line: 'AR 없이 방 안을 눈높이로 둘러본다', tags: '폰이 없어도 열린다', xr: false },
];
const Q = new URLSearchParams(location.search);
let mode = MODES.some((m) => m.id === Q.get('mode')) ? Q.get('mode') : 'fit';
const modeOf = () => MODES.find((m) => m.id === mode);

// ── 맵 고르기. 폰에서 고르고, 링크로도 넘긴다 (`?preset=cell&mode=walk`).
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
// 기록은 접어 둔다. **계측 로그와 안내는 다른 것**이다 — 안내를 로그에 섞으면
// `결과 복사` 로 회수한 숫자에 노이즈가 들어간다 (2026-08-06 UI 감사).
$('logBtn').onclick = () => {
  const open = $('log').hidden;
  $('log').hidden = !open;
  $('logBtn').setAttribute('aria-expanded', String(open));
  $('logBtn').textContent = open ? '기록 숨기기' : '기록 보기';
};

say(`${new Date().toLocaleString('ko-KR')} · ${navigator.userAgent.slice(0, 44)}`);

// **`화면` 모드는 XR 이 없어도 열린다.** 그래서 지원 여부로 버튼을 통째로 잠그면 안 된다 —
// PC 브라우저에서 이걸 열 수 있는 것이 이 화면의 유일한 실렌더 검증 경로다.
let arOk = false;
let secure = true;
if (!isSecureContext) { secure = false; say('보안 출처가 아니다 — WebXR 은 HTTPS 에서만 열린다', 'bad'); }

function renderChips() {
  $('chips').replaceChildren(...MODES.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.m = m.id;
    b.textContent = m.name;
    if (m.xr && !arOk) b.dataset.off = '1';
    b.onclick = () => { mode = m.id; sync(); };
    return b;
  }));
}

/** 고른 모드가 무엇을 시키는지, 안 되면 **왜 + 어디로 가야 하는지**까지 한 곳에 적는다. */
function sync() {
  const m = modeOf();
  const blocked = m.xr && !arOk;
  for (const b of $('chips').children) b.setAttribute('aria-pressed', String(b.dataset.m === mode));
  $('blurb').innerHTML = `<b>${m.name}</b> — ${m.line}<br>${m.tags}`
    + (blocked
      ? '<br><span class="no">이 기기는 AR 을 못 엽니다 — <b>화면</b> 을 고르세요.'
        + `${secure ? ' 안드로이드 크롬 + “Google Play 서비스 for AR” 이면 열립니다' : ''}</span>`
      : '');
  $('go').disabled = blocked;
  $('go').textContent = m.xr ? 'AR 시작' : '방 안으로 들어가기';
}

// ── 맵 미리보기 — **무엇을 얹게 되는지 먼저 보여준다.**
//
// `layout-view.js` 의 `updateCutaway` 가 카메라 쪽 벽을 숨겨 안이 보인다. 이 화면이
// 그 기능을 처음 쓴다 (대시보드만 쓰고 있었다). 팔 URDF 는 안 받는다 — 대당 6MB 이고
// 미리보기에 필요한 건 "무슨 방이고 뭐가 어디 있나" 지 로봇의 생김새가 아니다.
let preview = null;
function showPreview() {
  preview?.dispose();
  preview = null;
  const stage = createStage($('preview'), { background: 0x181b20, controls: false });
  const view = createLayoutView(buildPreset(sel.value));
  stage.scene.add(view.root);
  // **바운딩 구로 거리를 잡는다.** AABB 로 잡으면 도는 동안 긴 변이 옆으로 누워 잘린다.
  const sph = new THREE.Box3().setFromObject(view.root).getBoundingSphere(new THREE.Sphere());
  let a = Math.PI * 0.25;
  stage.onTick(() => {
    a += 0.0016;                                   // 한 바퀴 ≈ 65초. 읽는 걸 방해하지 않는 속도
    // **시트가 아래를 덮는다.** 화면 한가운데에 맞추면 맵의 절반이 시트 밑으로 들어간다
    // (첫 실렌더가 그랬다). 안 가려지는 세로 비율만큼 좁혀 맞추고, 그만큼 위로 올린다.
    const seen = Math.max(0.35, 1 - $('sheet').getBoundingClientRect().height / innerHeight);
    const tv = Math.tan((stage.camera.fov * Math.PI) / 360);
    const d = (sph.radius / Math.min(tv * seen, tv * stage.camera.aspect)) * 1.05;
    stage.camera.position.set(
      sph.center.x + d * 0.86 * Math.cos(a),
      sph.center.y + d * 0.5,
      sph.center.z + d * 0.86 * Math.sin(a),
    );
    stage.camera.lookAt(sph.center.x, sph.center.y - (1 - seen) * d * tv, sph.center.z);
    view.updateCutaway(stage.camera);
  });
  preview = { dispose() { view.dispose?.(); stage.dispose(); } };
}
sel.onchange = showPreview;

/** 세션으로 들어간다 — **미리보기를 반드시 버린다.** WebGL 컨텍스트가 쌓이면 브라우저가 막는다. */
function enterSession() {
  preview?.dispose();
  preview = null;
  $('app').hidden = true;
}
/** 세션에서 나온다. 미리보기를 다시 세운다. */
function leaveSession() {
  $('app').hidden = false;
  $('bar').hidden = true;
  $('steps').hidden = true;
  tell('');
  showPreview();
}

/** 가장 긴 변이 이만큼(mm)이 되게 줄인다 — 12m 방을 강의실에 넣는 기본값 */
const TARGET_MM = 2500;

/**
 * 두 모서리 탭이 낼 수 있는 보정의 상한. 이 밖이면 **모서리를 잘못 찍은 것**이지
 * WebXR 축척 오차가 아니다 (실측 오차는 ±2% 였다). 막지는 않고 말만 한다 —
 * 세게 막으면 아무것도 못 하게 된다 (2026-08-04 에 한 번 그렇게 잘못 만들었다).
 */
const SANE_SCALE = [0.5, 2];

/**
 * 평면을 처음 찾고 이만큼은 놓지 못하게 한다.
 *
 * ARCore 의 첫 평면 추정이 가장 거칠고, **그때 놓은 오차가 세션 내내 박힌다**
 * ("처음 화면에 따라 떠 보인다" 의 정체). 앵커가 나중에 보정해 주지만
 * 애초에 덜 익은 값을 안 받는 쪽이 싸다.
 */
const WARMUP_MS = 1500;

/** `화면` 모드의 눈높이 — 서 있는 사람 기준 */
const EYE_M = 1.6;

/**
 * 앵커 보정이 이만큼(m) 넘게 움직이면 **그림자도 다시 그린다.**
 *
 * 키 라이트가 앵커 밑에 있어 맵과 같이 움직이는데, `shadowMap.autoUpdate` 가 꺼져
 * 있으면 three 가 그림자 행렬을 갱신하지 않는다 (`WebGLShadowMap` 이 조기 리턴하고
 * `updateMatrices` 는 그 뒤에 있다). 그러면 **앵커가 보정될수록 그림자가 물체에서
 * 떨어져 나간다** — 앵커를 붙인 목적을 그림자가 되돌리는 셈이다 (2026-08-06 `/감사`).
 */
const ANCHOR_EPS = 0.002;

/**
 * 세 모드가 공유하는 씬 뼈대.
 *
 * **키 라이트를 씬에 붙이지 않고 돌려준다.** AR 은 맵을 따라다녀야 하고
 * (앵커 밑에 붙는다), `화면` 은 방에 고정이라 붙일 자리가 다르다.
 */
function buildScene(layout) {
  const scene = new THREE.Scene();
  const sky = buildLabSky();
  scene.environment = sky;
  scene.environmentIntensity = ENV_INTENSITY;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  // **그림자가 접지감의 전부다.** 대시보드(`stage.js`)는 처음부터 켜 두고 주석까지
  // 달아 놨는데(*"없으면 물체가 떠 보인다"*) AR 에서만 빠져 있었다 — 그래서 정확히
  // 놓아도 뜬 것으로 읽혔다.
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0012;
  const view = createLayoutView(layout);
  return { scene, sky, key, view };
}

/** 키 라이트의 그림자 상자를 발자국 크기에 맞춘다. 세계 단위(m)로 받는다. */
function fitShadow(key, halfM) {
  const c = key.shadow.camera;
  c.left = -halfM; c.right = halfM; c.top = halfM; c.bottom = -halfM;
  c.near = 0.1; c.far = halfM * 6 + 4;
  c.updateProjectionMatrix();
}

/**
 * **맵이 정한 만큼** URDF 를 받아 슬롯에 꽂는다. 대당 6MB · 삼각형 128,808.
 *
 * 대수를 사람이 고르게 두지 않는다 — 맵이 팔 자리를 이미 들고 있고, 거기서 벗어난
 * 대수로 본 화면은 그 맵이 아니다. 받는 동안 **몇 대째인지 화면에 적는다** — 안 그러면
 * 캔버스가 뜬 채 몇 초가 흘러 "멈췄다" 로 읽힌다.
 */
async function mountArms(view) {
  const arms = [];
  const slots = (view.armSlots ?? []).filter((sl) => sl.userData?.arm?.model === 'FR5');
  if (!slots.length) return arms;
  const { gripper } = loadConfig();
  for (let i = 0; i < slots.length; i += 1) {
    tell(`FR5 팔 ${i + 1}/${slots.length}대 받는 중… (대당 6MB)`);
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
      // 팔이 그림자를 던져야 바닥에 서 있는 것으로 읽힌다. 128k 삼각형이 그림자맵에도
      // 한 번 더 들어가므로 **fps 로그가 이 비용을 말한다** (GAP: 폰 성능 미측정).
      robot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      // **자세를 한 번 얹는다.** 관절 0 은 곧게 선 막대라 로봇으로 안 읽힌다.
      // 움직이지는 않는다 — 없는 궤적을 지어내지 않는다는 규약 그대로다.
      setJointsDeg(robot, POSES.home);
      slots[i].add(holder);
      arms.push(robot);
      say(`팔 ${i + 1} 준비 — ${((performance.now() - tLoad) / 1000).toFixed(1)}초 · `
        + `${countTriangles(robot).triangles.toLocaleString()} 삼각형`, 'ok');
    } catch (e) { say(`팔 ${i + 1} 실패 — ${e?.message ?? e}`, 'bad'); }
  }
  return arms;
}

$('go').onclick = async () => {
  const layout = buildPreset(sel.value);
  $('go').disabled = true;
  enterSession();
  tell('맵을 세우는 중…');
  try {
    if (modeOf().xr) await startAR(layout);
    else await startWalk(layout);
  } catch (e) {
    // **폰엔 콘솔이 없다.** 여기서 안 잡으면 거부된 프로미스가 조용히 사라지고
    // 사용자는 "그냥 안 됐다" 만 본다 (2026-08-06 `/감사`).
    say(`중단 — ${e?.message ?? e}`, 'bad');
    leaveSession();
  } finally { sync(); }
};

// ── AR ─────────────────────────────────────────────────────────────────────
async function startAR(layout) {
  const longest = Math.max(layout.floor.widthMm, layout.floor.depthMm);
  // **평면도 원점이 곧 root 원점**이다 (`layout-view.js` 의 slab 이 `W/2, Z(D/2)` 에 놓인다).
  // 그래서 첫 모서리에 anchor 를 놓으면 그대로 맞는다.
  const W = layout.floor.widthMm / 1000;           // m
  const D = layout.floor.depthMm / 1000;

  // 모드마다 시키는 일이 다르다. 문구를 한 곳에 모아 둔다 — 세 군데에 흩어져 있으면
  // 모드를 하나 더 넣을 때마다 삼항 연산자가 한 겹씩 깊어진다.
  const HINT = {
    fit: { first: '링을 놓을 자리에 맞추고 탭 — 폰을 돌려 겨냥', again: '다시 놓을 자리를 겨냥해 탭' },
    walk: { first: '방 한쪽 구석에 링을 맞추고 탭 — 그 자리가 맵의 모서리가 된다', again: '다시 놓을 구석을 겨냥해 탭' },
    real: { first: '맵의 한쪽 모서리에 링을 맞추고 탭 — 다음은 대각선 반대편', again: '맵의 한쪽 모서리를 겨냥해 탭 (두 번 받는다)' },
  };

  // **걸어 다닐 모드는 실제 공간이 맵보다 넓어야 한다.** 좁으면 가상 벽을 통과해
  // 실제 벽으로 걸어간다 — 화면은 아무 말도 안 해 준다. 그래서 숫자를 미리 적어 둔다.
  if (mode !== 'fit') {
    say(`이 맵은 ${W.toFixed(2)}×${D.toFixed(2)}m — 실제 공간이 이보다 좁으면 `
      + '가상 벽을 통과해 걷게 된다', 'bad');
  }

  let session;
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'local-floor'],
      // **`anchors` 가 이 화면의 핵심 옵션이다.** 없으면 놓은 좌표가 `local-floor` 의
      // 고정 숫자로 남는데, ARCore 는 세션 내내 바닥 추정을 갱신한다 — 그 갱신이
      // 좌표계를 움직이고 우리 맵만 옛 자리에 남아 뜬다. 앵커를 붙이면 반대로
      // **보정이 맵을 따라온다**. 걸어 들어가는 사용은 이게 전제다.
      optionalFeatures: ['dom-overlay', 'anchors'],
      // **루트가 화면을 덮으면 탭을 DOM 이 먹어 `select` 가 안 온다** (2026-08-04 실측).
      // 조작바에만 `beforexrselect` 를 걸어 그 위 탭만 DOM 으로 보낸다.
      domOverlay: { root: $('ov') },
    });
  } catch (e) { say(`세션 시작 실패 — ${e?.message ?? e}`, 'bad'); leaveSession(); return; }

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.xr.enabled = true;
  await renderer.xr.setSession(session);
  document.body.appendChild(renderer.domElement);

  const { scene, sky, key, view } = buildScene(layout);
  const camera = new THREE.PerspectiveCamera();   // XR 이 투영행렬을 넣는다

  // 놓을 자리 표식 — 바닥에 눕힌 링. DOM 조준선보다 바닥에서 읽기 쉽다.
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.09, 0.12, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x7fd88f, transparent: true, opacity: 0.9 }),
  );
  reticle.visible = false;
  scene.add(reticle);

  // 맵이 붙는 자리. 탭하면 이 그룹만 옮긴다 — 맵 데이터는 손대지 않는다.
  const anchor = new THREE.Group();
  scene.add(anchor);
  anchor.add(view.root);
  // 키 라이트를 앵커 밑에 둔다 — 맵이 옮겨져도 그림자 방향과 상자가 따라온다.
  anchor.add(key);
  anchor.add(key.target);
  // **바닥 슬래브는 숨긴다** — 진짜 바닥이 카메라 영상에 이미 있다 (cam.js 와 같은 이유).
  const slab = view.root.getObjectByName('slab');
  if (slab) slab.visible = false;

  // **벽을 유령으로.** 근거와 규약은 `features/place/place.js` 에 있다.
  const { walls, ghost, edge } = ghostWalls(view.root, slab);
  // 벽이 0장이면 정합을 눈으로 읽을 기준선이 없다 — 조용히 넘어가면 안 된다
  if (!walls) say('벽이 한 장도 없다 — 이 맵에는 방 껍데기가 없다', 'bad');

  // 그림자 받이 — 슬래브를 숨겼으니 **그림자를 받을 면이 하나도 없다.** 투명하지만
  // 그림자만 그리는 면을 슬래브 자리에 깔면, 실제 바닥 영상 위에 가상 그림자가 얹힌다.
  // 접지가 눈에 읽히는 것은 거의 전부 이 그림자다.
  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ opacity: 0.34 }),
  );
  catcher.position.set(W / 2, 0.002, -D / 2);      // Z(D/2) = −D/2 (layout-view 규약)
  catcher.receiveShadow = true;
  view.root.add(catcher);

  // **끝내기를 여기서 등록한다.** 아래 팔 받기가 대당 6MB 라 그 사이에 뒤로가기를 누르면
  // 죽은 세션에 `requestReferenceSpace` 를 물어 거부되고, 그 거부를 아무도 안 잡는다 —
  // **폰엔 콘솔이 없어 사용자는 "그냥 안 됐다" 만 본다.** 렌더러도 그대로 남는다.
  let ended = false;
  let hits = null;
  const barGuard = (e) => e.preventDefault();
  session.addEventListener('end', () => {
    ended = true;
    renderer.setAnimationLoop(null);
    renderer.domElement.remove();
    hits?.cancel?.();                       // 히트테스트 소스는 명시로 닫는다
    $('bar').removeEventListener('beforexrselect', barGuard);
    view.dispose?.();                       // geometry — 재질은 각자 지운다
    for (const m of [ghost, edge, catcher.material, reticle.material]) m.dispose?.();
    sky.dispose?.();
    renderer.dispose();
    $('hud').hidden = false;
    $('fps').hidden = false;
    say('세션 종료');
    leaveSession();
  });

  // **세 AR 모드의 차이는 이 숫자 하나다.** `view.root` 는 미터로 지어지므로 1.0 이
  // 실물 1:1 이다. 답사는 1.0 을 그대로 쓰고(한 번 탭), 촬영은 1.0 에서 출발해 두 모서리를
  // 받으면 그 방·그 세션의 축척 오차만큼 보정된다.
  const scale0 = mode === 'fit' ? TARGET_MM / longest : 1;
  let scale = scale0;
  let yaw = 0;
  // **손으로 확대·축소했는가.** 이 표시가 없으면 답사에서 실수로 확대해도 계기는
  // 계속 `실물 1:1` 이라 적는다 — 걸어 다니며 눈으로 거리를 재는 모드라 치명적이다.
  // 촬영의 `보정` 은 이것과 다르다. 그건 **1:1 을 맞추려고** 곱한 값이다.
  let zoomed = false;
  const pct = (s) => `${s >= 1 ? '+' : ''}${((s - 1) * 100).toFixed(1)}%`;
  const apply = () => {
    view.root.scale.setScalar(scale);
    anchor.rotation.y = yaw;
    // 라이트는 앵커 공간(=배율 없는 미터)에 있으므로 배율을 곱해 따라가게 한다
    const cx = (W * scale) / 2;
    const cz = -(D * scale) / 2;
    key.target.position.set(cx, 0, cz);
    key.position.set(cx + 2.5 * scale, 5 * scale, cz + 2.5 * scale);
    fitShadow(key, Math.max(W, D) * scale * 0.8);
    renderer.shadowMap.needsUpdate = true;
    $('hud').textContent = hudText({ mode, scale, widthM: W, depthM: D, yaw, zoomed });
  };
  apply();

  const arms = await mountArms(view);
  if (ended) return;                        // 팔 받는 사이에 나갔다 — 아래는 죽은 세션이다
  // 팔이 안 움직이므로 그림자맵을 매 프레임 다시 그릴 이유가 없다 — 폰에서 이게 크다.
  // 바뀔 때는 `apply()` 가, 앵커가 보정될 때는 렌더 루프가 `needsUpdate` 를 켠다.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const hitSpace = await session.requestReferenceSpace('viewer');
  hits = await session.requestHitTestSource({ space: hitSpace });
  let aimed = null;
  let placed = false;
  let found = 0;
  const t0 = performance.now();
  let frames = 0;
  let fpsAt = performance.now();
  const fpsLog = [];

  // **바닥은 세션 전체에서 가장 낮은 면이다.** 한 프레임의 결과 중 최저를 고르는 것은
  // *그 광선 위*의 최저일 뿐이라, 책상을 겨냥한 채 탭하면 맵이 책상 높이에 앉는다.
  //
  // 대신 **`다시 놓기` 가 이 값을 비운다.** 안 그러면 초기 노이즈나 바닥 틈으로 낮은 히트가
  // 한 번 들어왔을 때 세션을 새로 열기 전에는 못 빠져나온다 (2026-08-06 `/감사`).
  let floorY = null;

  // 앵커 — 다음 프레임에 만들 자리와, 만들어진 뒤의 앵커.
  let anchorReq = null;
  let xrAnchor = null;
  let anchorWarned = false;

  // 조작바 위의 탭은 **DOM 이 가져간다** — 안 그러면 버튼을 누를 때마다 맵이 옮겨진다
  $('bar').addEventListener('beforexrselect', barGuard);

  let cornerA = null;                 // 촬영 모드의 첫 모서리
  let barShown = true;
  // 촬영은 탭 2회다. 어디까지 했는지 **로그가 아니라 화면**이 말해야 한다.
  const steps = $('steps').children;
  const setStep = (n) => {
    $('steps').hidden = mode !== 'real' || placed;
    steps[0].classList.toggle('on', n >= 1);
    steps[1].classList.toggle('on', n >= 2);
  };
  setStep(1);

  session.addEventListener('select', () => {
    // **놓은 뒤의 탭은 안 옮긴다.** 촬영 중 화면을 스치면 맵이 튀었다.
    // 대신 조작바를 여닫는 데 쓴다 — 영상에 버튼이 안 찍히게 하려면 이 길뿐이다.
    if (placed) { barShown = !barShown; $('bar').hidden = !barShown; return; }
    if (!aimed) { tell('아직 평면을 못 찾았습니다'); return; }
    if (performance.now() - found < WARMUP_MS) {
      tell('바닥을 조금 더 훑어라 — 평면이 아직 덜 잡혔다');
      return;
    }

    if (mode === 'real' && !cornerA) {
      cornerA = aimed.clone();
      setStep(2);
      tell('이제 대각선 반대편 모서리를 겨냥해 탭');
      say(`모서리 ① 받음 — 높이 ${(aimed.y * 1000).toFixed(0)}mm`);
      return;
    }

    // 놓을 자리. **높이는 겨냥한 면이 아니라 세션 최저면(바닥)을 쓴다.**
    const at = new THREE.Vector3(aimed.x, floorY ?? aimed.y, aimed.z);

    if (mode === 'real') {
      // 배율·회전을 한 번에 낸다. 유도와 부호 규약은 `place.js` 에 있다.
      const sol = solveCorners(cornerA, aimed, W, D);
      scale = sol.scale;
      yaw = sol.yaw;
      at.set(cornerA.x, floorY ?? cornerA.y, cornerA.z);
      say(`모서리 ② 받음 — 잰 대각 ${(sol.measuredM * 1000).toFixed(0)}mm · `
        + `참값 ${(sol.diagM * 1000).toFixed(0)}mm · 보정 ${pct(scale)}`, 'ok');
      if (sol.measuredM < 0.3) say('두 탭이 너무 가깝다 — 같은 자리를 찍었을 수 있다', 'bad');
      if (scale < SANE_SCALE[0] || scale > SANE_SCALE[1]) {
        say('보정이 상식 밖이다 — 마주보는 모서리가 맞는지 확인해라', 'bad');
      }
      // 촬영 모드는 놓는 순간 계기를 끈다. **로그에는 남으므로 `결과 복사`로 회수된다.**
      $('hud').hidden = true;
      $('fps').hidden = true;
    } else {
      say(`놓음 — 겨냥 높이 ${(aimed.y * 1000).toFixed(0)}mm · `
        + `바닥 ${((floorY ?? aimed.y) * 1000).toFixed(0)}mm · 1:${(1 / scale).toFixed(1)}`, 'ok');
    }
    // 앵커가 붙기 전에도 바로 보여야 하니 좌표를 먼저 넣고, 앵커는 다음 프레임에 만든다
    // (`createAnchor` 는 **활성 프레임 안**에서만 부를 수 있다).
    anchor.position.copy(at);
    anchorReq = at.clone();
    placed = true;
    setStep(2);
    tell('');
    apply();
  });

  $('zoomIn').onclick = () => { scale *= 1.25; zoomed = true; apply(); };
  $('zoomOut').onclick = () => { scale /= 1.25; zoomed = true; apply(); };
  $('rotL').onclick = () => { yaw -= Math.PI / 12; apply(); };
  $('rotR').onclick = () => { yaw += Math.PI / 12; apply(); };
  $('again').onclick = () => {
    placed = false;
    cornerA = null;
    anchorReq = null;
    xrAnchor?.delete?.();          // 안 지우면 앵커가 세션에 쌓인다
    xrAnchor = null;
    scale = scale0;                // 손으로 늘린 배율도 되돌린다 — 답사는 1:1 이 전제다
    zoomed = false;
    floorY = null;                 // 잘못 잡힌 바닥에서 빠져나오는 유일한 길
    say('다시 놓기 — 배율과 바닥값을 비웠다');
    $('hud').hidden = false;
    $('fps').hidden = false;
    setStep(1);
    tell(HINT[mode].again);
    apply();
  };
  $('exit').hidden = true;         // AR 은 폰의 뒤로가기로 나간다
  $('bar').hidden = false;

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
          if (floorY === null || aimed.y < floorY) floorY = aimed.y;
          reticle.position.copy(aimed);
          reticle.visible = !placed;
          if (!found) {
            found = performance.now();
            say(`평면 찾음 — ${((found - t0) / 1000).toFixed(1)}초`, 'ok');
            tell(HINT[mode].first);
          }
        }
      }

      // 앵커 만들기 — **활성 프레임 안**이라 여기서만 가능하다.
      if (anchorReq) {
        const req = anchorReq;
        anchorReq = null;
        if (typeof frame.createAnchor === 'function') {
          frame.createAnchor(new XRRigidTransform({ x: req.x, y: req.y, z: req.z }), ref)
            .then((a) => { xrAnchor = a; say('앵커 붙음 — 트래킹 보정이 따라온다', 'ok'); })
            .catch((e) => say(`앵커 실패 — ${e?.message ?? e} (고정 좌표로 진행)`, 'bad'));
        } else if (!anchorWarned) {
          anchorWarned = true;
          say('앵커 미지원 — 걸어 다니면 어긋날 수 있다', 'bad');
        }
      }
      // 앵커가 있으면 **매 프레임 그 자리를 다시 묻는다.** ARCore 가 바닥 추정을 고칠
      // 때마다 이 좌표가 같이 고쳐진다. 회전은 우리 것을 유지한다 (yaw 는 사람이 정했다).
      if (xrAnchor) {
        const p = frame.getPose(xrAnchor.anchorSpace, ref);
        if (p) {
          const q = p.transform.position;
          // **보정이 들어오면 그림자도 다시 그린다** (§ANCHOR_EPS). 이걸 빼면
          // 앵커는 따라오는데 그림자만 옛 자리에 남아 접지가 도로 깨진다.
          if (!renderer.shadowMap.autoUpdate
            && Math.abs(q.x - anchor.position.x) + Math.abs(q.y - anchor.position.y)
              + Math.abs(q.z - anchor.position.z) > ANCHOR_EPS) {
            renderer.shadowMap.needsUpdate = true;
          }
          anchor.position.set(q.x, q.y, q.z);
        }
      }
    }
    // **fps 를 화면에 적고 로그에도 남긴다.** 그림자를 켠 뒤의 비용은 이 숫자가 말한다
    // (GAP: 폰 성능 미측정). 화면에만 있으면 `결과 복사` 로 회수되지 않는다.
    frames += 1;
    if (t - fpsAt > 2000) {
      const f = Math.round((frames * 1000) / (t - fpsAt));
      $('fps').textContent = `${f} fps`;
      fpsLog.push(f);
      if (fpsLog.length % 5 === 0) {
        const srt = [...fpsLog].sort((a, b) => a - b);
        say(`fps 중앙값 ${srt[srt.length >> 1]} · 최저 ${srt[0]} · 팔 ${arms.length}대`);
      }
      frames = 0; fpsAt = t;
    }
    renderer.render(scene, camera);
  });
}

// ── 화면 — AR 없이 방 안에 서서 둘러본다 ────────────────────────────────────
//
// **XR 세션을 안 연다.** 안드로이드 크롬은 헤드셋 없이 `immersive-vr` 을 안 열어준다.
// 실제로 걸어 들어가는 것은 `답사`(1:1 AR)가 하고, 이건 **공간도 폰도 없을 때**
// 맵을 사람 눈높이에서 확인하는 쪽이다.
//
// 그래서 진짜 값어치는 여기 있다: **PC 브라우저에서 열린다.** AR 은 폰이 있어야만
// 확인되는데, 이 모드는 헤드리스로도 렌더된다 — 맵 3D 의 실렌더 검증 경로다.
async function startWalk(layout) {
  const W = layout.floor.widthMm / 1000;
  const D = layout.floor.depthMm / 1000;

  const { scene, sky, key, view } = buildScene(layout);
  scene.add(view.root);
  // AR 과 달리 **슬래브도 벽도 그대로 둔다** — 이 모드는 방 안이다.
  // `updateCutaway` 도 부르지 않는다. 안에서는 벽이 다 보여야 방으로 읽힌다.
  scene.background = sky;         // 위를 보면 천장 대신 환경맵이 보인다
  key.position.set(W / 2 + 3, 5.5, -D / 2 + 3);
  key.target.position.set(W / 2, 0, -D / 2);
  fitShadow(key, Math.max(W, D) * 0.75);
  scene.add(key);
  scene.add(key.target);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const el = renderer.domElement;
  el.id = 'walk';
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 60);
  // 남쪽 벽 근처에 서서 방 안쪽(−z)을 본다. three.js 의 yaw 0 이 −z 방향이다.
  const pos = new THREE.Vector3(W / 2, EYE_M, -D * 0.12);
  let yaw = 0;
  let pitch = -0.05;

  const arms = await mountArms(view);
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  // 끌면 둘러보고, **끌지 않은 탭은 그 바닥으로 간다.** 조이스틱을 안 만드는 이유는
  // 이 모드의 용도가 "맵을 눈으로 확인" 이지 이동 자체가 아니기 때문이다.
  const ray = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let dragging = false;
  let lastX = 0; let lastY = 0; let moved = 0;

  el.addEventListener('pointerdown', (e) => {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    // 합성 포인터(헤드리스 검증)는 캡처가 없다 — 여기서 던지면 조작이 통째로 죽는다
    try { el.setPointerCapture(e.pointerId); } catch { /* 캡처는 있으면 좋은 것뿐이다 */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX; const dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    yaw -= dx * 0.005;
    pitch = Math.max(-1.2, Math.min(1.2, pitch - dy * 0.005));
  });
  el.addEventListener('pointerup', (e) => {
    dragging = false;
    if (moved >= 8) return;                       // 둘러본 것이지 이동이 아니다
    const r = el.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    ), camera);
    if (!ray.ray.intersectPlane(floorPlane, hit)) return;
    // 벽을 뚫고 나가지 않게 방 안으로 가둔다
    pos.x = Math.max(0.4, Math.min(W - 0.4, hit.x));
    pos.z = Math.max(-D + 0.4, Math.min(-0.4, hit.z));
  });

  const onResize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', onResize);

  $('hud').hidden = false;
  $('fps').hidden = false;
  $('hud').textContent = `화면 · ${W.toFixed(2)}×${D.toFixed(2)}m · 눈높이 ${EYE_M}m`;
  tell('끌어서 둘러본다 · 바닥을 탭하면 그리로 간다');
  for (const id of ['zoomIn', 'zoomOut', 'rotL', 'rotR', 'again']) $(id).hidden = true;
  $('exit').hidden = false;
  $('bar').hidden = false;

  $('exit').onclick = () => {
    renderer.setAnimationLoop(null);
    removeEventListener('resize', onResize);
    el.remove();
    document.body.style.overflow = '';
    for (const id of ['zoomIn', 'zoomOut', 'rotL', 'rotR', 'again']) $(id).hidden = false;
    $('exit').hidden = true;
    view.dispose?.();
    sky.dispose?.();
    renderer.dispose();
    say('화면 모드 종료');
    leaveSession();
  };

  let frames = 0;
  let fpsAt = performance.now();
  say(`화면 모드 시작 — ${W.toFixed(2)}×${D.toFixed(2)}m · 팔 ${arms.length}대`, 'ok');

  renderer.setAnimationLoop((t) => {
    camera.position.copy(pos);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    frames += 1;
    if (t - fpsAt > 2000) {
      $('fps').textContent = `${Math.round((frames * 1000) / (t - fpsAt))} fps`;
      frames = 0; fpsAt = t;
    }
    renderer.render(scene, camera);
  });
}

// ── 기동. 지원 확인이 끝나야 칩·버튼 상태가 정해진다.
if (!navigator.xr) {
  $('dot').className = 'bad';
  $('sup').textContent = 'navigator.xr 이 없습니다 — AR 은 안 되고 `화면` 만 됩니다';
} else {
  arOk = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  $('dot').className = arOk ? 'ok' : 'bad';
  $('sup').textContent = arOk ? '이 기기는 AR 을 엽니다' : '이 기기는 AR 을 못 엽니다';
  say(`immersive-ar 지원: ${arOk}`, arOk ? 'ok' : 'bad');
}
renderChips();
sync();
showPreview();

// 헤드리스 검증용 노출 — `cam.js` 의 `__cam` 과 같은 계약이다 (`AR/AGENTS.md`).
// **빼지 않는다.** 이 화면은 칩과 미리보기를 모듈이 만들므로, 이게 없으면 검증기가
// 준비 시점을 알 길이 없다 — 준비 전에 눌러 놓고 "버튼이 안 열린다" 는 **거짓 실패**를
// 낸다 (`xr-web-verify.mjs` 첫 판이 실제로 그랬다 · 2026-08-06).
globalThis.__xr = {
  arOk,
  mode: () => mode,
  setMode: (m) => { mode = m; sync(); },
  modes: () => MODES.map((x) => x.id),
  preview: () => Boolean(preview),
};
