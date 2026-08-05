// Teach 패널 — 지점(점)과 궤적(선)을 남긴다 (API-CONTRACT §이동 지점 · §궤적 녹화 · D74).
//
// **여기는 승인하지 않는다.** 순서를 엮고 승인해 연속 실행하는 것은 Program 이다 —
// 캡처 버튼과 승인 버튼이 한 화면에 있으면 손가락 거리 하나가 "저장" 과 "실기 연속 실행"
// 을 가른다 (D74 기각안).
//
// 안전 판정은 전부 서버가 한다. 이 화면의 disabled 는 편의지 안전장치가 아니다
// (SAFETY-RULES 제2원칙).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';
// 쌍둥이는 Live 의 소유물이 아니다 — 같은 URDF 를 되감기에도 쓴다. 한 번에 한 패널만
// 떠 있으므로 인스턴스는 여전히 하나다.
import { RobotTwin } from '../live/RobotTwin.jsx';

const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : '—');

function PointList({ points, mine, armed, busy, preview, onPreview, onGoto, onDelete }) {
  if (!points.length) {
    return <p className="empty" data-t="points-empty">아직 지점이 없다 — 조그로 자세를 만들고 캡처한다</p>;
  }
  return (
    <table className="points" data-t="points">
      <thead><tr><th>이름</th><th>관절 (°)</th><th>좌표계</th><th>그리퍼</th><th /></tr></thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.name} data-t="point-row" data-name={p.name}
            aria-selected={preview === p.name}>
            <td>{p.name}</td>
            <td className="mono">{(p.jointsDeg || []).map(fmt).join(' · ')}</td>
            <td>tool{p.toolId}/user{p.userId}</td>
            <td>{p.gripperPct == null ? '—' : `${p.gripperPct}%`}</td>
            <td className="rowbtns">
              {/* 미리보기는 **로봇에 아무것도 안 보낸다** — 어디로 갈지 화면에서 먼저 본다 */}
              <button type="button" data-t="point-preview"
                onClick={() => onPreview(preview === p.name ? null : p.name)}>
                {preview === p.name ? '미리보기 끄기' : '미리보기'}
              </button>
              <button type="button" data-t="point-goto" disabled={!mine || !armed || busy}
                title={!mine ? '조종권을 잡아야 한다' : !armed ? 'ARM 이 먼저다' : ''}
                onClick={() => onGoto(p.name)}>이동</button>
              <button type="button" data-t="point-delete" disabled={!mine || busy}
                onClick={() => onDelete(p.name)}>삭제</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrajectoryList({ items, playing, onPlay }) {
  if (!items.length) return <p className="empty" data-t="trajs-empty">아직 궤적이 없다</p>;
  return (
    <table className="trajs" data-t="trajs">
      <thead><tr><th>이름</th><th>길이</th><th>출처</th><th>목적</th><th>끝</th><th>결손</th><th /></tr></thead>
      <tbody>
        {items.map((t) => (
          <tr key={t.name} data-t="traj-row" data-name={t.name}
            /* 조건이 어긋난 측정본은 비교에서 빠진다 — 화면이 그 이유를 말한다 (D74) */
            data-usable={String(t.purpose !== 'measure'
              || (t.dropped === 0 && t.endReason === 'done'))}>
            <td>{t.name}</td>
            <td>{fmt(t.durationSec)}s <span className="mm">/ {t.fps}fps</span></td>
            <td>{t.source}</td>
            <td>{t.purpose}</td>
            <td>{t.endReason}</td>
            <td>{t.dropped}</td>
            <td><button type="button" data-t="traj-play" onClick={() => onPlay(t.name)}>
              {playing === t.name ? '다시' : '되감기'}
            </button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TeachPanel({ state, who }) {
  const [points, setPoints] = useState([]);
  const [trajs, setTrajs] = useState([]);
  const [name, setName] = useState('');
  const [trajName, setTrajName] = useState('');
  const [purpose, setPurpose] = useState('measure');
  const [recording, setRecording] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);            // 거부 사유는 사람이 읽는다 (D40)
  const [preview, setPreview] = useState(null);      // 미리보기 중인 지점 이름
  const [play, setPlay] = useState(null);            // { name, frames, i }
  const timer = useRef(null);

  const mine = !!who && state.owner === who && datasource.hasOwnerToken();
  const armed = state.phase === 'ARMED' || state.phase === 'EXECUTING';

  const reload = useCallback(async () => {
    const [ps, ts] = await Promise.all([datasource.getPoints(), datasource.getTrajectories()]);
    setPoints(Array.isArray(ps) ? ps : []);
    setTrajs(Array.isArray(ts) ? ts : []);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => () => clearInterval(timer.current), []);

  const run = async (fn) => {
    setBusy(true);
    try {
      const res = await fn();
      setNote(res?.ok === false ? (res.reasons || [res.reason || '거부됨']).join(' · ') : null);
      await reload();
      return res;
    } finally { setBusy(false); }
  };

  const startPlay = async (n) => {
    clearInterval(timer.current);
    const t = await datasource.getTrajectory(n);
    const frames = t?.frames || [];
    if (!frames.length) { setNote(`${n} 에 프레임이 없다`); return; }
    setPreview(null);
    setPlay({ name: n, frames, i: 0 });
    timer.current = setInterval(() => {
      setPlay((p) => {
        if (!p) return p;
        if (p.i + 1 >= p.frames.length) { clearInterval(timer.current); return { ...p, i: p.i }; }
        return { ...p, i: p.i + 1 };
      });
    }, Math.round(1000 / (t.fps || 30)));
  };

  // 3D 가 무엇을 그리나 — 되감기 > 미리보기 > 실물. **실물이 아닐 때는 화면이 그렇게 말한다.**
  const previewPoint = preview && points.find((p) => p.name === preview);
  const shown = play ? play.frames[play.i]
    : previewPoint ? { jointsDeg: previewPoint.jointsDeg, gripperPct: previewPoint.gripperPct }
      : { jointsDeg: state.jointsDeg, gripperPct: state.gripper?.pct };
  const live = !play && !previewPoint;

  const usable = useMemo(
    () => trajs.filter((t) => t.purpose === 'measure' && t.dropped === 0 && t.endReason === 'done'),
    [trajs]);

  return (
    <div className="teach" data-t="teach">
      <section className="twinbox">
        <RobotTwin jointsDeg={shown.jointsDeg} gripperPct={shown.gripperPct} />
        <p className="twinnote" data-t="twin-note" data-live={String(live)}>
          {play ? `되감기 — ${play.name} · ${fmt(play.frames[play.i]?.tSec)}s (실물은 안 움직인다)`
            : previewPoint ? `미리보기 — ${previewPoint.name} 로 가면 이 자세다 (아직 안 보냈다)`
              : '실물 자세'}
        </p>
        {play && (
          <input type="range" data-t="play-scrub" min="0" max={play.frames.length - 1}
            value={play.i} onChange={(e) => {
              clearInterval(timer.current);
              setPlay((p) => ({ ...p, i: Number(e.target.value) }));
            }} />
        )}
      </section>

      <section data-t="teach-points">
        <h3>지점 — 자세 하나에 이름을 붙인다</h3>
        <div className="row">
          <input value={name} placeholder="이름 (예: trayPick)" data-t="point-name"
            onChange={(e) => setName(e.target.value)} />
          {/* 값은 **서버가 읽어** 굳힌다 — 화면이 좌표를 올리지 않는다 (계약 §이동 지점) */}
          <button type="button" data-t="point-capture" disabled={!mine || busy || !name.trim()}
            title={mine ? '' : '조종권을 잡아야 한다'}
            onClick={() => run(() => datasource.capturePoint(who, name.trim()))
              .then((r) => r?.ok !== false && setName(''))}>
            현재 자세를 캡처
          </button>
        </div>
        <PointList points={points} mine={mine} armed={armed} busy={busy} preview={preview}
          onPreview={(n) => { setPlay(null); clearInterval(timer.current); setPreview(n); }}
          onGoto={(n) => run(() => datasource.gotoPoint(who, n))}
          onDelete={(n) => run(() => datasource.deletePoint(who, n))} />
      </section>

      <section data-t="teach-trajs">
        <h3>궤적 — 움직인 것을 시간축으로 적는다</h3>
        <p className="mm">
          녹화는 <b>읽기만 한다</b> — 로봇에 아무것도 보내지 않는다. 실기 재생은 Program 의
          승인 관문을 탄다.
        </p>
        <div className="row">
          <input value={trajName} placeholder="이름 (예: demo-01)" data-t="traj-name"
            disabled={!!recording} onChange={(e) => setTrajName(e.target.value)} />
          <select value={purpose} data-t="traj-purpose" disabled={!!recording}
            onChange={(e) => setPurpose(e.target.value)}>
            <option value="measure">measure — 조건을 묶어 잰다 (비교용)</option>
            <option value="collect">collect — 일부러 바꿔가며 모은다 (학습용)</option>
          </select>
          {recording ? (
            <button type="button" data-t="traj-stop" disabled={busy}
              onClick={() => run(() => datasource.stopRecording(who))
                .then(() => setRecording(null))}>
              녹화 정지 — {recording}
            </button>
          ) : (
            <button type="button" data-t="traj-start"
              disabled={!mine || busy || !trajName.trim()}
              title={mine ? '' : '조종권을 잡아야 한다'}
              onClick={() => run(() => datasource.startRecording(who, trajName.trim(), purpose))
                .then((r) => { if (r?.ok !== false) { setRecording(trajName.trim()); setTrajName(''); } })}>
              녹화 시작
            </button>
          )}
        </div>
        {recording && <p className="refusal" data-t="traj-live">● 녹화 중 — {recording}</p>}
        <TrajectoryList items={trajs} playing={play?.name} onPlay={startPlay} />
        <p className="mm" data-t="traj-usable">
          비교에 쓸 수 있는 것 {usable.length} / {trajs.length}
          {trajs.length > usable.length
            && ' — 나머지는 조건이 어긋났다 (measure 가 아니거나 · 결손이 있거나 · done 으로 안 끝났다)'}
        </p>
      </section>

      {note && <p className="refusal" data-t="teach-refusal">거부됨 — {note}</p>}
    </div>
  );
}
