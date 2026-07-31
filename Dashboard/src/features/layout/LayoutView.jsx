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

export function LayoutView({ layout, onReport, onCommit }) {
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const editRef = useRef(null);
  const viewRef = useRef(null);
  const framedRef = useRef(null);          // 마지막으로 시점을 맞춘 배치안 id
  const [picked, setPicked] = useState(null);
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
  const cbRef = useRef({ onReport, onCommit });
  cbRef.current = { onReport, onCommit };

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
      onPick: setPicked,
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
      {/* **처음 한 번만.** 항상 떠 있으면 3D 를 계속 가린다 (2026-07-31 감사 P2).
          폰·데스크톱 문구를 하나로 합쳤다 — 회전은 위 버튼이 이미 알려준다 */}
      {!hintOff && (
        <div className="view3d-hint">
          <span>물건을 끌어서 옮겨보세요<br />100mm 격자에 붙고, 빈 곳을 누르면 선택이 풀려요</span>
          <button type="button" onClick={closeHint} aria-label="안내 닫기">✕</button>
        </div>
      )}
      {picked && (
        <div className="view3d-pick">
          <b>{picked.name ?? picked.id}</b>
          <span className="dim">{picked.kind === 'station' ? '스테이션' : picked.type}</span>
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
        </div>
      )}
    </div>
  );
}
