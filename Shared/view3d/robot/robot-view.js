// FR5 로봇 3D 로딩 — 3D 화면과 AR 화면이 **함께 쓴다**. AR 전용으로 만들지 않는다.
//
// 단위 변환은 이 파일 한 곳에서만 한다 (하드 룰 5).
//   설정 파일: 밀리미터 · 도(°)
//   내부(URDF·three.js): 미터 · 라디안
//
// 함정 (docs/evidence/2026-07-29-urdf-web-render.md 실측)
//   ① STL 은 비동기로 늦게 붙는다. load 콜백 시점에 메시가 0개다 → manager.onLoad 를 기다려라.
//   ② 그리퍼 STL 은 밀리미터, 팔 URDF 는 미터다. meshScale 을 빼면 1000배로 뜬다.
//
// (해소됨) three.js 를 손으로 importmap 에 매핑하던 함정 —
//   r185 가 three.module.js + three.core.js 로 쪼개져 있어 core 를 빼면 에러 없이 화면이 죽었다.
//   Vite 로 옮기면서 npm 이 해결한다 (docs/evidence/2026-07-30-vite-gate.md).

import * as THREE from 'three';
import URDFLoader from 'urdf-loader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const DEG = Math.PI / 180;
const MM = 0.001; // 밀리미터 → 미터

// 설정은 **빌드 시 import 한다. fetch 하지 않는다.**
// 파일이 없거나 깨지면 빌드가 실패한다 — 런타임에 조용히 실패하면
// 화면에 아무것도 안 뜨는데 콘솔 에러도 없다 (D15·D18, BUILD-VITE.md §설정).
// 두 JSON 은 .env 에서 굽는 산출물이다 → node scripts/build/config.mjs
import gripperConfig from '../../data/config/gripper-mount.json';
import markerConfig from '../../data/config/marker-offset.json';

/** 설정 두 개. 값을 코드에 박지 않기 위한 유일한 경로. */
export function loadConfig() {
  // 조정 화면이 값을 직접 고치므로 사본을 준다 — 원본을 고치면 다른 화면이 같이 바뀐다.
  return {
    gripper: structuredClone(gripperConfig),
    marker: structuredClone(markerConfig),
  };
}

/**
 * URDF 팔 + 그리퍼를 하나의 Object3D 로 만든다.
 *
 * 반환값의 robot 은 **URDF 좌표계(Z-up, 미터)** 그대로다.
 * three.js 는 Y-up 이므로 화면에 세울 때 부모에서 rotation.x = -PI/2 를 준다 —
 * robot 자체를 돌리면 관절 각도 해석이 헷갈린다.
 */
export function loadRobot({ urdfUrl, gripperCfg, gripperDir, onProgress }) {
  return new Promise((resolve, reject) => {
    const manager = new THREE.LoadingManager();
    const loader = new URDFLoader(manager);
    // loadMeshCb 는 건드리지 않는다. urdf-loader 의 기본 로더가 이미 STL 을 읽고
    // URDF 의 <material> 색을 입힌다 — 직접 짜면 시그니처
    // (path, manager, material, done) 를 틀리기 쉽다.

    let robot = null;
    let gripperGroup = null;
    const failed = [];

    manager.onProgress = (_url, loaded, total) => onProgress?.(loaded, total);
    manager.onError = (url) => failed.push(url);

    // ① 여기서 세면 0개다. manager.onLoad 까지 기다린다.
    manager.onLoad = () => {
      if (failed.length) {
        reject(new Error(`메시 로딩 실패 ${failed.length}개: ${failed.join(', ')}`));
        return;
      }
      resolve({ robot, gripperGroup, stats: countTriangles(robot) });
    };

    loader.load(
      urdfUrl,
      (result) => {
        robot = result;
        if (gripperCfg) gripperGroup = attachGripper(robot, gripperCfg, gripperDir, manager);
      },
      undefined,
      (err) => reject(err),
    );
  });
}

/**
 * 그리퍼 STL 3개를 한 Group 에 담아 부모 링크에 붙인다.
 *
 * 세 파일이 **같은 조립 좌표계**에 구워져 있어 상대 배치를 계산할 필요가 없다
 * (min Z 가 셋 다 -334~-340mm 부근, 손가락은 X축 대칭 — STACK.md §그리퍼).
 * 그래서 모르는 값은 Group 하나의 위치·회전뿐이다.
 */
function attachGripper(robot, cfg, dir, manager) {
  const parent = robot.links?.[cfg.parentLink];
  if (!parent) throw new Error(`부모 링크가 없다: ${cfg.parentLink}`);

  // mount = 설정값(위치·회전)을 적용하는 바깥 껍데기.
  // 안쪽 meshRoot 가 밀리미터→미터 축소를 맡는다.
  // 둘을 한 노드에 합치면 회전이 스케일에 섞여 값을 조정할 때 헷갈린다.
  const mount = new THREE.Group();
  mount.name = 'gripperMount';
  const meshRoot = new THREE.Group();
  meshRoot.name = 'gripperMeshes';
  meshRoot.scale.setScalar(cfg.meshScale); // ② 밀리미터 보정
  mount.add(meshRoot);
  parent.add(mount);

  applyMount(mount, cfg);

  const stl = new STLLoader(manager);
  for (const file of cfg.meshes) {
    stl.load(`${dir}${file}`, (geom) => {
      geom.computeVertexNormals();
      // 팔(URDF 재질 = 연회색)과 **구별되는 색**으로 둔다. 정합을 눈으로 확인할 때
      // 같은 색이면 어디가 팔이고 어디가 그리퍼인지 안 보인다.
      meshRoot.add(new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
        color: 0x4a5a68, metalness: 0.45, roughness: 0.4,
      })));
    });
  }
  return mount;
}

/** 설정값을 mount 에 적용한다. 육안 정합 중 여러 번 다시 부른다. */
export function applyMount(mount, cfg) {
  const [x, y, z] = cfg.positionMm;
  mount.position.set(x * MM, y * MM, z * MM);
  const [rx, ry, rz] = cfg.rotationDeg;
  mount.rotation.set(rx * DEG, ry * DEG, rz * DEG);
}

/** 게이트 기준값과 대조할 수 있는 형태로 센다 (scripts/check/assets.sh). */
export function countTriangles(root) {
  let tris = 0;
  let meshes = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes += 1;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return { meshes, triangles: Math.round(tris) };
}

/** 관절 이름 → 각도(도). 로봇 API 가 도를 쓰므로 바깥 표면은 도로 맞춘다. */
export function setJointsDeg(robot, jointsDeg) {
  for (const [name, deg] of Object.entries(jointsDeg)) {
    robot.setJointValue?.(name, deg * DEG);
  }
}
