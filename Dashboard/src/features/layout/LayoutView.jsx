// 배치안 3D 뷰 — **3D 는 React 밖에서 산다.** React 는 붙일 자리와 생명주기만 준다.
//
// R3F 를 쓰지 않는 이유 (D17): `Shared/view3d/` 는 바닐라 three 이고 AR 과 같이 쓴다.
// R3F 로 가면 로봇 로딩 경로가 둘이 되고, 그게 배치가 갈라지는 두 번째 경로다.
//
// **효과를 둘로 나눈다.** 하나로 두면 물건을 하나 옮길 때마다 `layout` 이 새 객체가 되어
// 무대가 통째로 다시 만들어지고 **카메라가 기본 시점으로 튄다** — 편집 중에 이러면 못 쓴다.
//   ① 무대(렌더러·카메라·조명) = 마운트에 한 번. 카메라는 여기 살아 있다
//   ② 내용물(방·가구) = 배치안이 바뀔 때만. 시점은 건드리지 않는다
// 시점 맞추기(`frame`)는 **배치안 자체가 바뀐 첫 순간에만** 한다 (A↔B 전환·최초 진입).

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { createStage } from '@fr5/shared/view3d/lab/stage.js';
import { createLayoutView } from '@fr5/shared/view3d/lab/layout-view.js';
import { createInteraction } from '@fr5/shared/view3d/lab/interaction.js';
import { SIZE_MM, SIZE_LABEL, SIZE_RANGE_MM, SIZE_AXIS } from '@fr5/shared/data/layout/catalog.js';
import { sizeMmOf } from '@fr5/shared/view3d/parts.js';
import { loadConfig, loadRobot, setJointsDeg } from '@fr5/shared/view3d/robot.js';

// **작업 자세.** URDF 기본값(전부 0°)은 팔이 일직선이라 흰 막대로 보인다 — 로봇으로 안 읽힌다.
// 이 화면은 배치를 보는 곳이라 관절값은 표시용이다 (실기 각도는 F9 가 따로 받는다).
const READY_DEG = { j1: 0, j2: -60, j3: 90, j4: -120, j5: -90, j6: 0 };

/**
 * FR5 팔 — **한 번만 받아서 돌려 쓴다.**
 *
 * 물건 하나를 옮길 때마다 `createLayoutView` 가 새로 만들어진다. 그때마다 URDF·STL 6MB 를
 * 다시 받으면 편집이 멈춘다. 그래서 모듈 수준에 한 개만 두고 **부모만 갈아 끼운다.**
 *
 * ⚠ `view.dispose()` 는 트리를 훑으며 지오메트리를 지운다 — **떼어낸 뒤에 부른다.**
 * 안 그러면 두 번째 편집부터 팔이 빈 껍데기가 된다.
 *
 * 실패해도 조용히 없는 채로 간다 — 배치 판단의 근거는 도달 링이지 팔 모형이 아니다.
 */
let armPromise = null;
let armObj = null;         // 받아 놓은 것. **동기로 떼어내야** dispose 보다 먼저 돈다
function getArm() {
  if (!armPromise) {
    const { gripper } = loadConfig();
    armPromise = loadRobot({
      urdfUrl: '/FAIRINO_FR5/fairino5_v6.urdf',
      gripperCfg: gripper,
      gripperDir: '/PGEA_100_40/',
    }).then(({ robot }) => {
      setJointsDeg(robot, READY_DEG);
      // URDF 는 Z-up, three 는 Y-up. **로봇을 돌리지 않고 부모를 돌린다** —
      // 로봇 자체를 돌리면 관절 각도 해석이 헷갈린다 (AR/src/screens/robot.js 와 같은 규약).
      const holder = new THREE.Group();
      holder.rotation.x = -Math.PI / 2;
      holder.add(robot);
      // **피킹에서 뺀다.** 팔은 배치안의 물건이 아니라 배경이다 — 끌 수도 지울 수도 없다.
      holder.traverse((o) => { o.raycast = () => {}; });
      armObj = holder;
      return holder;
    }).catch((e) => {
      // **조용히 실패하지 않는다** (D15·D18). 화면은 계속 돌지만 이유는 콘솔에 남긴다.
      console.warn('FR5 팔을 못 불러왔다 — 도달 링만 그린다:', e?.message ?? e);
      return null;
    });
  }
  return armPromise;
}

/**
 * 숫자 한 칸. **끌기는 100mm 격자에 붙어 그 사이 값을 못 넣는다** — 그래서 이게 있다.
 *
 * 규칙 하나가 전부다 — **타이핑 중에는 입력칸 값을 절대 되쓰지 않는다.**
 * `8` 을 치고 `0` 을 치려는 순간 화면이 `8` 을 지우면 못 쓴다.
 * (AR 의 `features/ui/number-pair.js` 가 같은 버그를 고치며 얻은 규칙이다.
 *  그쪽은 바닐라 DOM + 슬라이더 쌍이라 코드는 못 가져온다 — 규칙만 가져왔다.)
 * 자르기·격자 맞추기는 **손을 뗄 때**(`blur`) 한 번만 한다.
 */
function NumBox({ label, value, min, max, step, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  const [typing, setTyping] = useState(false);
  // 끌어서 값이 바뀌거나 고른 물건이 바뀌면 따라간다 — **타이핑 중이 아닐 때만**
  useEffect(() => { if (!typing) setDraft(String(value)); }, [value, typing]);

  const commit = () => {
    const n = Number(draft.trim());
    setTyping(false);                       // 어느 경우든 화면은 실제 값으로 돌아온다
    if (draft.trim() === '' || !Number.isFinite(n)) return;
    const v = Math.min(max, Math.max(min, Math.round(n / step) * step));
    if (v !== value) onCommit(v);
  };

  return (
    <label className="numbox">
      <span>{label}</span>
      <input
        type="number" value={draft} step={step} min={min} max={max}
        onChange={(e) => { setTyping(true); setDraft(e.target.value); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setTyping(false); e.currentTarget.blur(); }
        }}
      />
    </label>
  );
}

// 우클릭 메뉴 항목. **단축키를 같이 적는다** — 메뉴가 단축키를 가르치는 자리다.
const MENU = [
  { id: 'dup',  label: '복제',      key: 'Ctrl+D' },
  { id: 'rot',  label: '90° 회전',  key: 'R' },
  { id: 'undo', label: '되돌리기',  key: 'Ctrl+Z' },
  { id: 'del',  label: '삭제',      key: 'Del', danger: true },
];

export function LayoutView({
  layout, onReport, onCommit, onPickId, onDuplicate, onRemove, onUndo, canUndo, boundsMm,
}) {
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const editRef = useRef(null);
  const viewRef = useRef(null);
  const framedRef = useRef(null);          // 마지막으로 시점을 맞춘 배치안 id
  const [picked, setPicked] = useState(null);
  const [menu, setMenu] = useState(null);          // { item, x, y } — 우클릭 자리
  // 커밋 콜백이 매번 새로 만들어지지 않게 최신 선택을 ref 로도 들고 있는다
  const pickedRef = useRef(null);
  pickedRef.current = picked;

  // 패널에 보일 값. **정본은 배치안이다** — 3D 노드의 `userData.item` 은 `{kind,id,type}` 만
  // 담아 회전을 실어 나르지 않고(180° 인 물건이 0° 로 뜬다), `picked` 는 고른 순간의 사본이라
  // 되돌리기로 배치안이 돌아가도 안 따라온다. **끄는 중(`live`)에만** 손끝을 따라간다.
  let shown = null;
  if (picked?.posMm) {
    const rec = [...(layout.props ?? []), ...(layout.stations ?? [])].find((o) => o.id === picked.id);
    const src = picked.live || !rec ? picked.posMm : rec.posMm;
    shown = { x: Math.round(src[0]), y: Math.round(src[1]), rot: Math.round(Number(rec?.rotDeg ?? 0)) };
  }
  const shownRef = useRef(null);
  shownRef.current = shown;

  // 크기 칸 — **정본은 배치안의 `opts`** 다. 아직 안 건드린 치수는 팩토리 기본값이라
  // 여기서 알 길이 없다. 그래서 `parts.js` 를 불러 재보는 대신 **비워 두지 않고**
  // 첫 편집 때 배치안에 박히게 한다 (`SIZE_RANGE` 안의 값이면 무엇이든 유효하다).
  const rec = picked ? [...(layout.props ?? []), ...(layout.stations ?? [])]
    .find((o) => o.id === picked.id) : null;
  const sizeKeys = (!picked?.live && rec && SIZE_MM[rec.type ?? rec.prop]) || [];
  const measured = sizeKeys.length ? sizeMmOf(rec.type ?? rec.prop, rec.opts ?? {}) : null;
  // 아직 안 건드린 치수는 `opts` 에 없다 — **잰 값을 보여준다.** 빈 칸을 보여주면
  // 지금 몇인지 모르는 채로 숫자를 넣게 된다.
  const sizeOf = (k) => rec?.opts?.[k]
    ?? (SIZE_AXIS[k] && measured ? measured[SIZE_AXIS[k]] : '');
  // 사용법 안내는 한 번 닫으면 안 돌아온다. **사파리 프라이빗에서 던진다** — 삼키고 계속 돈다
  const [hintOff, setHintOff] = useState(() => {
    try { return localStorage.getItem('fr5.hint.layout') === '1'; } catch { return false; }
  });
  const closeHint = useCallback(() => {
    setHintOff(true);
    try { localStorage.setItem('fr5.hint.layout', '1'); } catch { /* 저장 못 해도 이번 세션은 닫힌다 */ }
  }, []);
  // **물건을 골랐다는 건 안내를 읽었다는 뜻이다.** 안내를 접어 자리를 비운다 —
  // 폰에서는 안내와 선택 패널이 같은 아래쪽 자리를 쓴다 (실렌더로 겹침 확인).
  useEffect(() => { if (picked) closeHint(); }, [picked, closeHint]);

  // 콜백을 ref 로 잡아둔다 — 부모가 새 함수를 넘겨도 무대를 다시 만들지 않기 위해서다
  const cbRef = useRef({ onReport, onCommit, onPickId });
  cbRef.current = { onReport, onCommit, onPickId };
  // 메뉴가 부르는 것들도 같은 이유로 ref 에 담는다 — 무대를 다시 만들지 않기 위해서다
  const actRef = useRef({ onDuplicate, onRemove, onUndo });
  actRef.current = { onDuplicate, onRemove, onUndo };
  // 클램프용 방 치수. **무대는 한 번만 만드는데 방은 씬마다 바뀐다** — 그래서 ref 다
  const boundsRef = useRef(boundsMm);
  boundsRef.current = boundsMm;

  const fit = useCallback(() => {
    if (stageRef.current && viewRef.current) stageRef.current.frame(viewRef.current.contents);
  }, []);

  // 숫자칸이 낸 값을 끌어놓기와 **같은 문으로** 보낸다 — 저장·되돌리기가 한 곳에서만 쌓인다.
  //
  // 함정 둘을 여기서 막는다 (둘 다 실렌더가 잡았다) —
  //   ① `picked` 를 같이 고치면 그게 또 하나의 정본이 되어, 되돌리기로 배치안이
  //      돌아가도 **패널만 옛 값**을 들고 있는다
  //   ② 그렇다고 `picked` 를 그대로 보내면 회전만 바꿔도 **고른 순간의 좌표**가 같이 실려
  //      위치가 옛날로 되돌아간다. 그래서 **지금 보이는 값**(`shown`)을 바탕으로 보낸다
  const commitField = useCallback((patch) => {
    const s = shownRef.current;
    cbRef.current.onCommit?.({
      ...pickedRef.current, posMm: [s.x, s.y], rotDeg: s.rot, ...patch,
    });
  }, []);

  // ① 무대 — 마운트에 한 번. **카메라가 여기 산다.**
  useEffect(() => {
    const stage = createStage(hostRef.current);
    stageRef.current = stage;
    // 궤도를 돌리면 숨는 벽이 바뀐다 — 매 프레임 판정한다
    stage.onTick(() => viewRef.current?.updateCutaway(stage.camera));

    // 편집. 고르고 끌고 R 로 돌린다. **pickRoot 는 매번 현재 내용물을 본다** —
    // 내용물이 갈려도 인터랙션은 그대로 산다 (무대와 수명이 같다).
    const edit = createInteraction({
      renderer: stage.renderer,
      camera: stage.camera,
      scene: stage.scene,
      controls: stage.controls,
      pickRoot: () => viewRef.current?.contents,
      gridMm: 100,
      onPick: (it) => { setPicked(it); cbRef.current.onPickId?.(it?.id ?? null); },
      onMenu: setMenu,
      bounds: () => boundsRef.current,
      onCommit: (item) => {
        // 끌기가 끝났으니 **미리보기 모드를 끈다.** 안 끄면 `shown` 이 계속 손끝 좌표를 보고
        // 있어서 되돌리기를 해도 패널이 놓은 자리에 얼어붙는다 (배포본 실렌더에서 확인)
        setPicked((p) => (p?.live ? { ...p, live: false } : p));
        cbRef.current.onCommit?.(item);
      },
    });
    editRef.current = edit;

    // **dispose 를 반드시 부른다** — 탭을 왕복하면 WebGL 컨텍스트가 쌓여 브라우저가 막는다
    return () => {
      edit.dispose();
      armObj?.removeFromParent();
      viewRef.current?.dispose();
      viewRef.current = null;
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  // ② 내용물 — 배치안이 바뀔 때만. **시점은 안 건드린다.**
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // 새로 만들기 **전에** 무엇이 골라져 있었는지 적어 둔다 — 아래에서 id 로 다시 잡는다
    const keepIds = editRef.current?.selectedIds?.() ?? [];
    const keepPrimary = pickedRef.current?.id ?? null;
    if (viewRef.current) {
      // **팔을 먼저 떼어낸다** — `dispose()` 가 트리의 지오메트리를 지운다.
      // `.then()` 으로 떼면 마이크로태스크라 dispose **뒤에** 돌아 팔이 빈 껍데기가 된다.
      armObj?.removeFromParent();
      stage.scene.remove(viewRef.current.root);
      viewRef.current.dispose();
    }
    const view = createLayoutView(layout);
    viewRef.current = view;
    stage.scene.add(view.root);
    editRef.current?.reselect?.(keepIds, keepPrimary);
    // 팔은 `armSlot` 에 붙는다 — 베이스 좌표·요각이 이미 걸려 있다 (D56 이후 주인님 요청).
    getArm().then((arm) => { if (arm && viewRef.current === view) view.armSlot.add(arm); });
    // 헤드리스 검증용 노출 — `LayoutEditor` 의 `window.__fr5edit` 와 같은 방식이다
    window.__fr5view = () => {
      let lines = 0; let amrs = 0; let robot = 0; let items = 0;
      view.root.traverse((o) => {
        if (o.isLine) lines += 1;
        if (o.userData?.item) { items += 1; if (o.userData.item.kind === 'amr') amrs += 1; }
        if (o.isMesh && o.parent && !o.userData?.item) robot += 0;
      });
      let tris = 0;
      view.armSlot.traverse((o) => {
        if (!o.isMesh) return;
        robot += 1;
        const g = o.geometry;
        tris += g?.index ? g.index.count / 3 : (g?.attributes?.position?.count ?? 0) / 3;
      });
      // 편집 단위마다 **화면 좌표**를 같이 낸다 — 헤드리스에서 실제로 눌러 보기 위해서다.
      // 좌표만 보고 넘기면 링이 어디 뜨는지·골라지는지를 영영 확인 못 한다.
      const cam = stageRef.current?.camera;
      const el = stageRef.current?.renderer?.domElement;
      const at = {};
      if (cam && el) {
        const r = el.getBoundingClientRect();
        const v = new THREE.Vector3();
        const bb = new THREE.Box3();
        view.contents.traverse((o) => {
          const it = o.userData?.item;
          if (!it) return;
          // **원점이 아니라 상자 가운데.** 문·창 그룹은 원점이 (0,0,0) 이다 (링과 같은 계산)
          bb.setFromObject(o).getCenter(v);
          v.project(cam);
          at[it.id] = [
            Math.round(r.left + ((v.x + 1) / 2) * r.width),
            Math.round(r.top + ((1 - v.y) / 2) * r.height),
          ];
        });
      }
      const ring = stageRef.current?.scene?.children?.find(
        (c) => c.isGroup && c.children?.[0]?.isLineLoop && c.visible,
      );
      const ol = ring?.children?.[0];
      return { lines, amrs, items, armMeshes: robot, armTris: Math.round(tris),
        armSlotKids: view.armSlot.children.map((c) => c.name || c.type),
        at,
        ring: ring ? { x: +ring.position.x.toFixed(2), z: +ring.position.z.toFixed(2),
          w: +ol.scale.x.toFixed(2), d: +ol.scale.z.toFixed(2) } : null };
    };
    if (framedRef.current !== layout.id) { stage.frame(view.contents); framedRef.current = layout.id; }
    cbRef.current.onReport?.(view.report());
  }, [layout]);

  return (
    <div className="view3d">
      <div ref={hostRef} className="view3d-host" />
      <div className="view3d-tools">
        <button type="button" onClick={fit}>시점 맞추기</button>
        {/* **폰에는 키보드가 없다.** R 키와 같은 걸 부르는 버튼을 같이 둔다 */}
        <button type="button" onClick={() => editRef.current?.rotate()} disabled={!picked}>90° 회전</button>
      </div>
      {/* **처음 한 번만.** 항상 떠 있으면 3D 를 계속 가린다 (2026-07-31 감사 P2).
          폰·데스크톱 문구를 하나로 합쳤다 — 회전은 위 버튼이 이미 알려준다 */}
      {!hintOff && (
        <div className="view3d-hint">
          <span>물건을 끌어서 옮겨보세요<br />100mm 격자에 붙어요 · <b>우클릭</b>하면 복제·회전·삭제가 나와요</span>
          <button type="button" onClick={closeHint} aria-label="안내 닫기">✕</button>
        </div>
      )}
      {/* 우클릭 메뉴. **화면 밖으로 안 나가게** 오른쪽·아래를 잘라 붙인다 */}
      {menu && (
        <ul
          className="view3d-menu"
          style={{
            left: Math.min(menu.x, (hostRef.current?.clientWidth ?? 0) - 150),
            top: Math.min(menu.y, (hostRef.current?.clientHeight ?? 0) - 140),
          }}
          onPointerLeave={() => setMenu(null)}
        >
          <li className="view3d-menu-head">{menu.item.name ?? menu.item.type ?? menu.item.id}</li>
          {MENU.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={m.danger ? 'danger' : undefined}
                disabled={m.id === 'undo' && !canUndo}
                onClick={() => {
                  const id = menu.item.id;
                  setMenu(null);
                  if (m.id === 'dup') actRef.current.onDuplicate?.(id);
                  if (m.id === 'rot') editRef.current?.rotate();
                  if (m.id === 'undo') actRef.current.onUndo?.();
                  if (m.id === 'del') actRef.current.onRemove?.(id);
                }}
              >
                <span>{m.label}</span><kbd>{m.key}</kbd>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <div className="view3d-pick">
          <b>{picked.name ?? picked.id}</b>
          <span className="dim">{picked.kind === 'station' ? '스테이션' : picked.type}</span>
          {picked.count > 1 && <span className="dim">{picked.count}개 선택</span>}
          {shown && (
            <>
              {/* 범위는 **방 치수에서 온다** — 매직넘버를 여기 박지 않는다 */}
              <NumBox
                label="x" value={shown.x} min={0} max={layout.floor.widthMm} step={100}
                onCommit={(v) => commitField({ posMm: [v, shown.y] })}
              />
              <NumBox
                label="y" value={shown.y} min={0} max={layout.floor.depthMm} step={100}
                onCommit={(v) => commitField({ posMm: [shown.x, v] })}
              />
              {/* **90° 단위만 받는다** — 벽에 붙이는 가구라 자유 각도는 쓸 일이 없고
                  `interaction.js` 의 회전도 같은 전제 위에 있다 */}
              <NumBox
                label="회전" value={shown.rot} min={-270} max={270} step={90}
                onCommit={(v) => commitField({ rotDeg: v })}
              />
              <span className="dim">mm · °</span>
            </>
          )}
          {/* **크기.** 부품마다 인자 이름이 달라 `catalog.js` 가 무엇을 보여줄지 정한다 */}
          {sizeKeys.map((k) => (
            <NumBox
              key={k} label={SIZE_LABEL[k]} value={sizeOf(k)}
              min={SIZE_RANGE_MM.min} max={SIZE_RANGE_MM.max} step={SIZE_RANGE_MM.step}
              onCommit={(v) => commitField({ opts: { [k]: v } })}
            />
          ))}
          {/* **좌표가 아니라 틈이 알고 싶은 값이다** — 벽·이웃까지 몇 mm 남았나 */}
          {picked.gapsMm && (picked.gapsMm.xMm !== null || picked.gapsMm.zMm !== null) && (
            <span className="gap">
              틈 {[picked.gapsMm.xMm, picked.gapsMm.zMm]
                .filter((v) => v !== null).join(' · ')}mm
            </span>
          )}
        </div>
      )}
    </div>
  );
}
