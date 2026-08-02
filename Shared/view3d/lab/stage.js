// 무대 — 렌더러·카메라·조명·톤매핑. **"압도적 시각화" 의 8할이 여기다.**
//
// 에셋이 0바이트다. `RoomEnvironment` 는 three.js 에 내장돼 있어 다운로드가 없는데,
// 이것만 붙여도 스테인리스·흰 플라스틱이 산다 — 지금 로봇이 밋밋한 이유가 정확히 조명이다.
// 부족해지면 Poly Haven 실내 HDRI(CC0) 1~2K 로 갈아끼운다. `setEnvironment()` 한 곳만 바뀐다.
//
// **React 를 쓰지 않는다** (Shared/view3d 규약). Dashboard 는 이걸 ref 로 마운트한다.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildLabSky, ENV_INTENSITY } from './sky.js';
import { applyCalibToCamera } from '../camera/global-cam.js';

/**
 * 무대를 만든다. 반환값의 `dispose()` 를 **반드시** 부른다 —
 * 탭을 왕복하면 WebGL 컨텍스트가 쌓여 브라우저가 막는다 (CONSOLE-REACT.md).
 */
// 배경은 UI 배경(#faf9f7)보다 **어둡게** 둔다. 흰 방을 흰 배경에 놓으면 경계가 사라진다.
/**
 * 무대를 만든다.
 *
 * 글로벌 카메라 화면은 배치안 뷰와 **셋이 반대**라 옵션으로 연다 (새 stage 를 만들면
 * 조명·톤매핑이 갈라져 두 화면 색이 달라진다):
 *   · `alpha`    배경 투명 — 뒤에 카메라 영상이 비쳐야 한다
 *   · `calib`    카메라를 캘리브레이션 값으로 **고정** — 화각·주점·포즈를 밖에서 주입
 *   · `controls` 궤도 조작 끄기 — 천장에 박힌 실카메라는 돌아가지 않는다
 */
export function createStage(host, {
  background = 0xd7dade, alpha = false, controls: useControls = true, calib = null,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha });
  // 폰은 dpr 3 이 흔하다. 2 로만 잘라도 픽셀이 4배라 그림자 갱신이 눈에 띄게 느려진다.
// 좁은 화면에서는 1.5 로 더 자른다 — 흰색 모형이라 계단이 잘 안 보인다 (질감이 없다).
const _narrow = matchMedia?.('(max-width: 820px)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, _narrow ? 1.5 : 2));
  // 사진 같은 느낌은 톤매핑이 만든다. 선형으로 두면 밝은 곳이 하얗게 날아간다.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // 접지감. 없으면 물체가 떠 보인다
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // 투명 배경은 `background = null` **과** clearAlpha 0 을 둘 다 해야 한다.
  // 하나만 하면 검은 화면이 깔려 영상이 안 보인다.
  if (alpha) renderer.setClearAlpha(0);
  else scene.background = new THREE.Color(background);

  // 환경광 — 반사·거칠기가 여기서 나온다. 조명 몇 개로는 이 느낌이 안 난다.
  // **파일을 받지 않는다.** 64×32 절차적 하늘을 코드로 만든다 (sky.js).
  // `RoomEnvironment` 보다 가볍고 **클린룸 색으로 조절된다** — 그게 바꾼 이유다.
  const sky = buildLabSky();
  scene.environment = sky;
  scene.environmentIntensity = ENV_INTENSITY;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
  if (calib) applyCalibToCamera(camera, calib);

  const controls = useControls ? new OrbitControls(camera, renderer.domElement) : null;
  if (controls) {
    controls.enableDamping = true;     // 손맛. 이거 하나로 "잘 만든 것" 처럼 보인다
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;  // 바닥 아래로 못 내려가게
  }

  // 주광 — 그림자를 만드는 유일한 빛. 환경광이 나머지를 채운다.
  // 주광 — 그림자를 만드는 유일한 빛. 환경광이 나머지를 채운다.
  //
  // 그림자 수치는 `pascalorg/editor`(MIT) 가 실측으로 정한 값을 가져왔다.
  // 그쪽 주석이 근거를 적어 뒀다 —
  //   · normalBias 0.3 은 그림자를 표면에서 30cm 띄워 **벽 그림자가 바닥에서 떨어져 보인다**
  //   · 0.07 이하는 1024 맵에서 얼룩(acne)이 남는다 → **0.08 이 얼룩 없는 최소값**
  //   · depth bias 는 그것만으로 부족해 -0.0005 를 같이 쓴다
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(5, 8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);   // 2048 은 이 규모에 낭비다
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.08;
  key.shadow.radius = 2;                // 부드러운 가장자리
  const c = key.shadow.camera;
  c.left = -6; c.right = 6; c.top = 6; c.bottom = -6; c.near = 0.5; c.far = 40;
  scene.add(key, key.target);

  // **앰비언트를 올리지 않는다.** 그쪽 주석: "0.55 클램프가 주광의 45% 를 그림자에 새게 해
  // 실내가 평평해졌다". 채움은 환경맵이 한다 — 여기선 아주 약하게만 둔다.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e9ea, 0.12));

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    // **캘리브레이션 카메라는 화면 크기에 반응하지 않는다.** 투영 행렬이 실측 화각·주점이라
    // 여기서 aspect 로 덮어쓰면 애써 잰 값이 날아간다. 화면 비율은 CSS 로 맞춘다.
    if (!calib) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    // **updateStyle 을 끄지 않는다.** 끄면 캔버스 CSS 크기가 버퍼 크기(=픽셀비 배)로 남아
    // 컨테이너의 몇 배가 되고 왼쪽 위 일부만 보인다. 실제로 밟았다.
    renderer.setSize(w, h);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const ticks = [];
  renderer.setAnimationLoop(() => {
    controls?.update();
    for (const f of ticks) f();
    renderer.render(scene, camera);
  });

  const api = {
    scene, camera, renderer, controls,
    /** 매 프레임 부를 함수를 등록한다 */
    onTick: (f) => ticks.push(f),
    /** 대상 전체가 화면에 담기게 시점을 잡는다 */
    frame(object3d, { pitch = 0.42, pad = 1.35 } = {}) {
      if (calib) return;               // 실카메라 시점은 옮기는 게 아니다
      const box = new THREE.Box3().setFromObject(object3d);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const r = Math.max(size.x, size.z) * 0.5 * pad;
      const dist = r / Math.tan((camera.fov * Math.PI) / 360);
      controls?.target.copy(center);
      camera.position.set(center.x + dist * 0.75, center.y + dist * pitch, center.z + dist * 0.75);
      camera.updateProjectionMatrix();
      controls?.update();
    },
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls?.dispose();
      sky.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      if (globalThis.__stage === api) delete globalThis.__stage;
    },
  };

  // 헤드리스 검증용. 카메라·씬을 밖에서 봐야 "정말 그렇게 보이나" 를 숫자로 판정할 수 있다.
  globalThis.__stage = api;
  return api;
}
