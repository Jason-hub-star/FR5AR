// 선택한 run 상세 — 경로 미니맵 · metrics · 메모 편집 (PATCH /api/runs/{id} 대응).
import { useEffect, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';
import { MapView } from '../map/MapView.jsx';

export function RunDetail({ runId, onSaved }) {
  const [run, setRun] = useState(null);
  const [path, setPath] = useState([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    datasource.getRun(runId).then((r) => { setRun(r); setNote(r?.note ?? ''); });
    datasource.getRunPath(runId).then(setPath);
  }, [runId]);

  if (!run) return null;

  const saveNote = async () => {
    await datasource.patchRun(runId, { note });
    onSaved?.();
  };

  return (
    <aside className="run-detail">
      <div className="row">
        <h3>선택한 run</h3>
        <span className={`badge result-${run.result}`}>{run.result ?? '진행'}</span>
      </div>
      <p className="mono dim">{run.id}</p>

      <h4>주행 경로 <span className="dim">1Hz 샘플 · {run.mapSlot ?? '맵 없음'}</span></h4>
      <MapView geometry={datasource.mapGeometry} robots={{}}
               paths={[path.map((p) => [p.xMm, p.yMm])]} />
      <div className="facts">
        <span>이동 거리 <b>{run.metrics?.travelMm?.toLocaleString() ?? '—'}</b> mm</span>
        <span>출처 <b>{run.metrics?.source ?? '—'}</b></span>
        <span>bag <b>{run.bagPath ?? '—'}</b></span>
      </div>

      <h4>metrics <span className="dim">JSON · 읽기 전용</span></h4>
      <pre className="metrics-json">{JSON.stringify(run.metrics, null, 2)}</pre>

      <h4>실험 메모 <span className="dim">PATCH /api/runs/{'{id}'}</span></h4>
      <textarea rows="3" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="다음 실험을 위한 관찰을 남겨요" />
      <button type="button" className="primary" onClick={saveNote}>메모 저장</button>
    </aside>
  );
}
