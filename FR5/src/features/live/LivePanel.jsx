// Live 패널 — 3D 쌍둥이 · 6축/TCP 현재값 · 연결 진단 (FR5-IMPLEMENTATION-PLAN §화면 1).
// 슬롯 편집·장기 그래프는 여기 넣지 않는다. P1 은 읽기 전용 — 조그·정지는 P2 에서.
import { useEffect, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';
import { RobotTwin } from './RobotTwin.jsx';

const JOINT_LABELS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'];
const TCP_LABELS = ['x mm', 'y mm', 'z mm', 'rx °', 'ry °', 'rz °'];

export function LivePanel({ state }) {
  const [robots, setRobots] = useState([]);
  const [picked, setPicked] = useState('');
  const [version, setVersion] = useState(null);
  const [lastRefusal, setLastRefusal] = useState(null);   // fail-closed 사유는 사람이 읽는다 (D40)
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    datasource.getRobots().then((list) => {
      setRobots(list);
      setPicked((p) => p || list[0]?.robotId || '');
    });
  }, []);
  useEffect(() => {
    if (state.connected) datasource.getVersion().then((v) => v.ok !== false && setVersion(v));
    else setVersion(null);
  }, [state.connected]);

  const doConnect = async () => {
    setBusy(true);
    const res = await datasource.connect(picked);
    setLastRefusal(res.ok ? null : (res.reasons || []).join(' · '));
    setBusy(false);
  };
  const doDisconnect = async () => {
    setBusy(true);
    await datasource.disconnect();
    setLastRefusal(null);
    setBusy(false);
  };

  return (
    <div className="live">
      <RobotTwin jointsDeg={state.jointsDeg ?? [0, 0, 0, 0, 0, 0]} />
      <aside>
        <section className="card diag">
          <h2>연결 진단</h2>
          <label>로봇 프로필
            <select value={picked} disabled={state.connected || busy}
              onChange={(e) => setPicked(e.target.value)}>
              {robots.map((r) => (
                <option key={r.robotId} value={r.robotId}>{r.name} · {r.endpoint}</option>
              ))}
            </select>
          </label>
          {state.connected
            ? <button type="button" onClick={doDisconnect} disabled={busy}>연결 해제</button>
            : <button type="button" className="primary" onClick={doConnect} disabled={busy || !picked}>
                observe-only 연결
              </button>}
          {lastRefusal && <p className="refusal">거부됨 — {lastRefusal}</p>}
          {state.phase === 'FAIL_CLOSED' && state.failReason
            && <p className="refusal">FAIL_CLOSED — {state.failReason}</p>}
          <dl>
            <dt>WS 재연결</dt><dd className="ws-reconnects">{datasource.wsReconnects()}회</dd>
            {version && <>
              <dt>컨트롤러</dt><dd>{version.controller}</dd>
              <dt>서보</dt><dd>{version.servo}</dd>
              <dt>SDK</dt><dd>{version.sdk}</dd>
            </>}
          </dl>
        </section>
        <section className="card">
          <h2>관절 (°)</h2>
          <table className="joints"><tbody>
            {JOINT_LABELS.map((name, i) => (
              <tr key={name}><th>{name}</th>
                <td>{state.connected ? state.jointsDeg[i].toFixed(3) : '—'}</td></tr>
            ))}
          </tbody></table>
        </section>
        <section className="card">
          <h2>TCP (mm·°)</h2>
          <table className="tcp"><tbody>
            {TCP_LABELS.map((name, i) => (
              <tr key={name}><th>{name}</th>
                <td>{state.connected ? state.tcpMmDeg[i].toFixed(3) : '—'}</td></tr>
            ))}
          </tbody></table>
        </section>
      </aside>
    </div>
  );
}
