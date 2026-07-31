// F7 배치안 편집 — **여기가 먼저다.** 서버도 팀원 코드도 필요 없다.
//
// 고르고 · 끌고 · 돌리고 · 되돌리고 · **이 브라우저에 저장된다** (GOAL-editor-undo-save).
// 지킬 것:
//   · 배치안의 **모양을 여기서 새로 정의하지 않는다** — `Shared/data/layout` 이 SSOT.
//     그 순간 AR 과 갈라지고, 갈라져도 두 화면 다 정상으로 보인다 (D17)
//   · 좌표 원점은 **실험실 바닥**이다. 로봇 베이스가 아니다 (SR_23)
//
// **저장의 천장** — 이 브라우저 안에서만 산다. 팀 공유·기기 간 동기화는
// `Shared/data/config/` 슬롯이 할 일이다 (이관 H 단계). 여기는 거기로 가는 발판이다.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EXAMPLES } from '@fr5/shared/data/layout/examples.js';
import { pathLengthMm } from '@fr5/shared/data/layout/schema.js';
import { LayoutView } from './LayoutView.jsx';

const KEY = 'fr5.layout.edits';
const UNDO_MAX = 50;

/**
 * 받침이 있으면 `은`, 없으면 `는`.
 *
 * **물건 이름이 배치안에서 오기 때문에 조사를 문장에 박을 수 없다** —
 * "보관 선반는" 처럼 틀린 말이 화면에 나온다 (2026-07-31 배포본에서 발견).
 * 한글 음절은 유니코드에서 `((코드-0xAC00) % 28)` 이 종성 번호라 그것만 보면 된다.
 */
function eunNeun(name) {
  const c = String(name).codePointAt(String(name).length - 1);
  if (c < 0xac00 || c > 0xd7a3) return '는';   // 한글이 아니면 무난한 쪽으로
  return (c - 0xac00) % 28 ? '은' : '는';
}

// 저장된 편집분을 읽는다. **깨져 있으면 조용히 버린다** — 편집기가 안 뜨는 것보다 낫다.
// 예시 배치안이 바뀌어 없는 id 가 남아도 안전하다: 아래 `apply` 가 있는 것만 얹는다.
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

export function LayoutEditor() {
  const [id, setId] = useState('A');
  const [report, setReport] = useState(null);
  // 편집분만 따로 들고 있다가 원본 위에 얹는다 — **예시 배치안을 직접 고치지 않는다.**
  // 예시는 모듈 상수라 고치면 A/B 를 오갈 때 원래대로 못 돌아간다.
  //
  // `past` 를 **같은 상태에 둔다.** 따로 두면 갱신 순서가 어긋나 한 번 눌렀는데
  // 두 단계가 되돌아간다. 하나로 묶으면 갱신 함수가 순수해진다.
  const [ed, setEd] = useState(() => ({ edits: load(), past: [] }));
  const { edits } = ed;
  const [saveErr, setSaveErr] = useState(false);
  const onReport = useCallback((r) => setReport(r), []);

  // 저장. **실패해도 편집은 계속된다** — 사파리 프라이빗·용량 초과에서 던진다.
  // 대신 화면에 말해준다. 조용히 실패하면 저장된 줄 알고 창을 닫는다.
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(edits)); setSaveErr(false); }
    catch { setSaveErr(true); }
  }, [edits]);

  const layout = useMemo(() => {
    const base = EXAMPLES[id];
    const e = edits[id];
    if (!e) return base;
    const apply = (arr) => (arr ?? []).map((x) => (e[x.id] ? { ...x, ...e[x.id] } : x));
    return { ...base, props: apply(base.props), stations: apply(base.stations) };
  }, [id, edits]);

  // 끌어놓기가 끝나면 여기로 온다. 좌표는 mm · 바닥 원점 기준이다 (SR_23).
  const onCommit = useCallback((item) => {
    setEd(({ edits: prev, past }) => {
      const cur = prev[id]?.[item.id] ?? {};
      const next = { ...cur };
      if (item.posMm) {
        // 스테이션은 [x,y,z], 부품은 [x,y] — z(높이)는 건드리지 않는다
        next.posMm = [item.posMm[0], item.posMm[1], cur.posMm?.[2] ?? undefined]
          .filter((v) => v !== undefined);
      }
      if (item.rotDeg !== undefined) next.rotDeg = item.rotDeg;
      return {
        edits: { ...prev, [id]: { ...prev[id], [item.id]: next } },
        past: [...past, prev].slice(-UNDO_MAX),
      };
    });
  }, [id]);

  // 한 단계 되돌리기. **전부 날리기와 다른 버튼이다** — 개수를 보여주면서
  // 하나씩 안 되돌아가면 배신이다 (2026-07-31 감사 P1)
  const undo = useCallback(() => {
    setEd(({ edits: prev, past }) =>
      (past.length ? { edits: past[past.length - 1], past: past.slice(0, -1) } : { edits: prev, past }));
  }, []);
  // 처음으로. 이것도 되돌릴 수 있어야 한다 — 잘못 눌러 다 날리면 못 쓴다
  const resetAll = useCallback(() => {
    setEd(({ edits: prev, past }) =>
      ({ edits: { ...prev, [id]: {} }, past: [...past, prev].slice(-UNDO_MAX) }));
  }, [id]);

  // 키보드. **입력칸에서는 가로채지 않는다** — 숫자를 치다 ⌘Z 를 누르면
  // 글자가 아니라 배치가 되돌아간다 (다음 골에서 입력칸이 생긴다)
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.key === 'z' || e.key === 'Z') || !(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      if (e.target?.closest?.('input, textarea, [contenteditable]')) return;
      e.preventDefault();
      undo();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [undo]);

  const dirty = Object.keys(edits[id] ?? {}).length;
  // 헤드리스 검증용 노출 — `main.jsx` 와 같은 방식이다
  useEffect(() => { window.__fr5edit = { edits, past: ed.past.length, saveErr, dirty }; });

  const out = report?.reach?.filter((r) => !r.inReach) ?? [];

  return (
    <section className="pane">
      <div className="pane-head">
        <h2>배치안 편집</h2>
        {/* **저장 상태를 화면이 말해야 한다.** 조용하면 저장된 줄 알고 창을 닫는다 */}
        {dirty > 0 && (saveErr
          ? <span className="unsaved">저장할 수 없어요 · 새로고침하면 사라져요</span>
          : <span className="saved">이 브라우저에 저장됐어요</span>)}
        {ed.past.length > 0 && (
          <button type="button" className="revert" onClick={undo}>되돌리기</button>
        )}
        {dirty > 0 && (
          <button type="button" className="revert" onClick={resetAll}>처음으로</button>
        )}
        <div className="seg">
          {Object.keys(EXAMPLES).map((k) => (
            <button key={k} type="button" aria-selected={k === id} onClick={() => setId(k)}>
              {EXAMPLES[k].name}
            </button>
          ))}
        </div>
      </div>

      <LayoutView layout={layout} onReport={onReport} onCommit={onCommit} />

      {/* 숫자줄. **해요체로 쓴다** — 여기를 읽는 사람은 개발자가 아니라 배치를 정하는 사람이다.
          "교착"·"범위 밖" 같은 말은 무슨 뜻인지 되묻게 만든다 (2026-07-31 감사 P2) */}
      <div className="facts">
        <div>
          <b>팔이 닿는 거리</b> {layout.arm.reachMm}mm
          {out.length === 0
            ? <span className="ok"> · 스테이션에 팔이 전부 닿아요</span>
            : <span className="danger">
              {' · '}{out.map((r) => r.name).join(', ')}{eunNeun(out[out.length - 1].name)} 팔이 안 닿아요
            </span>}
        </div>
        <div>
          <b>AMR 이동거리</b> {layout.amrs.length}대 ·{' '}
          {layout.amrs.map((a) => `${a.id} ${(pathLengthMm(a.waypointsMm) / 1000).toFixed(1)}m`).join(' · ')}
        </div>
        <div>
          <b>AMR 경로</b>{' '}
          {report?.crossings?.length
            ? <span className="warn">서로 막히는 곳 {report.crossings.length}군데</span>
            : <span className="ok">서로 안 부딪혀요</span>}
        </div>
      </div>
    </section>
  );
}
