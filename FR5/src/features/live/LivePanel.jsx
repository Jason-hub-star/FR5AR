// Live 패널 — 연결 진단 · 조종권/ARM · 6축/TCP 현재값 (FR5-IMPLEMENTATION-PLAN §화면 1).
//
// **3D 와 조작대(조그·그리퍼)는 여기 없다.** 둘 다 어느 탭에서도 살아 있어야 해서
// `main.jsx` 가 들고 있다 (계획 §레이아웃). 이 패널은 "로봇에 붙고 권한을 잡는" 일만 한다.
//
// 슬롯 편집·장기 그래프는 여기 넣지 않는다. 안전 판정은 전부 서버가 한다 —
// 이 화면의 disabled 는 편의지 안전장치가 아니다 (SAFETY-RULES 제2원칙).
import { useEffect, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';

const JOINT_LABELS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'];
const TCP_LABELS = ['x mm', 'y mm', 'z mm', 'rx °', 'ry °', 'rz °'];

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

  // 이름이 같아도 **토큰이 없으면 내 것이 아니다** — 그래야 다시 잡을 길이 열린다.
  // 이름만 보고 판단하면 새로고침 뒤 반납·DISARM 이 전부 거부되며 갇힌다 (2026-08-04 실측)
  const sameName = who && state.owner === who;
  const mine = sameName && datasource.hasOwnerToken();
  const armed = state.phase === 'ARMED' || state.phase === 'EXECUTING';

  return (
    <div className="live">
      <section className="card diag" data-t="diag">
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
        {lastRefusal && <p className="refusal" data-t="refusal"><b>거부됨</b> {lastRefusal}</p>}
        {state.phase === 'FAIL_CLOSED' && state.failReason
          && <p className="refusal" data-t="refusal"><b>FAIL_CLOSED</b> {state.failReason}</p>}
        <dl>
          <dt>WS 재연결</dt><dd className="ws-reconnects" data-t="ws-reconnects">{datasource.wsReconnects()}회</dd>
          {version && <>
            <dt>SDK</dt><dd>{version.sdk ?? '미보고'}</dd>
            <dt>컨트롤러</dt><dd>{version.controller ?? '미보고'}</dd>
          </>}
        </dl>
      </section>

      <section className="card control" data-t="control">
        <h2>조종권 · 명령</h2>
        {!state.connected && <p className="hint">연결하면 조종권을 잡을 수 있다.</p>}
        {state.connected && (
          <>
            {mine
              ? <button type="button" onClick={() => run(() => datasource.releaseOwner(who))} disabled={busy}>
                  조종권 반납
                </button>
              : <button type="button" className="primary" disabled={busy || !who}
                  data-t="claim" title={who ? undefined : '헤더에 이름부터'}
                  onClick={() => run(() => datasource.claimOwner(who))}>
                  {sameName ? '조종권 다시 잡기' : '조종권 잡기'}
                  {state.owner && state.owner !== who ? ` (현재 ${state.owner})` : ''}
                </button>}
            {sameName && !mine && (
              <p className="hint" data-t="token-lost">
                이름은 {who} 로 잡혀 있지만 이 창에는 토큰이 없다.
                다시 잡으면 새 토큰을 받는다.
              </p>
            )}
            {mine && !armed && (
              <div className="armrow">
                <label className="confirm" data-t="confirm">
                  <input type="checkbox" checked={siteConfirmed}
                    onChange={(e) => setSiteConfirmed(e.target.checked)} />
                  현장에 사람이 있고 즉시 정지할 수 있다
                </label>
                <button type="button" className="arm" data-t="arm" disabled={busy || !siteConfirmed}
                  onClick={() => run(() => datasource.arm(who))}>
                  ARM
                </button>
                <p className="hint">누르면 서보가 켜지고 아래 조작대가 열린다.</p>
              </div>
            )}
            {mine && armed && (
              <>
                <button type="button" onClick={() => run(() => datasource.disarm(who))} disabled={busy}>
                  DISARM
                </button>
                <p className="hint">누르면 서보가 꺼지고 조작대가 닫힌다.</p>
              </>
            )}
            {/* 모드 토글은 헤더 안전 바에, 조그·그리퍼는 아래 조작대에 있다 — 둘 다 상시다 */}
          </>
        )}
      </section>

      <section className="card">
        <h2>관절 (°)</h2>
        <table className="joints" data-t="joints"><tbody>
          {JOINT_LABELS.map((name, i) => (
            <tr key={name}><th>{name}</th>
              <td>{state.connected ? state.jointsDeg[i].toFixed(3) : '—'}</td></tr>
          ))}
        </tbody></table>
      </section>
      <section className="card">
        <h2>TCP (mm·°)</h2>
        <table className="tcp" data-t="tcp"><tbody>
          {TCP_LABELS.map((name, i) => (
            <tr key={name}><th>{name}</th>
              <td>{state.connected ? state.tcpMmDeg[i].toFixed(3) : '—'}</td></tr>
          ))}
        </tbody></table>
      </section>
    </div>
  );
}
