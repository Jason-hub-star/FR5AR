// 기록 탭 — 실험 run 목록 + 필터. 선택하면 RunDetail 이 우측에 뜬다.
import { useEffect, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';
import { RunDetail } from './RunDetail.jsx';

function fmtDur(run) {
  if (!run.endedAt) return '진행 중';
  const s = Math.round(run.endedAt - run.startedAt);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function RunList() {
  const [runs, setRuns] = useState([]);
  const [robotFilter, setRobotFilter] = useState('');
  const [slotFilter, setSlotFilter] = useState('');
  const [pickedId, setPickedId] = useState(null);

  const reload = () => datasource.getRuns().then(setRuns);
  useEffect(() => { reload(); }, []);

  const robotOptions = [...new Set(runs.map((r) => r.robot))];
  const slotOptions = [...new Set(runs.map((r) => r.scriptSlot))];
  const shown = runs
    .filter((r) => !robotFilter || r.robot === robotFilter)
    .filter((r) => !slotFilter || r.scriptSlot === slotFilter);

  return (
    <div className="pane runs">
      <div className="runs-toolbar">
        <h2>실험 기록</h2>
        <select value={robotFilter} onChange={(e) => setRobotFilter(e.target.value)}>
          <option value="">모든 로봇</option>
          {robotOptions.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select value={slotFilter} onChange={(e) => setSlotFilter(e.target.value)}>
          <option value="">모든 스크립트</option>
          {slotOptions.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="dim">총 {shown.length}건 · 최신순</span>
        <button type="button" onClick={reload}>↻ 새로고침</button>
      </div>

      <div className="runs-body">
        <table className="runs-table">
          <thead>
            <tr><th>ID</th><th>로봇</th><th>맵</th><th>스크립트</th><th>소요</th><th>result</th><th>bag</th></tr>
          </thead>
          <tbody>
            {shown.map((run) => (
              <tr key={run.id} aria-selected={pickedId === run.id} onClick={() => setPickedId(run.id)}>
                <td className="mono">{run.id}</td>
                <td>{run.robot}</td>
                <td>{run.mapSlot ?? '—'}</td>
                <td>{run.scriptSlot}</td>
                <td className="mono">{fmtDur(run)}</td>
                <td><span className={`badge result-${run.result}`}>{run.result ?? '진행'}</span></td>
                <td>{run.bagPath ? '▣' : '—'}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan="7" className="dim">기록이 없어요</td></tr>}
          </tbody>
        </table>

        {pickedId && <RunDetail runId={pickedId} onSaved={reload} />}
      </div>
    </div>
  );
}
