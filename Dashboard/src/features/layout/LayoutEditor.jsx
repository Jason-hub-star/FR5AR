// F7 배치안 편집 — **여기가 먼저다.** 서버도 팀원 코드도 필요 없다.
//
// 지금은 **보기**까지다. 드래그 편집은 다음이다 (L1).
// 지킬 것:
//   · 배치안의 **모양을 여기서 새로 정의하지 않는다** — `Shared/data/layout` 이 SSOT.
//     그 순간 AR 과 갈라지고, 갈라져도 두 화면 다 정상으로 보인다 (D17)
//   · 좌표 원점은 **실험실 바닥**이다. 로봇 베이스가 아니다 (SR_23)

import { useCallback, useMemo, useState } from 'react';
import { EXAMPLES } from '@fr5/shared/data/layout/examples.js';
import { pathLengthMm } from '@fr5/shared/data/layout/schema.js';
import { LayoutView } from './LayoutView.jsx';

export function LayoutEditor() {
  const [id, setId] = useState('A');
  const [report, setReport] = useState(null);
  // 편집분만 따로 들고 있다가 원본 위에 얹는다 — **예시 배치안을 직접 고치지 않는다.**
  // 예시는 모듈 상수라 고치면 A/B 를 오갈 때 원래대로 못 돌아간다.
  const [edits, setEdits] = useState({});
  const onReport = useCallback((r) => setReport(r), []);

  const layout = useMemo(() => {
    const base = EXAMPLES[id];
    const e = edits[id];
    if (!e) return base;
    const apply = (arr) => (arr ?? []).map((x) => (e[x.id] ? { ...x, ...e[x.id] } : x));
    return { ...base, props: apply(base.props), stations: apply(base.stations) };
  }, [id, edits]);

  // 끌어놓기가 끝나면 여기로 온다. 좌표는 mm · 바닥 원점 기준이다 (SR_23).
  const onCommit = useCallback((item) => {
    setEdits((prev) => {
      const cur = prev[id]?.[item.id] ?? {};
      const next = { ...cur };
      if (item.posMm) {
        // 스테이션은 [x,y,z], 부품은 [x,y] — z(높이)는 건드리지 않는다
        next.posMm = [item.posMm[0], item.posMm[1], cur.posMm?.[2] ?? undefined]
          .filter((v) => v !== undefined);
      }
      if (item.rotDeg !== undefined) next.rotDeg = item.rotDeg;
      return { ...prev, [id]: { ...prev[id], [item.id]: next } };
    });
  }, [id]);
  const dirty = Object.keys(edits[id] ?? {}).length;

  const out = report?.reach?.filter((r) => !r.inReach) ?? [];

  return (
    <section className="pane">
      <div className="pane-head">
        <h2>배치안 편집</h2>
        {dirty > 0 && (
          <button type="button" className="revert" onClick={() => setEdits((p) => ({ ...p, [id]: {} }))}>
            되돌리기 ({dirty})
          </button>
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

      <div className="facts">
        <div>
          <b>도달 범위</b> {layout.arm.reachMm}mm
          {out.length === 0
            ? <span className="ok"> · 모든 스테이션이 범위 안</span>
            : <span className="danger"> · 범위 밖 {out.length}개 — {out.map((r) => r.name).join(' · ')}</span>}
        </div>
        <div>
          <b>AMR</b> {layout.amrs.length}대 ·{' '}
          {layout.amrs.map((a) => `${a.id} ${(pathLengthMm(a.waypointsMm) / 1000).toFixed(1)}m`).join(' · ')}
        </div>
        <div>
          <b>경로 교차</b>{' '}
          {report?.crossings?.length
            ? <span className="warn">{report.crossings.length}곳 — 교착이 나는 자리다</span>
            : <span className="ok">없음</span>}
        </div>
        <p className="note">
          숫자는 배치안에서 나온다. 3D 와 같은 데이터라 어긋날 수 없다.
          드래그 편집은 다음 단계(L1)다.
        </p>
      </div>
    </section>
  );
}
