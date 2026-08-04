// F7 배치안 편집 — **빈 방에서 팔레트로 짓는다.**
//
// 2026-08-04 에 모델을 바꿨다. 전에는 예시 배치안(A/B)에 편집분을 얹는 `base + patch` 였다.
// 벽만 남기고 전부 팔레트로 놓게 되면서 그 방식이 의미를 잃었다 —
// **씬이 곧 완전한 배치안**이다 (`Shared/data/layout/scenes.js`).
//
// 지킬 것:
//   · 배치안의 **모양을 여기서 새로 정의하지 않는다** — `Shared/data/layout` 이 SSOT (D17)
//   · 좌표 원점은 **실험실 바닥**이다. 로봇 베이스가 아니다 (SR_23)
//   · 부품 목록을 여기에 적지 않는다 — `catalog.js` 가 SSOT
//
// **저장의 천장** — 이 브라우저 안에서만 산다. 팀 공유는 D46(Supabase)이고 GAP 에 OPEN.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pathLengthMm } from '@fr5/shared/data/layout/schema.js';
import { mountZMm, kindOf } from '@fr5/shared/data/layout/catalog.js';
import {
  loadStore, saveStore, newScene, uniqueName, nextSceneId,
} from '@fr5/shared/data/layout/scenes.js';
import { LayoutView } from './LayoutView.jsx';
import { PartsPalette } from './PartsPalette.jsx';

const UNDO_MAX = 50;
const WALLS = [['south', '남'], ['north', '북'], ['west', '서'], ['east', '동']];

/** 받침이 있으면 `은`, 없으면 `는`. 물건 이름이 데이터에서 오므로 조사를 문장에 못 박는다. */
function eunNeun(name) {
  const c = String(name).codePointAt(String(name).length - 1);
  if (c < 0xac00 || c > 0xd7a3) return '는';
  return (c - 0xac00) % 28 ? '은' : '는';
}

/** 한 씬 안에서 안 겹치는 id. **결정적이어야** 되돌리기·저장이 안 흔들린다. */
function freshId(scene, prefix) {
  const taken = new Set([
    ...(scene.props ?? []).map((x) => x.id),
    ...(scene.doors ?? []).map((x) => x.id),
    ...(scene.windows ?? []).map((x) => x.id),
  ]);
  for (let i = 1; ; i += 1) if (!taken.has(`${prefix}-${i}`)) return `${prefix}-${i}`;
}

export function LayoutEditor() {
  const [store, setStore] = useState(loadStore);
  const [past, setPast] = useState([]);
  const [report, setReport] = useState(null);
  const [pickedId, setPickedId] = useState(null);
  const [saveErr, setSaveErr] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const nameRef = useRef(null);

  const scene = store.scenes[store.current];
  const onReport = useCallback((r) => setReport(r), []);

  // 저장. **실패해도 편집은 계속된다** — 대신 화면에 말한다.
  useEffect(() => {
    try { saveStore(store); setSaveErr(false); } catch { setSaveErr(true); }
  }, [store]);

  /** 씬 하나를 바꾼다. 되돌리기 스택은 **여기 한 곳**에서만 쌓인다. */
  const edit = useCallback((fn) => {
    setStore((prev) => {
      const cur = prev.scenes[prev.current];
      const next = fn(cur);
      if (!next || next === cur) return prev;
      setPast((p) => [...p, prev].slice(-UNDO_MAX));
      return { ...prev, scenes: { ...prev.scenes, [prev.current]: next } };
    });
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      setStore(p[p.length - 1]);
      return p.slice(0, -1);
    });
  }, []);

  // ── 배치 ───────────────────────────────────────────────────────────────
  /** 팔레트에서 고른 것을 놓는다. 소품은 방 가운데, 문·창은 **남쪽 벽 가운데**. */
  const place = useCallback((card) => {
    edit((s) => {
      const kind = kindOf(card);
      if (kind === 'prop') {
        const item = {
          id: freshId(s, card.id), type: card.id,
          posMm: [Math.round(s.floor.widthMm / 2), Math.round(s.floor.depthMm / 2), mountZMm(card)],
          rotDeg: 0, ...(card.opts ? { opts: card.opts } : {}),
        };
        return { ...s, props: [...(s.props ?? []), item] };
      }
      // 문·창은 벽에 구멍을 뚫는 것이라 좌표가 아니라 **벽 + 벽 위 위치**다
      const key = kind === 'door' ? 'doors' : 'windows';
      const item = {
        id: freshId(s, kind), wall: 'south',
        atMm: Math.round(s.floor.widthMm / 2), ...card.opts,
      };
      return { ...s, [key]: [...(s[key] ?? []), item] };
    });
  }, [edit]);

  /** 고른 것을 치운다 — 소품·문·창 어디 있든. */
  const removeItem = useCallback((itemId) => {
    if (!itemId) return;
    edit((s) => ({
      ...s,
      props: (s.props ?? []).filter((x) => x.id !== itemId),
      doors: (s.doors ?? []).filter((x) => x.id !== itemId),
      windows: (s.windows ?? []).filter((x) => x.id !== itemId),
    }));
    setPickedId(null);
  }, [edit]);

  /** 문·창 고치기 — 벽과 벽 위 위치. */
  const editOpening = useCallback((id, p) => {
    edit((s) => ({
      ...s,
      doors: (s.doors ?? []).map((x) => (x.id === id ? { ...x, ...p } : x)),
      windows: (s.windows ?? []).map((x) => (x.id === id ? { ...x, ...p } : x)),
    }));
  }, [edit]);

  /** 끌어놓기·숫자칸이 낸 값. 좌표는 mm · 바닥 원점 (SR_23). */
  const onCommit = useCallback((item) => {
    // 문·창은 벽을 따라 미끄러진 결과가 `atMm` 로 온다 (좌표가 아니다)
    if (item.atMm !== undefined && item.wall) {
      editOpening(item.id, { atMm: item.atMm });
      return;
    }
    const patch = (x) => ({
      ...x,
      ...(item.posMm ? { posMm: [item.posMm[0], item.posMm[1], x.posMm?.[2] ?? 0] } : {}),
      ...(item.rotDeg !== undefined ? { rotDeg: item.rotDeg } : {}),
    });
    edit((s) => ({
      ...s,
      props: (s.props ?? []).map((x) => (x.id === item.id ? patch(x) : x)),
      stations: (s.stations ?? []).map((x) => (x.id === item.id ? patch(x) : x)),
    }));
  }, [edit, editOpening]);

  // ── 씬 관리 ────────────────────────────────────────────────────────────
  const addScene = useCallback(() => {
    setStore((prev) => {
      const id = nextSceneId(prev.scenes);
      const s = { ...newScene(uniqueName(prev.scenes, '배치안')), id };
      setPast((p) => [...p, prev].slice(-UNDO_MAX));
      return { current: id, scenes: { ...prev.scenes, [id]: s } };
    });
    setPickedId(null);
  }, []);

  const dupScene = useCallback(() => {
    setStore((prev) => {
      const id = nextSceneId(prev.scenes);
      const src = prev.scenes[prev.current];
      const s = { ...structuredClone(src), id, name: uniqueName(prev.scenes, `${src.name} 사본`) };
      setPast((p) => [...p, prev].slice(-UNDO_MAX));
      return { current: id, scenes: { ...prev.scenes, [id]: s } };
    });
    setPickedId(null);
  }, []);

  const delScene = useCallback(() => {
    setStore((prev) => {
      const keys = Object.keys(prev.scenes);
      if (keys.length <= 1) return prev;            // 마지막 하나는 안 지운다
      const rest = { ...prev.scenes };
      delete rest[prev.current];
      setPast((p) => [...p, prev].slice(-UNDO_MAX));
      return { current: Object.keys(rest)[0], scenes: rest };
    });
    setPickedId(null);
  }, []);

  const rename = useCallback((name) => {
    const n = String(name).trim();
    if (!n) return;
    setStore((prev) => ({
      ...prev,
      scenes: { ...prev.scenes, [prev.current]: { ...prev.scenes[prev.current], name: n } },
    }));
  }, []);

  // 키보드. **입력칸에서는 가로채지 않는다** — 이름을 치다 Delete 를 누르면 배치가 사라진다
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
      if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault(); undo(); return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && pickedId) {
        e.preventDefault(); removeItem(pickedId);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [undo, removeItem, pickedId]);

  useEffect(() => { if (renaming) nameRef.current?.select(); }, [renaming]);

  const opening = useMemo(
    () => [...(scene.doors ?? []), ...(scene.windows ?? [])].find((x) => x.id === pickedId),
    [scene, pickedId],
  );
  const isDoor = !!(scene.doors ?? []).find((x) => x.id === pickedId);

  // 헤드리스 검증용 노출 — `main.jsx` 와 같은 방식이다
  useEffect(() => {
    window.__fr5edit = {
      scenes: Object.keys(store.scenes).length, current: store.current, name: scene.name,
      props: scene.props?.length ?? 0, doors: scene.doors?.length ?? 0,
      windows: scene.windows?.length ?? 0, past: past.length, saveErr, pickedId,
    };
  });

  const out = report?.reach?.filter((r) => !r.inReach) ?? [];
  const total = (scene.props?.length ?? 0) + (scene.doors?.length ?? 0) + (scene.windows?.length ?? 0);

  return (
    <section className="pane">
      <div className="pane-head">
        <h2>배치안 편집</h2>

        {/* 씬 드롭다운 — 저장된 배치안을 오간다. 저장은 자동이다 */}
        <select
          className="scene-pick"
          value={store.current}
          onChange={(e) => { setStore((p) => ({ ...p, current: e.target.value })); setPickedId(null); }}
          aria-label="배치안 고르기"
        >
          {Object.values(store.scenes).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {renaming
          ? (
            <input
              ref={nameRef} className="scene-name" defaultValue={scene.name}
              onBlur={(e) => { rename(e.target.value); setRenaming(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { rename(e.currentTarget.value); setRenaming(false); }
                if (e.key === 'Escape') setRenaming(false);
              }}
            />
          )
          : <button type="button" className="revert" onClick={() => setRenaming(true)}>이름</button>}
        <button type="button" className="revert" onClick={addScene}>새로</button>
        <button type="button" className="revert" onClick={dupScene}>복제</button>
        {Object.keys(store.scenes).length > 1 && (
          <button type="button" className="revert" onClick={delScene}>삭제</button>
        )}

        <span className={saveErr ? 'unsaved' : 'saved'}>
          {saveErr ? '저장할 수 없어요 · 새로고침하면 사라져요' : '이 브라우저에 저장돼요'}
        </span>
        {past.length > 0 && <button type="button" className="revert" onClick={undo}>되돌리기</button>}
        {pickedId && (
          <button type="button" className="revert" onClick={() => removeItem(pickedId)}>
            치우기 <kbd>Del</kbd>
          </button>
        )}
      </div>

      <div className="editor-body">
        <PartsPalette onPlace={place} count={total} />
        <div className="editor-stage">
          <LayoutView
            layout={scene}
            onReport={onReport}
            onCommit={onCommit}
            onPickId={setPickedId}
          />
          {/* 문·창은 끌 수 없다 — 벽에 뚫린 구멍이라 **어느 벽 · 벽 위 위치**로 고친다 */}
          {opening && (
            <div className="opening-edit">
              <b>{isDoor ? '문' : '창'}</b>
              <label>
                벽
                <select
                  value={opening.wall}
                  onChange={(e) => editOpening(opening.id, { wall: e.target.value })}
                >
                  {WALLS.map(([w, l]) => <option key={w} value={w}>{l}</option>)}
                </select>
              </label>
              <label>
                위치
                <input
                  type="number" step="100" value={opening.atMm}
                  onChange={(e) => editOpening(opening.id, { atMm: Number(e.target.value) })}
                />
                mm
              </label>
              <label>
                폭
                <input
                  type="number" step="100" min="400" value={opening.widthMm}
                  onChange={(e) => editOpening(opening.id, { widthMm: Number(e.target.value) })}
                />
                mm
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 숫자줄. **해요체로 쓴다** — 읽는 사람은 개발자가 아니라 배치를 정하는 사람이다 */}
      <div className="facts">
        <div>
          <b>팔이 닿는 거리</b> {scene.arm.reachMm}mm
          {(scene.stations?.length ?? 0) === 0
            ? <span className="mute"> · 스테이션이 아직 없어요</span>
            : out.length === 0
              ? <span className="ok"> · 스테이션에 팔이 전부 닿아요</span>
              : (
                <span className="danger">
                  {' · '}{out.map((r) => r.name).join(', ')}
                  {eunNeun(out[out.length - 1].name)} 팔이 안 닿아요
                </span>
              )}
        </div>
        <div>
          <b>AMR 이동거리</b> {scene.amrs?.length ?? 0}대
          {(scene.amrs ?? []).length > 0 && ` · ${scene.amrs
            .map((a) => `${a.id} ${(pathLengthMm(a.waypointsMm) / 1000).toFixed(1)}m`).join(' · ')}`}
        </div>
        <div>
          <b>놓인 것</b> 소품 {scene.props?.length ?? 0} · 문 {scene.doors?.length ?? 0}
          {' · '}창 {scene.windows?.length ?? 0}
        </div>
      </div>
    </section>
  );
}
