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
import { createStage } from '@fr5/shared/view3d/lab/stage.js';
import { createLayoutView } from '@fr5/shared/view3d/lab/layout-view.js';
import { createInteraction } from '@fr5/shared/view3d/lab/interaction.js';

export function LayoutView({ layout, onReport, onCommit }) {
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const editRef = useRef(null);
  const viewRef = useRef(null);
  const framedRef = useRef(null);          // 마지막으로 시점을 맞춘 배치안 id
  const [picked, setPicked] = useState(null);

  // 콜백을 ref 로 잡아둔다 — 부모가 새 함수를 넘겨도 무대를 다시 만들지 않기 위해서다
  const cbRef = useRef({ onReport, onCommit });
  cbRef.current = { onReport, onCommit };

  const fit = useCallback(() => {
    if (stageRef.current && viewRef.current) stageRef.current.frame(viewRef.current.contents);
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
      onPick: setPicked,
      onCommit: (item) => cbRef.current.onCommit?.(item),
    });
    editRef.current = edit;

    // **dispose 를 반드시 부른다** — 탭을 왕복하면 WebGL 컨텍스트가 쌓여 브라우저가 막는다
    return () => {
      edit.dispose();
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
    if (viewRef.current) { stage.scene.remove(viewRef.current.root); viewRef.current.dispose(); }
    // **FR5 로봇을 안 붙인다.** 지금은 실험실 공간 자체를 보는 화면이다 —
    // 로봇을 얹으면 URDF·STL 10MB 를 받아야 하고, 공간 판단에 방해가 된다.
    // 도달 범위 링은 남긴다. **그게 배치 판정의 근거**라 로봇 모형과 별개다.
    const view = createLayoutView(layout);
    viewRef.current = view;
    stage.scene.add(view.root);
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
      <div className="view3d-hint">
        <span className="wide">클릭해 고르고 · 끌어서 옮기고 · <kbd>R</kbd> 로 90° 회전 · 100mm 격자에 붙는다</span>
        <span className="narrow">눌러 고르고 · 끌어서 옮긴다 · 100mm 격자</span>
      </div>
      {picked && (
        <div className="view3d-pick">
          <b>{picked.name ?? picked.id}</b>
          <span className="dim">{picked.kind === 'station' ? '스테이션' : picked.type}</span>
          {picked.posMm && (
            <span className="num">
              x {Math.round(picked.posMm[0])} · y {Math.round(picked.posMm[1])} mm
            </span>
          )}
        </div>
      )}
    </div>
  );
}
