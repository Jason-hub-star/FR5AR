// 3D 쌍둥이 — 상태 스트림의 관절각을 URDF 에 그대로 얹는다. 렌더 파이프는
// AR/src/screens/robot.js 와 같은 재료(@fr5/shared robot-view)를 쓴다.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadConfig, loadRobot, setJointsDeg, setGripperOpenPct } from '@fr5/shared/view3d/robot.js';

export function RobotTwin({ jointsDeg, gripperPct }) {
  const hostRef = useRef(null);
  const jointsRef = useRef(jointsDeg);
  jointsRef.current = jointsDeg;
  const gripRef = useRef(gripperPct);   // 손가락 개폐 — 관절과 같은 틱에서 그린다
  gripRef.current = gripperPct;

  useEffect(() => {
    const host = hostRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeae8e5);          // 밝은 테마 (D38)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    camera.position.set(1.4, 1.1, 1.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.45, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2, 3, 2);
    scene.add(key);
    scene.add(new THREE.GridHelper(2, 20, 0xb8b4ae, 0xcfccc7));

    // URDF 는 Z-up, three.js 는 Y-up — 로봇이 아니라 부모를 돌린다 (robot-view 규칙)
    const zUpToYUp = new THREE.Group();
    zUpToYUp.rotation.x = -Math.PI / 2;
    scene.add(zUpToYUp);

    let robot = null;
    let gripMount = null;
    let raf = 0;
    let disposed = false;
    const { gripper } = loadConfig();
    loadRobot({
      urdfUrl: '/FAIRINO_FR5/fairino5_v6.urdf',
      gripperCfg: gripper,
      gripperDir: '/PGEA_100_40/',
    }).then((r) => {
      if (disposed) return;
      robot = r.robot;
      gripMount = r.gripperGroup ?? null;
      zUpToYUp.add(robot);
      host.dataset.ready = '1';                            // 실렌더 검증이 이 깃발을 본다
    }).catch((e) => { host.dataset.error = String(e.message || e); });

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const tick = () => {
      if (robot) {
        const j = jointsRef.current;
        setJointsDeg(robot, { j1: j[0], j2: j[1], j3: j[2], j4: j[3], j5: j[4], j6: j[5] });
        setGripperOpenPct(gripMount, gripRef.current, gripper.fingerHalfStrokeMm);
      }
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      host.replaceChildren();
    };
  }, []);

  return <div className="twin" data-t="twin" ref={hostRef} />;
}
