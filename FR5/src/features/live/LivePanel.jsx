// Live 패널 — 3D 쌍둥이 · 6축/TCP 현재값 · 연결 진단 · 조종권/jog (FR5-IMPLEMENTATION-PLAN §화면 1).
// 슬롯 편집·장기 그래프는 여기 넣지 않는다. 안전 판정은 전부 서버가 한다 —
// 이 화면의 disabled 는 편의지 안전장치가 아니다 (SAFETY-RULES 제2원칙).
import { useEffect, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';
import { RobotTwin } from './RobotTwin.jsx';

const JOINT_LABELS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'];
const TCP_LABELS = ['x mm', 'y mm', 'z mm', 'rx °', 'ry °', 'rz °'];
const JOG_STEP_DEG = 1.0;

export function LivePanel({ state, who }) {
  const [robots, setRobots] = useState([]);
  const [picked, setPicked] = useState('');
  const [version, setVersion] = useState(null);
  const [lastRefusal, setLastRefusal] = useState(null);   // fail-closed 사유는 사람이 읽는다 (D40)
  const [busy, setBusy] = useState(false);
  const [siteConfirmed, setSiteConfirmed] = useState(false);

  useEffect(() => {
    datasource.getRobots().then((list) => {
      setRobots(list);
      setPicked((p) => p || list[0]?.robotId || '');
    });
  }, []);
  useEffect(() => datasource.subscribeRefusals(setLastRefusal), []);
  useEffect(() => {
    if (state.connected) datasource.getVersion().then((v) => v.ok !== false && setVersion(v));
    else setVersion(null);
  }, [state.connected]);

  const run = async (fn) => {
    setBusy(true);
    const res = await fn();
    setLastRefusal(res?.ok === false ? (res.reasons || [res.reason || '거부됨']).join(' · ') : null);
    setBusy(false);
  };

  const mine = who && state.owner === who;
  const armed = state.phase === 'ARMED' || state.phase === 'EXECUTING';

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
            ? <button type="button" onClick={() => run(() => datasource.disconnect(who))} disabled={busy}>연결 해제</button>
            : <button type="button" className="primary" onClick={() => run(() => datasource.connect(picked))}
                disabled={busy || !picked}>
                observe-only 연결
              </button>}
          {lastRefusal && <p className="refusal">거부됨 — {lastRefusal}</p>}
          {state.phase === 'FAIL_CLOSED' && state.failReason
            && <p className="refusal">FAIL_CLOSED — {state.failReason}</p>}
          <dl>
            <dt>WS 재연결</dt><dd className="ws-reconnects">{datasource.wsReconnects()}회</dd>
            {version && <>
              <dt>SDK</dt><dd>{version.sdk ?? '미보고'}</dd>
              <dt>컨트롤러</dt><dd>{version.controller ?? '미보고'}</dd>
            </>}
          </dl>
        </section>

        <section className="card control">
          <h2>조종권 · 명령</h2>
          {!state.connected && <p className="hint">연결 후 조종권을 잡을 수 있다</p>}
          {state.connected && (
            <>
              {mine
                ? <button type="button" onClick={() => run(() => datasource.releaseOwner(who))} disabled={busy}>
                    조종권 반납
                  </button>
                : <button type="button" className="primary" disabled={busy || !who}
                    title={who ? undefined : '헤더에 이름부터'}
                    onClick={() => run(() => datasource.claimOwner(who))}>
                    조종권 잡기 {state.owner && state.owner !== who ? `(현재 ${state.owner})` : ''}
                  </button>}
              {mine && !armed && (
                <div className="armrow">
                  <label className="confirm">
                    <input type="checkbox" checked={siteConfirmed}
                      onChange={(e) => setSiteConfirmed(e.target.checked)} />
                    현장에 사람이 있고 즉시 정지할 수 있다
                  </label>
                  <button type="button" className="arm" disabled={busy || !siteConfirmed}
                    onClick={() => run(() => datasource.arm(who))}>
                    ARM — 서보 ON
                  </button>
                </div>
              )}
              {mine && armed && (
                <button type="button" onClick={() => run(() => datasource.disarm(who))} disabled={busy}>
                  DISARM — 서보 OFF
                </button>
              )}
              {armed && mine && (
                <div className="jog">
                  {JOINT_LABELS.map((name, i) => (
                    <div key={name} className="jogrow">
                      <span>{name}</span>
                      <button type="button" onClick={() => datasource.jog(i, -JOG_STEP_DEG)}>−{JOG_STEP_DEG}°</button>
                      <button type="button" onClick={() => datasource.jog(i, +JOG_STEP_DEG)}>+{JOG_STEP_DEG}°</button>
                    </div>
                  ))}
                  <p className="hint">서버 상한 — 속도 10% · 관절 5°/회 (초과는 거부된다)</p>
                </div>
              )}
            </>
          )}
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
