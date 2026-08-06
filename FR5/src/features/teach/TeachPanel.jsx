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
// 쌍둥이는 `main.jsx` 가 들고 있다 (계획 §레이아웃). 이 패널은 **무엇을 그릴지만 올려보낸다** —
// 되감기·미리보기 자세를 `onView` 로 넘기고, 떠날 때 비워 실물로 되돌린다.

const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : '—');

function PointList({ points, mine, armed, busy, preview, onPreview, onGoto, onDelete }) {
  // 삭제는 되돌릴 수 없고, 바로 옆이 **실기를 움직이는** 「이동」이다 (감사 2026-08-05 P0-4).
  // 그래서 한 번 더 묻는다. `window.confirm` 은 안 쓴다 — 브라우저 모달은 화면 전체를 막아
  // 실렌더 검증과 자동화가 그 자리에서 멈춘다. 확인은 그 카드 안에서 한다.
  const [asking, setAsking] = useState(null);
  if (!points.length) {
    return (
      <p className="empty" data-t="points-empty">
        아직 지점이 없다. 아래 조작대에서 자세를 만들고 캡처한다.
      </p>
    );
  }
  // **표가 아니라 카드다.** 조작대가 오른쪽 열을 나눠 쓰면서 5열 표가 340px 안에서 뭉개졌다
  // (2026-08-06 실렌더). 관절 6개는 어차피 한 줄에 안 들어가고, 눌러야 하는 것은 버튼이다.
  return (
    <ul className="points" data-t="points">
      {points.map((p) => (
        <li key={p.name} className="pointcard" data-t="point-row" data-name={p.name}
          aria-selected={preview === p.name}>
          <div className="cardhead">
            <b>{p.name}</b>
            <span className="mm">tool{p.toolId}/user{p.userId}
              {p.gripperPct == null ? '' : ` · 그리퍼 ${p.gripperPct}%`}</span>
          </div>
          <p className="mono">{(p.jointsDeg || []).map(fmt).join(' · ')}</p>
          {asking === p.name ? (
            <div className="askdelete" data-t="point-delete-ask">
              <p>{p.name} 을 지우면 되돌릴 수 없다.</p>
              <div className="rowbtns">
                <button type="button" data-t="point-delete-cancel"
                  onClick={() => setAsking(null)}>취소</button>
                <button type="button" className="danger" data-t="point-delete-confirm"
                  disabled={!mine || busy}
                  onClick={() => { setAsking(null); onDelete(p.name); }}>지운다</button>
              </div>
            </div>
          ) : (
            <div className="rowbtns">
              {/* 미리보기는 **로봇에 아무것도 안 보낸다** — 어디로 갈지 화면에서 먼저 본다 */}
              <button type="button" data-t="point-preview"
                onClick={() => onPreview(preview === p.name ? null : p.name)}>
                {preview === p.name ? '미리보기 끄기' : '미리보기'}
              </button>
              <button type="button" data-t="point-goto" disabled={!mine || !armed || busy}
                title={!mine ? '조종권을 잡아야 한다' : !armed ? 'ARM 이 먼저다' : ''}
                onClick={() => onGoto(p.name)}>이동</button>
              <button type="button" data-t="point-delete" disabled={!mine || busy}
                onClick={() => setAsking(p.name)}>삭제</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function TrajectoryList({ items, playing, onPlay }) {
  if (!items.length) return <p className="empty" data-t="trajs-empty">아직 궤적이 없다</p>;
  return (
    <ul className="trajs" data-t="trajs">
      {items.map((t) => (
        <li key={t.name} className="pointcard" data-t="traj-row" data-name={t.name}
          /* 조건이 어긋난 측정본은 비교에서 빠진다 — 화면이 그 이유를 말한다 (D74) */
          data-usable={String(t.purpose !== 'measure'
            || (t.dropped === 0 && t.endReason === 'done'))}>
          <div className="cardhead">
            <b>{t.name}</b>
            <span className="mm">{fmt(t.durationSec)}s / {t.fps}fps</span>
          </div>
          <p className="mm">{t.source} · {t.purpose} · {t.endReason} · 결손 {t.dropped}</p>
          <div className="rowbtns">
            <button type="button" data-t="traj-play" onClick={() => onPlay(t.name)}>
              {playing === t.name ? '다시' : '되감기'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TeachPanel({ state, who, onView }) {
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
  // 그리는 것은 `main.jsx` 라 여기서는 올려보내기만 한다. 파생 객체(`previewPoint`)를 deps 에
  // 넣으면 매 렌더마다 새 객체라 무한 루프가 되므로, 원시값(`preview`)과 `points` 로 건다.
  useEffect(() => {
    if (play) {
      const f = play.frames[play.i];
      onView({ jointsDeg: f?.jointsDeg, gripperPct: f?.gripperPct,
        label: `${play.name} 되감기 ${fmt(f?.tSec)}s · 실물은 안 움직인다` });
      return;
    }
    const pt = preview && points.find((p) => p.name === preview);
    onView(pt ? { jointsDeg: pt.jointsDeg, gripperPct: pt.gripperPct,
      label: `${pt.name} 로 가면 이 자세다. 아직 안 보냈다` } : null);
  }, [play, preview, points, onView]);
  // 탭을 떠나면 실물로 되돌린다 — 미리보기 자세가 다른 화면까지 따라가면 위치를 오판한다
  useEffect(() => () => onView(null), [onView]);

  const usable = useMemo(
    () => trajs.filter((t) => t.purpose === 'measure' && t.dropped === 0 && t.endReason === 'done'),
    [trajs]);

  return (
    <div className="teach" data-t="teach">
      {play && (
        <section className="scrubbox">
          <p className="mm">{play.name} 되감기 · 실물은 안 움직인다</p>
          <input type="range" data-t="play-scrub" min="0" max={play.frames.length - 1}
            value={play.i} onChange={(e) => {
              clearInterval(timer.current);
              setPlay((p) => ({ ...p, i: Number(e.target.value) }));
            }} />
        </section>
      )}

      <section data-t="teach-points">
        <h3>지점</h3>
        <p className="mm">자세 하나에 이름을 붙인다.</p>
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
        <h3>궤적</h3>
        <p className="mm">
          움직인 것을 시간축으로 적는다. 녹화는 <b>읽기만 한다.</b> 로봇에 아무것도 보내지
          않는다. 실기 재생은 Program 의 승인 관문을 탄다.
        </p>
        <div className="row">
          <input value={trajName} placeholder="이름 (예: demo-01)" data-t="traj-name"
            disabled={!!recording} onChange={(e) => setTrajName(e.target.value)} />
          <select value={purpose} data-t="traj-purpose" disabled={!!recording}
            onChange={(e) => setPurpose(e.target.value)}>
            <option value="measure">비교용 measure · 조건을 묶어 잰다</option>
            <option value="collect">학습용 collect · 일부러 바꿔가며 모은다</option>
          </select>
          {recording ? (
            <button type="button" data-t="traj-stop" disabled={busy}
              onClick={() => run(() => datasource.stopRecording(who))
                .then(() => setRecording(null))}>
              {recording} 녹화 정지
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
        {recording && <p className="refusal" data-t="traj-live">● {recording} 녹화 중</p>}
        <TrajectoryList items={trajs} playing={play?.name} onPlay={startPlay} />
        <p className="mm" data-t="traj-usable">
          비교에 쓸 수 있는 것 {usable.length} / {trajs.length}
          {trajs.length > usable.length
            && '. 나머지는 조건이 어긋났다 (measure 가 아니거나 · 결손이 있거나 · done 으로 안 끝났다)'}
        </p>
      </section>

      {note && <p className="refusal" data-t="teach-refusal"><b>거부됨</b> {note}</p>}
    </div>
  );
}
