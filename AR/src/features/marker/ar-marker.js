// AR.js 초기화 — 마커 위에 물체를 올린다.
//
// 정답지는 AR.js 저장소의 `three.js/examples/default.html` 이다.
// **`minimal_ES6.html`·`basic.html` 을 베끼면 안 된다** — 그쪽은
// `changeMatrixMode: 'cameraTransformMatrix'` 로 카메라를 움직이는 방식이라
// 마커 위에 물체가 서지 않는다.
//
// 마커는 패턴이 아니라 **바코드 3x3 Hamming(6,3)** 이다 (STACK.md §마커, DECISION-LOG D10).

import * as THREE from 'three';
import {
  ArToolkitProfile, ArToolkitSource, ArToolkitContext, ArMarkerControls, ArSmoothedControls,
} from 'threex';

/**
 * 스무딩 세기. 깜빡임(마커를 순간적으로 놓쳐 물체가 사라지는 것)을 줄이는 값들.
 *
 * **`minVisibleDelay` 는 전부 0 이다.** 이 값이 0 보다 크면 마커가 그 시간만큼
 * **연속으로** 잡혀야 물체가 뜨는데, 검출이 띄엄띄엄하면 조건이 영원히 안 차서
 * **아무것도 안 뜬다.** 실제로 0.05 를 넣었다가 로봇이 통째로 안 나오는 일을 겪었다.
 * 0 이면 잡히는 순간 바로 뜨므로, 스무딩을 켜도 "안 뜨는" 위험이 없다.
 *
 * 깜빡임에 듣는 값은 `minUnvisibleDelay` — **놓쳐도 유지하는 초** 다.
 * lerp* 는 목표를 따라가는 비율 (낮을수록 부드럽고 반응이 늦다).
 */
export const SMOOTHING = {
  없음: null,
  약: { lerpPosition: 0.7, lerpQuaternion: 0.4, lerpScale: 0.7, minVisibleDelay: 0, minUnvisibleDelay: 0.25 },
  중: { lerpPosition: 0.4, lerpQuaternion: 0.2, lerpScale: 0.4, minVisibleDelay: 0, minUnvisibleDelay: 0.6 },
  강: { lerpPosition: 0.22, lerpQuaternion: 0.12, lerpScale: 0.22, minVisibleDelay: 0, minUnvisibleDelay: 1.2 },
};

/**
 * 카메라 영상 위에 마커를 찾아 좌표계를 세운다.
 *
 * **원시 추적과 표시를 분리한다.** `ArMarkerControls` 가 잡는 값은 프레임마다 튀고,
 * 한 프레임만 놓쳐도 물체가 사라져 깜빡인다. 그래서 눈에 보이는 것은
 * `ArSmoothedControls` 로 감싼 쪽에 붙이고, 원시 쪽은 그것을 따라가게만 쓴다.
 *
 * @returns {{ markerRoot: THREE.Group, markerRaw: THREE.Group, camera: THREE.Camera,
 *             update: Function, onResize: Function, ready: () => boolean,
 *             setSmoothing: Function, stats: () => object }}
 */
export function initAR({
  renderer, scene, markerRoot, cameraParametersUrl, barcodeValue, onStatus,
  smoothing = '없음',   // 기본은 변경 이전 동작. 켜는 것은 ⚙ 에서 사람이 고른다
}) {
  ArToolkitContext.baseURL = './';

  // PerspectiveCamera 가 아니다. AR.js 가 투영행렬을 직접 넣는다.
  const camera = new THREE.Camera();
  scene.add(camera);

  // markerRoot 는 바깥에서 만들어 넘긴다 — AR 을 켜기 전에 이미 자식(로봇·궤적)이
  // 붙어 있어야 하기 때문이다. 없으면 여기서 만든다.
  if (!markerRoot) {
    markerRoot = new THREE.Group();
    scene.add(markerRoot);
  }

  // 원시 추적 대상. **화면에 보이지 않는다** — 여기에 물체를 붙이면 깜빡인다.
  const markerRaw = new THREE.Group();
  markerRaw.visible = false;
  scene.add(markerRaw);

  let smoothed = null;
  function setSmoothing(level) {
    const p = SMOOTHING[level];
    if (!p) { smoothed = null; return level; }
    smoothed = new ArSmoothedControls(markerRoot, p);
    return level;
  }
  setSmoothing(smoothing);

  const profile = new ArToolkitProfile();
  profile.sourceWebcam();

  // 기본값이 '../data/data/camera_para.dat' 라 우리 배치와 다르다. 명시한다.
  profile.contextParameters.cameraParametersUrl = cameraParametersUrl;
  // 바코드를 읽으려면 mono 만으로는 안 된다.
  profile.contextParameters.detectionMode = 'mono_and_matrix';
  profile.contextParameters.matrixCodeType = '3x3_HAMMING63';
  // patternRatio 는 기본 0.5 그대로 둔다 — 인쇄물의 테두리 비율(25% × 2)과 맞아야 한다.

  const source = new ArToolkitSource(profile.sourceParameters);
  let context = null;
  let markerControls = null;

  function onResize() {
    if (!source.ready) return;
    source.onResizeElement();
    source.copyElementSizeTo(renderer.domElement);
    // arController 캔버스까지 맞춰야 폰을 돌렸을 때 정합이 안 깨진다.
    if (context?.arController) source.copyElementSizeTo(context.arController.canvas);
  }

  /** iOS 는 세로/가로에 따라 소스 방향이 달라진다. 예제의 분기를 그대로 쓴다. */
  function sourceOrientation() {
    const el = source.domElement;
    return el.videoWidth > el.videoHeight ? 'landscape' : 'portrait';
  }

  function initContext() {
    context = new ArToolkitContext(profile.contextParameters);
    context.init(() => {
      camera.projectionMatrix.copy(context.getProjectionMatrix());
      const o = sourceOrientation();
      context.arController.orientation = o;
      context.arController.options.orientation = o;
      onStatus?.(`카메라 ${source.domElement.videoWidth}×${source.domElement.videoHeight} · ${o}`);
      onResize();
    });

    // **markerRaw 에 붙인다.** markerRoot(보이는 쪽)에 붙이면 스무딩이 무의미해진다.
    markerControls = new ArMarkerControls(context, markerRaw, {
      type: 'barcode',
      barcodeValue,
      smooth: true,       // 라이브러리 자체의 떨림 완화 (최근 5프레임)
      smoothCount: 5,
      smoothTolerance: 0.01,
      smoothThreshold: 2,
    });
  }

  source.init(
    () => {
      // canplay 전에 context 를 만들면 영상 크기를 몰라 방향 판단이 틀린다.
      source.domElement.addEventListener('canplay', initContext, { once: true });
      onResize();
    },
    (err) => onStatus?.(`카메라를 열 수 없다: ${err?.name ?? err}`),
  );

  addEventListener('resize', onResize);

  // --- 진단 수치. **폰에서는 콘솔을 못 본다.** 화면에 띄울 숫자를 여기서 모은다.
  const diag = { frames: 0, hits: 0, losses: 0, lastSeenAt: 0, fps: 0 };
  let fpsFrames = 0;
  let fpsAt = performance.now();
  let wasRawVisible = false;
  const tmp = new THREE.Vector3();

  return {
    markerRoot,   // 보이는 쪽 (스무딩됨) — 물체를 여기에 붙인다
    markerRaw,    // 원시 추적 — 진단용
    camera,
    ready: () => Boolean(context && source.ready),
    visible: () => markerRoot.visible,
    setSmoothing,

    update() {
      if (!context || !source.ready) return;
      context.update(source.domElement);

      diag.frames += 1;
      if (markerRaw.visible) {
        diag.hits += 1;
        diag.lastSeenAt = performance.now();
      } else if (wasRawVisible) {
        diag.losses += 1;   // 잡고 있다가 놓친 횟수 = 깜빡임의 원인 지표
      }
      wasRawVisible = markerRaw.visible;

      if (smoothed) smoothed.update(markerRaw);
      else markerRoot.visible = markerRaw.visible;
      if (markerRaw.visible && !smoothed) {
        markerRoot.position.copy(markerRaw.position);
        markerRoot.quaternion.copy(markerRaw.quaternion);
        markerRoot.scale.copy(markerRaw.scale);
      }

      fpsFrames += 1;
      const now = performance.now();
      if (now - fpsAt >= 1000) {
        diag.fps = Math.round((fpsFrames * 1000) / (now - fpsAt));
        fpsFrames = 0;
        fpsAt = now;
      }
    },

    /**
     * @param markerSizeMm 인쇄물 실측 크기. 거리를 실단위로 환산하는 데 쓴다.
     *
     * 마커 좌표계는 **마커 한 변 = 1 단위**다. 그래서 카메라(원점)에서
     * markerRaw 까지의 거리 × 마커 실측 크기 = 실제 거리다.
     * 이 값이 "몇 m까지 인식되나"를 현장에서 재는 유일한 방법이다.
     */
    stats(markerSizeMm) {
      const seen = markerRaw.visible;
      const distM = seen ? markerRaw.getWorldPosition(tmp).length() * (markerSizeMm / 1000) : null;
      return {
        fps: diag.fps,
        인식률: diag.frames ? Math.round((diag.hits / diag.frames) * 100) : 0,
        놓침: diag.losses,
        프레임: diag.frames,
        보임: seen,
        표시중: markerRoot.visible,   // 스무딩 덕에 놓쳐도 잠시 true 로 남는다
        거리m: distM === null ? null : +distM.toFixed(2),
        카메라: source.domElement ? [source.domElement.videoWidth, source.domElement.videoHeight] : null,
        캔버스: context?.arController ? [context.arController.canvas.width, context.arController.canvas.height] : null,
      };
    },
    resetStats() { diag.frames = 0; diag.hits = 0; diag.losses = 0; },
    onResize,
  };
}
